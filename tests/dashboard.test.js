const test = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const { Writable } = require('node:stream');
const ExcelJS = require('exceljs');
const { dayKey, parseFilters, summarize, loadDashboard } = require('../services/dashboard');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const now = new Date('2026-10-26T12:00:00Z');
const staffId = '200000000000000000000001';
const user = { id: staffId, username: 'IT One', role: 'admin' };
const team = [{ _id: staffId, username: 'IT One', role: 'staff' }];
const make = (id, extra = {}) => ({ _id: '10000000000000000000000' + id, title: 'Printer ' + id,
  user: {username: 'Requester'}, status: Ticket.STATUS.NEW, priority: Ticket.PRIORITY.MEDIUM,
  requestType: Ticket.REQUEST_TYPE.HARDWARE, createdAt: new Date('2026-10-25T04:00:00Z'),
  assignedTo: null, ...extra });
const chain = result => ({ select() { return this; }, populate() { return this; }, sort() { return this; }, lean: async () => result });

test('day buckets and inclusive date ranges follow Vietnam time', () => {
  assert.equal(dayKey('2026-10-25T17:00:00Z'), '2026-10-26');
  const { filter } = parseFilters({ range: 'custom', from: '2026-10-26', to: '2026-10-26' }, user, now);
  assert.equal(filter.createdAt.$gte.toISOString(), '2026-10-25T17:00:00.000Z');
  assert.equal(filter.createdAt.$lt.toISOString(), '2026-10-26T17:00:00.000Z');
  const preset = parseFilters({range:'7'},user,now);
  assert.equal(preset.filters.from,'2026-10-20'); assert.equal(preset.filters.to,'2026-10-26');
});
test('invalid, reversed and excessive custom dates are rejected', () => {
  for (const query of [
    {range:'custom',from:'2026-02-30',to:'2026-03-01'},
    {range:'custom',from:'2026-10-26',to:'2026-10-25'},
    {range:'custom',from:'2024-01-01',to:'2026-01-01'},
    {range:'custom',from:'',to:''}, {range:'bad'}, {assignee:{$ne:null}},
    {status:'invalid'}, {priority:[]}, {type:'invalid'},
  ]) assert.throws(()=>parseFilters(query,user,now), {status:400});
});
test('assignee and open-state filters become database conditions', () => {
  const {filter} = parseFilters({status:'open',assignee:'mine',priority:Ticket.PRIORITY.URGENT},user,now);
  assert.deepEqual(filter.status,{$ne:Ticket.STATUS.DONE}); assert.equal(filter.assignedTo,staffId);
  assert.equal(parseFilters({assignee:'unassigned'},user,now).filter.assignedTo,null);
  assert.equal(String(parseFilters({assignee:staffId},user,now).filter.assignedTo),staffId);
});
test('summary distinguishes open, urgent, unassigned and valid resolution durations', () => {
  const tickets=[make(1),make(2,{status:Ticket.STATUS.IN_PROGRESS,priority:Ticket.PRIORITY.URGENT,assignedTo:team[0]}),
    make(3,{status:Ticket.STATUS.DONE,assignedTo:team[0],resolvedAt:new Date('2026-10-25T06:00:00Z')}),
    make(4,{status:Ticket.STATUS.DONE,priority:Ticket.PRIORITY.URGENT,resolvedAt:new Date('2026-10-24T06:00:00Z')})];
  const data=summarize(tickets,team,parseFilters({},user,now).filters,now);
  assert.equal(data.total,4); assert.equal(data.openCount,2); assert.equal(data.unassigned,1);
  assert.equal(data.urgentOpen,1); assert.equal(data.completionRate,50); assert.equal(data.avgResolutionHours,2);
  assert.equal(data.workload[0].open,1); assert.equal(data.workload[0].done,1);
  assert.equal(data.chartData.trend.labels.length,14);
});
test('attention list sorts priority first then oldest, and excludes completed tickets', () => {
  const tickets=[make(1,{priority:Ticket.PRIORITY.LOW}),make(2,{priority:Ticket.PRIORITY.URGENT}),
    make(3,{priority:Ticket.PRIORITY.URGENT,createdAt:new Date('2026-10-24')}),
    make(4,{priority:Ticket.PRIORITY.URGENT,status:Ticket.STATUS.DONE})];
  const data=summarize(tickets,team,parseFilters({},user,now).filters,now);
  assert.deepEqual(data.attention.map(t=>t._id),[tickets[2]._id,tickets[1]._id,tickets[0]._id]);
});
test('empty results and Vietnam-midnight chart counts are correct', () => {
  const filters=parseFilters({range:'custom',from:'2026-10-26',to:'2026-10-26'},user,now).filters;
  const empty=summarize([],team,filters,now);
  assert.equal(empty.completionRate,0); assert.equal(empty.avgResolutionHours,null); assert.equal(empty.workload[0].total,0);
  const data=summarize([make(1,{createdAt:new Date('2026-10-25T17:01:00Z')})],team,filters,now);
  assert.deepEqual(data.chartData.trend.counts,[1]);
});
test('dashboard links preserve filters and rendered ticket names are escaped', async t => {
  t.mock.method(Ticket,'find',()=>chain([make(1,{title:'<script>alert(1)</script>'})]));
  t.mock.method(User,'find',()=>chain(team));
  const data=await loadDashboard({range:'7',assignee:'mine'},user,now);
  const url=new URL(data.dashboardUrl({status:Ticket.STATUS.NEW}),'http://localhost');
  assert.equal(url.searchParams.get('range'),'7'); assert.equal(url.searchParams.get('assignee'),'mine');
  const html=await ejs.renderFile('views/admin-dashboard.ejs',{...data,user,notifications:[],activeTab:'dashboard',filterError:null,
    STATUS:Ticket.STATUS,STATUS_SLUG:Ticket.STATUS_SLUG,PRIORITY:Ticket.PRIORITY,PRIORITY_SLUG:Ticket.PRIORITY_SLUG,REQUEST_TYPE:Ticket.REQUEST_TYPE});
  assert(html.includes('&lt;script&gt;')); assert(!html.includes('<script>alert(1)</script>'));
  assert(html.includes('dashboardFilters')); assert(html.includes(data.exportUrl.replaceAll('&','&amp;')));
  const staffHtml=await ejs.renderFile('views/partials/dashboard-content.ejs',{...data,user:{...user,role:'staff'},
    STATUS:Ticket.STATUS,STATUS_SLUG:Ticket.STATUS_SLUG,PRIORITY:Ticket.PRIORITY,PRIORITY_SLUG:Ticket.PRIORITY_SLUG});
  assert(!staffHtml.includes('dashboard-export'));
});
test('dashboard page and data API keep role restrictions; invalid API filter returns JSON', async () => {
  const router=require('../routes/admin');
  for(const path of ['/admin/dashboard','/admin/dashboard/data']){
    const route=router.stack.find(layer=>layer.route?.path===path).route;
    for(const role of ['user','staff','admin']){
      let passed=false,code;
      route.stack[1].handle({session:{user:{role}}},{status(n){code=n;return this;},send(){}},()=>{passed=true;});
      assert.equal(passed,role!=='user'); if(role==='user')assert.equal(code,403);
    }
  }
  const handler=router.stack.find(layer=>layer.route?.path==='/admin/dashboard/data').route.stack.at(-1).handle;
  const res={status(n){this.code=n;return this;},json(data){this.data=data;}};
  await handler({query:{range:'bad'},session:{user}},res);
  assert.equal(res.code,400); assert.equal(res.data.ok,false);
});
test('Excel export applies dashboard open and assignee filters to its data', async t => {
  let query;
  t.mock.method(Ticket,'find',filter=>{query=filter;return chain([make(1,{assignedTo:team[0]})]);});
  const handler=require('../routes/export').stack.find(layer=>layer.route?.path==='/admin/export/tickets.xlsx').route.stack.at(-1).handle;
  const chunks=[];
  const res=new Writable({write(chunk,encoding,callback){chunks.push(Buffer.from(chunk));callback();}});
  res.setHeader=()=>{};
  await handler({query:{status:'open',assignee:'mine'},session:{user}},res);
  assert.deepEqual(query.status,{$ne:Ticket.STATUS.DONE}); assert.equal(query.assignedTo,staffId);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.concat(chunks));
  assert.equal(workbook.worksheets[0].getCell('L2').value,'IT One');
});
