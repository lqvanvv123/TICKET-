const test = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const ExcelJS = require('exceljs');
const { Writable } = require('node:stream');
const deadlines = require('../public/js/deadlines');
const { parseDeadline, deadlineFilter } = require('../utils/deadline');
const { setDeadline } = require('../services/deadlines');
const { summarize, parseFilters, loadDashboard } = require('../services/dashboard');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const realtime = require('../utils/realtime');
const now = new Date('2026-11-05T03:00:00Z'); // 10:00 Việt Nam
const id = '100000000000000000000001';
const owner = '200000000000000000000001';
const staffId = '200000000000000000000002';
const admin = { id: '200000000000000000000003', username: 'Admin', role: 'admin' };
const due = new Date('2026-11-06T03:00:00Z');
const base = () => ({ _id: id, title: 'Máy in', description: 'Không in được', user: owner,
  assignedTo: staffId, status: Ticket.STATUS.NEW, dueAt: null, createdAt: now,
  priority: Ticket.PRIORITY.HIGH, requestType: Ticket.REQUEST_TYPE.HARDWARE, attachments: [] });
const chain = values => ({ select(){return this;}, populate(){return this;}, sort(){return this;}, lean:async()=>values });

test('deadline input follows Vietnam time and rejects impossible dates, past dates and non-text input', () => {
  assert.equal(parseDeadline('2026-11-06T10:00', now).toISOString(), due.toISOString());
  assert.equal(deadlines.inputValue(due), '2026-11-06T10:00');
  assert.equal(parseDeadline('', now), null);
  for (const value of [undefined, null, [], {$gt:''}, '2026-02-30T10:00', '2026-11-06T24:00',
    '2026-11-06T10:61', '2026-11-05T10:00', '2026-11-05T09:59', '2026-11-06', '2026-11-06T10:00Z']) {
    assert.throws(() => parseDeadline(value, now), {status:400}, String(value));
  }
});

test('deadline labels handle exact boundaries, legacy tickets and completed tickets without drifting over time', () => {
  const state = (extra, at = now) => deadlines.info({...base(),...extra},at).key;
  assert.equal(state({}), 'none');
  assert.equal(state({dueAt:now}), 'overdue');
  assert.equal(state({dueAt:new Date(now.getTime()+1)}), 'soon');
  assert.equal(state({dueAt:due}), 'soon');
  assert.equal(state({dueAt:new Date(due.getTime()+1)}), 'scheduled');
  assert.equal(state({status:Ticket.STATUS.DONE,dueAt:due,resolvedAt:due},new Date('2030-01-01')), 'on-time');
  assert.equal(state({status:Ticket.STATUS.DONE,dueAt:due,resolvedAt:new Date(due.getTime()+1)}), 'late');
  assert.equal(state({status:Ticket.STATUS.DONE,dueAt:due,resolvedAt:null}), 'closed');
});

test('deadline filters retain status/assignee conditions, exclude completed tickets and match 24-hour boundaries', () => {
  assert.deepEqual(deadlineFilter('none', now), {dueAt:null});
  assert.deepEqual(deadlineFilter('overdue', now).$and[1], {dueAt:{$ne:null,$lte:now}});
  const parsed = parseFilters({deadline:'soon',status:Ticket.STATUS.NEW,assignee:'mine'},admin,now);
  assert.equal(parsed.filter.status,Ticket.STATUS.NEW);
  assert.equal(parsed.filter.assignedTo,admin.id);
  assert.deepEqual(parsed.filter.$and,[{status:{$ne:Ticket.STATUS.DONE}},{dueAt:{$gt:now,$lte:due}}]);
  for(const value of ['bad',[],{},'toString']) assert.throws(()=>deadlineFilter(value,now),{status:400});
});

