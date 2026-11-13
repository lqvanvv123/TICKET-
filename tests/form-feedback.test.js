const test = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const { authErrors, ticketErrors } = require('../utils/validation');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const Notification = require('../models/Notification');

function response() {
  return { code: 200, status(code) { this.code = code; return this; },
    render(view, locals) { this.view = view; this.locals = locals; } };
}
test('server validation rejects whitespace, short passwords and mismatches', () => {
  assert(authErrors({username:'   ',password:''}).username);
  assert(authErrors({username:'test',password:'123',confirmPassword:'456'},true).password);
  assert(authErrors({username:'test',password:'123456',confirmPassword:'abcdef'},true).confirmPassword);
  assert.deepEqual(authErrors({username:'test',password:'123456',confirmPassword:'123456'},true),{});
  assert.deepEqual(Object.keys(ticketErrors({title:' ',description:' '})),['title','description']);
});
test('register returns field errors and preserves username without returning passwords', async () => {
  const router = require('../routes/auth');
  const handler = router.stack.find(x=>x.route?.path==='/register' && x.route.methods.post).route.stack[0].handle;
  const res = response();
  await handler({body:{username:'  An  ',password:'abc',confirmPassword:'xyz'}},res);
  assert.equal(res.code,422);
  assert.equal(res.locals.formValues.username,'An');
  assert(res.locals.fieldErrors.password);
  assert.equal(res.locals.formValues.password,undefined);
});
test('duplicate username gets a specific server field error', async t => {
  t.mock.method(User,'findOne',async()=>({_id:'existing'}));
  const handler = require('../routes/auth').stack.find(x=>x.route?.path==='/register' && x.route.methods.post).route.stack[0].handle;
  const res=response();
  await handler({body:{username:'existing',password:'secret123',confirmPassword:'secret123'}},res);
  assert.equal(res.code,422); assert(res.locals.fieldErrors.username);
});
test('ticket server validation preserves draft and does not create an empty ticket', async t => {
  const chain = value => ({ populate(){return this;}, sort(){return this;}, limit(){return Promise.resolve(value);}, then(resolve){return Promise.resolve(value).then(resolve);} });
  t.mock.method(Ticket,'find',()=>chain([]));
  t.mock.method(Notification,'find',()=>chain([]));
  const create = t.mock.method(Ticket,'create',async()=>{throw Error('Must not create');});
  const route=require('../routes/user').stack.find(x=>x.route?.path==='/user/ticket').route;
  const res=response();
  await route.stack.at(-1).handle({session:{user:{id:'user'}},query:{},files:[],body:{title:' ',description:'Keep this description'}},res,error=>{throw error;});
  assert.equal(res.code,422); assert(res.locals.fieldErrors.title);
  assert.equal(res.locals.formValues.description,'Keep this description');
  assert.equal(create.mock.callCount(),0);
});
test('auth templates escape preserved values and render field errors', async () => {
  const html=await ejs.renderFile('views/register.ejs',{error:'Kiểm tra dữ liệu',fieldErrors:{username:'Tên đã tồn tại'},formValues:{username:'<script>alert(1)</script>'}});
  assert(html.includes('&lt;script&gt;'));
  assert(html.includes('data-field-error="username"'));
  assert(!html.includes('value="<script>'));
  assert(html.includes('/js/ui.js'));
});
