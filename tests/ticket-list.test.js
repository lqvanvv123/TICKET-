const test = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const ExcelJS = require('exceljs');
const {Writable} = require('node:stream');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Notification = require('../models/Notification');
const {parseTicketFilters,parsePagination} = require('../utils/ticket-filters');
const {loadTicketList,listMetadata} = require('../services/ticket-list');
const deadlines = require('../public/js/deadlines');
const user = {id:'200000000000000000000001',username:'Admin IT',role:'admin'};
const now = new Date('2026-11-06T03:00:00Z');
const make = n => ({_id:'100000000000000000'+String(n).padStart(6,'0'),title:'Máy in '+n,description:'Mô tả riêng',
  user:{username:'Người gửi'},status:Ticket.STATUS.NEW,priority:Ticket.PRIORITY.HIGH,
  requestType:Ticket.REQUEST_TYPE.HARDWARE,createdAt:now,dueAt:null,assignedTo:null,attachments:[]});
const route = url => require('../routes/admin').stack.find(layer=>layer.route?.path===url).route;
const chain = values => ({select(){return this;},sort(){return this;},populate(){return this;},limit(){return this;},
  lean:async()=>values,then(resolve,reject){return Promise.resolve(values).then(resolve,reject);}});

test('search treats special characters as literal text and searches the displayed code suffix or full ID', () => {
  const text='Máy [A].*';
  const filter=parseTicketFilters({q:text},user,now).filter;
  const regex=new RegExp(filter.$or[0].title.$regex,'i');
  assert(regex.test('Lỗi máy [A].*')); assert(!regex.test('Máy AXYZ'));
  const suffix=parseTicketFilters({q:'#ABCDEF'},user,now).filter;
  assert.deepEqual(suffix.$or[1],{$expr:{$eq:[{$substrBytes:[{$toString:'$_id'},18,6]},'abcdef']}});
  assert.doesNotThrow(()=>Ticket.find(suffix).cast(Ticket));
  const full=parseTicketFilters({q:'#'+make(1)._id},user,now).filter;
  assert.equal(String(full.$or[1]._id),make(1)._id);
});

test('combined filters, legacy assignee links and inclusive Vietnam dates stay independent', () => {
  const {filters,filter}=parseTicketFilters({assignment:'mine',status:'open',priority:Ticket.PRIORITY.HIGH,
    type:Ticket.REQUEST_TYPE.HARDWARE,deadline:'overdue',from:'2026-11-06',to:'2026-11-06'},user,now);
  assert.equal(filters.assignee,'mine');assert.equal(filter.assignedTo,user.id);
  assert.deepEqual(filter.status,{$ne:Ticket.STATUS.DONE});assert(filter.$and);
  assert.equal(filter.createdAt.$gte.toISOString(),'2026-11-05T17:00:00.000Z');
  assert.equal(filter.createdAt.$lte.toISOString(),'2026-11-06T16:59:59.999Z');
  assert.equal(parseTicketFilters({assignee:'unassigned'},user).filter.assignedTo,null);
  assert.equal(String(parseTicketFilters({assignee:user.id},user).filter.assignedTo),user.id);
});

test('malformed, injected and impossible filter values are rejected before querying', () => {
  for(const query of [{q:{$ne:''}},{q:['a','b']},{q:'x'.repeat(101)},{status:'bad'},{priority:'bad'},
    {type:'bad'},{assignee:{$ne:null}},{assignee:'bad'},{assignment:'bad'},
    {deadline:'bad'},{from:'2026-02-30'},{from:'2026-11-07',to:'2026-11-06'},{to:'2026-11-06T12:00'}]) {
    assert.throws(()=>parseTicketFilters(query,user,now),{status:400});
  }
  for(const query of [{page:'0'},{page:'1.2'},{page:'-1'},{page:['1','2']},{pageSize:'100'},{pageSize:'0'},{pageSize:{$gt:0}}])assert.throws(()=>parsePagination(query),{status:400});
  assert.deepEqual(parsePagination({}),{page:1,pageSize:20});
  assert.deepEqual(parsePagination({page:'2',pageSize:'50'}),{page:2,pageSize:50});
});

