const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const fs = require('node:fs');
const path = require('node:path');
const fontkit = require('fontkit');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const router = require('../routes/export');
const { createPdfReport, displayValue } = require('../utils/pdf-report');
const me = '200000000000000000000001';
const user = { id: me, username: 'Nguyễn Văn An', role: 'admin' };
const chain = values => ({ populate(){ return this; }, sort(){ return this; }, lean: async () => values });
function response() {
  return { headers: {}, setHeader(name,value){ this.headers[name]=value; },
    end(bytes){ this.bytes=bytes; }, status(code){ this.code=code; return this; }, send(message){ this.message=message; } };
}
const handler = kind => router.stack.find(layer => layer.route?.path === '/admin/export/' + kind + '.pdf').route.stack.at(-1).handle;

test('PDF endpoints only allow admins', () => {
  for(const kind of ['tickets','users']){
    const route=router.stack.find(layer=>layer.route?.path==='/admin/export/'+kind+'.pdf').route;
    for(const role of ['user','staff','admin']){
      let passed=false,code;
      route.stack[1].handle({session:{user:{role}}},{status(value){code=value;return this;},send(){}},()=>{passed=true;});
      assert.equal(passed,role==='admin'); if(role!=='admin')assert.equal(code,403);
    }
  }
});
test('ticket PDF preserves Dashboard filters and sends a real PDF attachment', async t => {
  let filter;
  t.mock.method(Ticket,'find',value=>{filter=value;return chain([{_id:'100000000000000000000001',
    title:'Máy in bị lỗi',description:'Không in được tiếng Việt',priority:Ticket.PRIORITY.URGENT,
    status:Ticket.STATUS.IN_PROGRESS,requestType:Ticket.REQUEST_TYPE.HARDWARE,
    user:{username:'Người gửi'},assignedTo:{username:user.username},createdAt:new Date('2026-10-29T03:00:00Z'),attachments:[]}]);});
  const res=response();
  await handler('tickets')({path:'/admin/export/tickets.pdf',query:{status:'open',assignee:'mine',from:'2026-10-29',to:'2026-10-29'},session:{user}},res);
  assert.equal(filter.assignedTo,me);assert.deepEqual(filter.status,{$ne:Ticket.STATUS.DONE});
  assert.equal(filter.createdAt.$gte.toISOString(),'2026-10-28T17:00:00.000Z');
  assert.equal(res.headers['Content-Type'],'application/pdf');assert.match(res.headers['Content-Disposition'],/\.pdf"$/);
  assert.equal(res.bytes.subarray(0,5).toString(),'%PDF-');assert(res.bytes.includes(Buffer.from('/ToUnicode')));
});
test('users PDF applies search/role filters and never selects passwords', async t => {
  let filter,projection;
  t.mock.method(User,'find',(value,fields)=>{filter=value;projection=fields;return chain([{username:'Bình',role:'staff',_id:me,createdAt:new Date()}]);});
  t.mock.method(Ticket,'aggregate',async()=>[{_id:me,total:2,open:1}]);
  const res=response();await handler('users')({path:'/admin/export/users.pdf',query:{q:'Bình',role:'staff'},session:{user}},res);
  assert.equal(filter.role,'staff');assert(filter.username);assert(!projection.includes('password'));
  assert.equal(res.headers['Content-Type'],'application/pdf');assert.equal(res.bytes.subarray(0,5).toString(),'%PDF-');
});
test('empty reports and descriptions spanning multiple pages produce valid PDFs', async () => {
  const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Yêu cầu');
  sheet.addRow(['Mã','Mô tả']);
  const empty=await createPdfReport(workbook,{title:'Báo cáo trống',username:user.username});
  assert.equal(empty.subarray(0,5).toString(),'%PDF-');
  sheet.addRow(['#001','Mô tả lỗi tiếng Việt có dấu. '.repeat(900)]);
  const long=await createPdfReport(workbook,{title:'Báo cáo nhiều trang',username:user.username});
  assert(long.length>empty.length);
  assert((long.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>1);
  assert(long.includes(Buffer.from('/FontFile2')));
});
test('embedded font covers Vietnamese and workbook dates keep Vietnam time', () => {
  const font=fontkit.create(fs.readFileSync(path.join(__dirname,'../assets/fonts/NotoSans-Regular.ttf')));
  for(const letter of 'Đặng Nguyễn Trần Ắấệỡự')assert(font.hasGlyphForCodePoint(letter.codePointAt(0)),letter);
  assert(displayValue({value:new Date('2026-10-29T10:00:00Z')} ).includes('10:00'));
  assert.equal(displayValue({value:{formula:'COUNTIF(A:A,"x")',result:0}}),'0');
});
