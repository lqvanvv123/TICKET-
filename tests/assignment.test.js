const test = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const realtime = require('../utils/realtime');
const { assignTicket, getTicket, releaseAssignments } = require('../services/tickets');

const id = '100000000000000000000001';
const staffId = '200000000000000000000001';
const otherId = '200000000000000000000002';
const ownerId = '300000000000000000000001';
const admin = { id: '400000000000000000000001', username: 'Admin', role: 'admin' };
const staff = { id: staffId, username: 'IT One', role: 'staff' };

function fixture(t, assignedTo = null) {
  const state = { _id: id, user: ownerId, title: 'Printer', assignedTo,
    status: Ticket.STATUS.NEW, resolvedAt: null, statusHistory: [], assignmentHistory: [] };
  const events = [], notices = [];
  t.mock.method(User, 'findOne', (filter) => ({ select: async () =>
    [staffId, otherId, admin.id].includes(String(filter._id))
      ? { _id: filter._id, username: String(filter._id) === staffId ? 'IT One' : 'IT Two' } : null }));
  t.mock.method(Ticket, 'findById', async () => ({ ...state }));
  t.mock.method(Ticket, 'findOneAndUpdate', async (filter, update) => {
    if (String(filter.assignedTo || '') !== String(state.assignedTo || '')) return null;
    if (filter.status !== state.status) return null;
    Object.assign(state, update.$set);
    state.assignmentHistory.push(update.$push.assignmentHistory);
    if (update.$push.statusHistory) state.statusHistory.push(update.$push.statusHistory);
    return { ...state };
  });
  t.mock.method(realtime, 'toAdmins', (event, payload) => events.push({ event, payload }));
  t.mock.method(realtime, 'toUser', () => {});
  t.mock.method(realtime, 'notify', async (...args) => notices.push(args));
  return { state, events, notices };
}

test('staff claims an unassigned ticket, records history and notifies owner and assignee', async t => {
  const { state, events, notices } = fixture(t);
  await assignTicket(id, staffId, staff);
  assert.equal(state.assignedTo, staffId);
  assert.equal(state.status, Ticket.STATUS.IN_PROGRESS);
  assert.equal(state.statusHistory[0].from, Ticket.STATUS.NEW);
  assert.equal(state.statusHistory[0].to, Ticket.STATUS.IN_PROGRESS);
  assert.equal(events.find(event => event.event === 'ticket:updated').payload.slug, 'in-progress');
  assert.equal(state.assignmentHistory[0].changedBy, staffId);
  assert.equal(state.assignmentHistory[0].assignedToName, 'IT One');
  assert.equal(events[0].event, 'ticket:assigned');
  assert.deepEqual(notices[0][0], [ownerId, staffId]);
  await assignTicket(id, staffId, staff);
  assert.equal(state.assignmentHistory.length, 1, 'repeat request must not duplicate history');
  assert.equal(state.statusHistory.length, 1);
});

test('staff cannot claim completed tickets or overwrite concurrent completion', async t => {
  const { state } = fixture(t);
  state.status = Ticket.STATUS.DONE;
  await assert.rejects(assignTicket(id, staffId, staff), { status: 409 });
  assert.equal(state.assignedTo, null);
  state.status = Ticket.STATUS.NEW;
  Ticket.findById.mock.mockImplementation(async () => {
    const snapshot = { ...state };
    state.status = Ticket.STATUS.DONE;
    return snapshot;
  });
  await assert.rejects(assignTicket(id, staffId, staff), { status: 409 });
  assert.equal(state.status, Ticket.STATUS.DONE);
  assert.equal(state.assignedTo, null);
});

test('user cannot assign and staff cannot steal, assign others or unassign', async t => {
  fixture(t, otherId);
  await assert.rejects(assignTicket(id, staffId, { ...staff, role: 'user' }), { status: 403 });
  await assert.rejects(assignTicket(id, otherId, staff), { status: 403 });
  await assert.rejects(assignTicket(id, '', staff), { status: 403 });
  await assert.rejects(assignTicket(id, staffId, staff), { status: 409 });
});