test('pagination queries only the current page, uses stable sorting and clamps deleted last pages', async t => {
  let total=43,skip,limit,sort,countFilter,findFilter;
  t.mock.method(Ticket,'countDocuments',async filter=>{countFilter=filter;return total;});
  t.mock.method(User,'find',()=>chain([]));
  t.mock.method(Ticket,'find',filter=>{findFilter=filter;const c=chain([make(1)]);
    c.sort=value=>{sort=value;return c;};c.skip=value=>{skip=value;return c;};c.limit=value=>{limit=value;return c;};return c;});
  let data=await loadTicketList({q:'Máy',page:'2'},user,now);
  assert.equal(skip,20);assert.equal(limit,20);assert.deepEqual(sort,{createdAt:-1,_id:-1});
  assert.deepEqual(countFilter,findFilter);assert.equal(data.pagination.total,43);
  assert.equal(data.pagination.from,21);assert.equal(data.pagination.to,40);
  total=20;data=await loadTicketList({page:'3'},user,now);
  assert.equal(data.pagination.page,1);assert.equal(skip,0);
  total=0;data=await loadTicketList({page:'999'},user,now);
  assert.deepEqual(data.pagination,{total:0,page:1,pages:1,pageSize:20,from:0,to:0});
});

test('pagination and filter-chip links preserve filters while report links omit pagination', () => {
  const filters=parseTicketFilters({q:'Máy in',assignee:'mine',deadline:'soon',status:'open'},user,now).filters;
  const data=listMetadata(filters,{page:2,pages:3,pageSize:20,total:45,from:21,to:40});
  const next=new URL(data.filterUrl(3),'http://localhost');
  assert.equal(next.searchParams.get('q'),'Máy in');assert.equal(next.searchParams.get('page'),'3');
  const report=new URL(data.exportUrl,'http://localhost');
  assert.equal(report.searchParams.get('deadline'),'soon');assert.equal(report.searchParams.get('assignee'),'mine');
  assert.equal(report.searchParams.get('page'),null);assert.equal(report.searchParams.get('pageSize'),null);
  const removed=new URL(data.activeFilters.find(item=>item.label.startsWith('Tìm kiếm')).removeUrl,'http://localhost');
  assert.equal(removed.searchParams.get('q'),null);assert.equal(removed.searchParams.get('assignee'),'mine');assert.equal(removed.searchParams.get('page'),'1');
});

test('list renders one filter form, six columns, escaped values, pagination and admin-only report actions', async () => {
  const filters=parseTicketFilters({q:'<script>x</script>',priority:Ticket.PRIORITY.HIGH},user,now).filters;
  const metadata=listMetadata(filters,{page:2,pages:3,pageSize:20,total:45,from:21,to:40});
  const ticket={...make(1),title:'<script>title</script>'};
  const locals={...metadata,tickets:[ticket],deadlines,filterError:null,notifications:[],activeTab:'list',
    STATUS:Ticket.STATUS,STATUS_SLUG:Ticket.STATUS_SLUG,PRIORITY:Ticket.PRIORITY,PRIORITY_SLUG:Ticket.PRIORITY_SLUG,REQUEST_TYPE:Ticket.REQUEST_TYPE};
  for(const role of ['admin','staff']) {
    const html=await ejs.renderFile('views/admin.ejs',{...locals,user:{...user,role}});
    assert.equal((html.match(/id="ticketFilters"/g)||[]).length,1);
    assert.equal((html.match(/scope="col"/g)||[]).length,6);
    assert(!html.includes('export-bar'));assert(!html.includes('Mô tả riêng'));
    assert(html.includes('&lt;script&gt;title&lt;/script&gt;'));
    assert(!html.includes('<script>title</script>'));
    assert.equal(html.includes('ticket-export-menu'),role==='admin');
    assert(html.includes('21–40 / 45'));assert(html.includes('aria-current="page"'));
    assert(html.includes('ticket-permission-hint') === (role==='staff'));
  }
});