function fixture(t) {
  let state = base(), writes = [];
  t.mock.method(Ticket,'findById',async()=>({...state}));
  t.mock.method(Ticket,'findOneAndUpdate',async(filter,update)=>{
    writes.push({filter,update});
    state = {...state,...update.$set};
    return {...state};
  });
  const notify=t.mock.method(realtime,'notify',async()=>{});
  const events=[];
  t.mock.method(realtime,'toAdmins',(event,payload)=>events.push({event,payload}));
  t.mock.method(realtime,'toUser',()=>{});
  return {writes,notify,events,get state(){return state;},set state(value){state=value;}};
}

test('staff and users cannot change deadlines, including their own assigned tickets', async t => {
  const f=fixture(t);
  for(const role of ['staff','user']) await assert.rejects(setDeadline(id,'2026-11-06T10:00',{id:staffId,role},now),{status:403});
  assert.equal(f.writes.length,0);
});

test('admin sets, changes and clears deadlines with atomic history, notifications and realtime updates', async t => {
  const f=fixture(t);
  await setDeadline(id,'2026-11-06T10:00',admin,now);
  assert.equal(f.state.dueAt.toISOString(),due.toISOString());
  assert.deepEqual(f.writes[0].filter,{_id:id,status:Ticket.STATUS.NEW,dueAt:null});
  assert.equal(f.writes[0].update.$push.deadlineHistory.changedBy,admin.id);
  assert.equal(f.writes[0].update.$push.deadlineHistory.from,null);
  assert.equal(f.events[0].event,'ticket:deadline');
  assert.deepEqual(f.notify.mock.calls[0].arguments[0],[owner,staffId]);
  await setDeadline(id,'2026-11-07T10:00',admin,now);
  assert.equal(f.writes[1].filter.dueAt.toISOString(),due.toISOString());
  await setDeadline(id,'',admin,now);
  assert.equal(f.state.dueAt,null);
  assert.equal(f.writes[2].update.$push.deadlineHistory.to,null);
  await setDeadline(id,'',admin,now);
  assert.equal(f.writes.length,3); // Không ghi lịch sử/thông báo nếu không thay đổi.
});

test('completed, missing, invalid and concurrently changed tickets cannot have their deadlines overwritten', async t => {
  const f=fixture(t);
  f.state={...base(),status:Ticket.STATUS.DONE};
  await assert.rejects(setDeadline(id,'2026-11-06T10:00',admin,now),{status:409});
  await assert.rejects(setDeadline('invalid','2026-11-06T10:00',admin,now),{status:400});
  Ticket.findById.mock.mockImplementation(async()=>null);
  await assert.rejects(setDeadline(id,'2026-11-06T10:00',admin,now),{status:404});
  Ticket.findById.mock.mockImplementation(async()=>base());
  Ticket.findOneAndUpdate.mock.mockImplementation(async()=>null);
  await assert.rejects(setDeadline(id,'2026-11-06T10:00',admin,now),{status:409});
  assert.equal(f.notify.mock.callCount(),0);
});

test('a notification failure does not turn a successfully saved deadline into a failed operation', async t => {
  const f=fixture(t);
  realtime.notify.mock.mockImplementation(async()=>{throw Error('Notification unavailable');});
  const log=t.mock.method(console,'error',()=>{});
  const ticket=await setDeadline(id,'2026-11-06T10:00',admin,now);
  assert.equal(ticket.dueAt.toISOString(),due.toISOString());
  assert.equal(f.writes.length,1); assert.equal(log.mock.callCount(),1);
});

test('dashboard counts only open deadline warnings and preserves deadline filters in export links', async t => {
  const tickets=[{...base(),dueAt:now},{...base(),dueAt:due},{...base(),dueAt:now,status:Ticket.STATUS.DONE},base()];
  const data=summarize(tickets,[],parseFilters({},admin,now).filters,now);
  assert.equal(data.overdue,1); assert.equal(data.dueSoon,1);
  let query,fields;
  t.mock.method(Ticket,'find',value=>{query=value;const c=chain(tickets);c.select=value=>{fields=value;return c;};return c;});
  t.mock.method(User,'find',()=>chain([]));
  const result=await loadDashboard({deadline:'overdue'},admin,now);
  assert(fields.includes('dueAt')); assert(query.$and);
  assert(result.exportUrl.includes('deadline=overdue'));
  assert(result.dashboardUrl({priority:''}).includes('deadline=overdue'));
});