test('two simultaneous claims have exactly one winner', async t => {
  const { state } = fixture(t);
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  let reads = 0;
  Ticket.findById.mock.mockImplementation(async () => {
    const snapshot = { ...state };
    if (++reads === 2) release();
    await barrier;
    return snapshot;
  });
  const results = await Promise.allSettled([
    assignTicket(id, staffId, staff),
    assignTicket(id, otherId, { ...staff, id: otherId }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal(state.assignmentHistory.length, 1);
});

test('admin can reassign, unassign and reject invalid recipients', async t => {
  const { state } = fixture(t, staffId);
  await assignTicket(id, otherId, admin);
  assert.equal(state.assignedTo, otherId);
  await assignTicket(id, '', admin);
  assert.equal(state.assignedTo, null);
  assert.equal(state.assignmentHistory.length, 2);
  await assert.rejects(assignTicket(id, ownerId, admin), { status: 400 });
  await assert.rejects(assignTicket('invalid', staffId, admin), { status: 400 });
  await assert.rejects(assignTicket(id, { $ne: null }, admin), { status: 400 });
});

test('deleted or demoted IT accounts release their assignments', async t => {
  const { state } = fixture(t, staffId);
  t.mock.method(Ticket, 'find', filter => {
    assert.equal(filter.assignedTo, staffId);
    return { select: async () => [{ _id: id }] };
  });
  await releaseAssignments(staffId, admin);
  assert.equal(state.assignedTo, null);
});

test('user detail access is restricted to their own tickets', async t => {
  let query;
  t.mock.method(Ticket, 'findOne', filter => {
    query = filter;
    const chain = { populate: () => chain, then: resolve => resolve(null) };
    return chain;
  });
  await getTicket(id, { id: ownerId, role: 'user' });
  assert.deepEqual(query, { _id: id, user: ownerId });
  await getTicket(id, staff);
  assert.deepEqual(query, { _id: id });
});

test('list and detail render correct assignment controls for all roles', async () => {
  const ticket = new Ticket({ _id: id, user: ownerId, title: 'Printer', description: 'Paper jam' });
  ticket.createdAt = ticket.updatedAt = new Date();
  const common = { ticket, admins: [{ _id: staffId, username: 'IT One' }], message: null,
    STATUS: Ticket.STATUS, STATUS_SLUG: Ticket.STATUS_SLUG, PRIORITY: Ticket.PRIORITY,
    PRIORITY_SLUG: Ticket.PRIORITY_SLUG, REQUEST_TYPE: Ticket.REQUEST_TYPE, REQUEST_TYPE_SLUG: Ticket.REQUEST_TYPE_SLUG };
  for (const role of ['admin', 'staff', 'user']) {
    const user = { ...staff, role };
    const detail = await ejs.renderFile('views/ticket-detail.ejs', { ...common, user });
    assert.equal(detail.includes('Lưu phân công'), role === 'admin');
    assert.equal(detail.includes('Nhận xử lý yêu cầu'), role === 'staff');
    if (role !== 'user') {
      const list = await ejs.renderFile('views/admin.ejs', { ...common, user, tickets: [ticket],
        assignmentFilter: 'mine', notifications: [], activeTab: 'list' });
      assert(list.includes('Người xử lý'));
      assert.equal(list.includes('Nhận xử lý</button>'), role === 'staff');
    }
  }
  const rows = await realtime.renderAdminTicket(ticket);
  assert(rows.staffRowHtml.includes('Nhận xử lý'));
  assert(!rows.staffRowHtml.includes('data-delete-ticket'));
  ticket.status = Ticket.STATUS.DONE;
  const completedRows = await realtime.renderAdminTicket(ticket);
  for (const row of [completedRows.rowHtml, completedRows.staffRowHtml]) {
    assert(!row.includes('js-status-select'));
    assert(!row.includes('js-claim-ticket'));
    assert(row.includes('js-assignee'));
  }
  for (const role of ['admin', 'staff']) {
    const detail = await ejs.renderFile('views/ticket-detail.ejs', { ...common, user: { ...staff, role } });
    assert(!detail.includes('data-status-form'));
    assert(!detail.includes('data-assignment-form'));
  }
});