test('list and list-data endpoints preserve admin/staff guards; bad API filters do not query data', async t => {
  for(const url of ['/admin','/admin/tickets/data'])for(const role of ['admin','staff','user']) {
    let passed=false,code;
    route(url).stack[1].handle({session:{user:{role}}},{status(value){code=value;return this;},send(){}},()=>{passed=true;});
    assert.equal(passed,role!=='user');if(role==='user')assert.equal(code,403);
  }
  const count=t.mock.method(Ticket,'countDocuments',async()=>{throw Error('Must not query');});
  const res={status(value){this.code=value;return this;},json(value){this.data=value;}};
  await route('/admin/tickets/data').stack.at(-1).handle({query:{q:{$ne:''}},session:{user}},res);
  assert.equal(res.code,400);assert.equal(res.data.ok,false);assert.equal(count.mock.callCount(),0);
});

test('bad HTML filters return an explicit error with report actions hidden, rather than exporting all data', async t => {
  t.mock.method(Notification,'find',()=>chain([]));
  const res={status(value){this.code=value;return this;},render(view,locals){this.locals=locals;}};
  let error;
  await route('/admin').stack.at(-1).handle({query:{from:'2026-02-30'},session:{user}},res,value=>{error=value;});
  assert.ifError(error);assert.equal(res.code,400);assert(res.locals.filterError);
  const html=await ejs.renderFile('views/admin.ejs',res.locals);
  assert(html.includes('data-filter-invalid="true"'));assert(!html.includes('ticket-export-menu'));
});

test('Excel and PDF use the same combined search filter as the list and export every matching row', async t => {
  const query={q:'Máy',status:Ticket.STATUS.NEW,priority:Ticket.PRIORITY.HIGH,type:Ticket.REQUEST_TYPE.HARDWARE,
    assignee:'mine',deadline:'none',from:'2026-11-06',to:'2026-11-06',page:'2',pageSize:'20'};
  const expected=parseTicketFilters(query,user,now).filter;
  const rows=Array.from({length:23},(_,i)=>make(i));let actual;
  t.mock.method(Ticket,'find',filter=>{actual=filter;return chain(rows);});
  const router=require('../routes/export');
  const chunks=[];const res=new Writable({write(chunk,encoding,callback){chunks.push(Buffer.from(chunk));callback();}});res.setHeader=()=>{};
  await router.stack.find(layer=>layer.route?.path==='/admin/export/tickets.xlsx').route.stack.at(-1).handle({query,session:{user}},res);
  assert.deepEqual(actual,expected);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.concat(chunks));
  assert.equal(workbook.worksheets[0].rowCount,24);
  assert(workbook.worksheets[1].getCell('B4').value.includes('Tìm kiếm: Máy'));
  const pdf={setHeader(){},end(bytes){this.bytes=bytes;}};
  await router.stack.find(layer=>layer.route?.path==='/admin/export/tickets.pdf').route.stack.at(-1).handle({query,path:'/admin/export/tickets.pdf',session:{user}},pdf);
  assert.deepEqual(actual,expected);assert.equal(pdf.bytes.subarray(0,5).toString(),'%PDF-');
});

test('invalid download filters return 400 before querying or creating a report', async t => {
  const find=t.mock.method(Ticket,'find',()=>{throw Error('Must not query');});
  t.mock.method(console,'error',()=>{});
  const router=require('../routes/export');
  for(const kind of ['xlsx','pdf']) {
    const res={status(code){this.code=code;return this;},send(message){this.message=message;}};
    await router.stack.find(layer=>layer.route?.path==='/admin/export/tickets.'+kind).route.stack.at(-1).handle({query:{from:'2026-02-30'},session:{user}},res);
    assert.equal(res.code,400);assert(res.message.includes('Ngày lọc'));
  }
  assert.equal(find.mock.callCount(),0);
});