test('detail HTML keeps body data intact and only admins get deadline controls; history is escaped', async () => {
  const ticket={...base(),createdAt:now,updatedAt:now,dueAt:due,
    deadlineHistory:[{from:null,to:due,changedByName:'<script>x</script>',changedAt:now}]};
  const common={ticket,deadlines,admins:[],message:null,uiFlash:'Đã lưu',STATUS:Ticket.STATUS,
    STATUS_SLUG:Ticket.STATUS_SLUG,PRIORITY_SLUG:Ticket.PRIORITY_SLUG};
  for(const role of ['admin','staff','user']) {
    const html=await ejs.renderFile('views/ticket-detail.ejs',{...common,user:{...admin,role}});
    assert(html.includes('data-ticket-detail="'+id+'"'));
    assert.equal(html.includes('data-deadline-form'),role==='admin');
    assert(html.includes('&lt;script&gt;x&lt;/script&gt;'));
    assert(!html.includes('<script>x</script>'));
    assert(html.includes('deadlineHint') === (role === 'admin'));
  }
  const html=await ejs.renderFile('views/ticket-detail.ejs',{...common,ticket:{...ticket,status:Ticket.STATUS.DONE},user:admin});
  assert(!html.includes('data-deadline-form'));
});

test('deadline route supports JSON and regular form submissions', async t => {
  fixture(t);
  const handler=require('../routes/tickets').stack.find(layer=>layer.route?.path==='/tickets/:id/deadline').route.stack.at(-1).handle;
  for(const json of [true,false]) {
    const res={locals:{account:admin},json(value){this.data=value;},redirect(value){this.url=value;}};
    let error;
    await handler({params:{id},body:{dueAt:'2099-11-06T10:00'},get:()=>json?'application/json':'text/html'},res,value=>{error=value;});
    assert.ifError(error);
    if(json)assert.equal(res.data.ok,true);else assert.equal(res.url,'/tickets/'+id+'?deadlineSaved=1');
  }
});

test('Excel report includes Vietnam deadline, deadline status and the same filter as Dashboard', async t => {
  let query;
  t.mock.method(Ticket,'find',value=>{query=value;return chain([{...base(),dueAt:new Date('2020-01-01T03:00:00Z')}]);});
  const chunks=[];
  const res=new Writable({write(chunk,encoding,callback){chunks.push(Buffer.from(chunk));callback();}});
  res.setHeader=()=>{};
  const handler=require('../routes/export').stack.find(layer=>layer.route?.path==='/admin/export/tickets.xlsx').route.stack.at(-1).handle;
  await handler({query:{deadline:'overdue'},session:{user:admin}},res);
  assert(query.$and);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.concat(chunks));
  assert.equal(workbook.worksheets[0].getCell('M2').value.toISOString(),'2020-01-01T10:00:00.000Z');
  assert.equal(workbook.worksheets[0].getCell('N2').value,'Quá hạn');
  assert(workbook.worksheets[1].getCell('B4').value.includes('Quá hạn'));
});

test('PDF report supports the deadline filter and still generates a real attachment', async t => {
  let query;
  t.mock.method(Ticket,'find',value=>{query=value;return chain([{...base(),dueAt:new Date('2020-01-01T03:00:00Z')}]);});
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(bytes){this.bytes=bytes;}};
  const handler=require('../routes/export').stack.find(layer=>layer.route?.path==='/admin/export/tickets.pdf').route.stack.at(-1).handle;
  await handler({path:'/admin/export/tickets.pdf',query:{deadline:'overdue'},session:{user:admin}},res);
  assert(query.$and); assert.equal(res.headers['Content-Type'],'application/pdf');
  assert.equal(res.bytes.subarray(0,5).toString(),'%PDF-');
});
