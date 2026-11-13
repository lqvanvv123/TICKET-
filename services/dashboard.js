// Dashboard thống kê theo ngày tạo yêu cầu. Mọi mốc ngày đều theo giờ Việt Nam (UTC+7).
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const deadlines = require('../public/js/deadlines');
const { deadlineFilter } = require('../utils/deadline');
const DAY = 86400000;
const VN_OFFSET = 7 * 3600000;
const dayKey = value => new Date(new Date(value).getTime() + VN_OFFSET).toISOString().slice(0, 10);
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
function parseFilters(query, user, now = new Date()) {
  const range = query.range || 'all';
  if (!['all', '7', '14', '30', '90', 'custom'].includes(range)) invalid('Khoảng thời gian không hợp lệ.');
  let from = '', to = '';
  if (range === 'custom') {
    if (!validDate(query.from) || !validDate(query.to)) invalid('Vui lòng chọn ngày bắt đầu và kết thúc hợp lệ.');
    from = query.from; to = query.to;
    if (from > to) invalid('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    if ((Date.parse(to) - Date.parse(from)) / DAY > 365) invalid('Vui lòng chọn tối đa 366 ngày cho một lần thống kê.');
  } else if (range !== 'all') {
    to = dayKey(now); from = dayKey(new Date(now.getTime() - (Number(range) - 1) * DAY));
  }
  const status = query.status || '';
  const priority = query.priority || '';
  const type = query.type || '';
  const assignee = query.assignee || '';
  const deadline = query.deadline || '';
  if (status && status !== 'open' && !Object.values(Ticket.STATUS).includes(status)) invalid('Trạng thái không hợp lệ.');
  if (priority && !Object.values(Ticket.PRIORITY).includes(priority)) invalid('Mức ưu tiên không hợp lệ.');
  if (type && !Object.values(Ticket.REQUEST_TYPE).includes(type)) invalid('Loại yêu cầu không hợp lệ.');
  if (assignee && !['mine', 'unassigned'].includes(assignee)
      && !(typeof assignee === 'string' && /^[a-f\d]{24}$/i.test(assignee))) invalid('Người phụ trách không hợp lệ.');
  const filter = {};
  if (from) filter.createdAt = { $gte: new Date(from + 'T00:00:00+07:00'), $lt: new Date(new Date(to + 'T00:00:00+07:00').getTime() + DAY) };
  if (status) filter.status = status === 'open' ? { $ne: Ticket.STATUS.DONE } : status;
  if (priority) filter.priority = priority;
  if (type) filter.requestType = type;
  if (assignee) filter.assignedTo = assignee === 'unassigned' ? null : assignee === 'mine' ? user.id : new mongoose.Types.ObjectId(assignee);
  Object.assign(filter, deadlineFilter(deadline, now));
  return { filters: { range, from, to, status, priority, type, assignee, deadline }, filter };
}

function summarize(tickets, team, filters, now = new Date()) {
  const byStatus = Object.fromEntries(Object.values(Ticket.STATUS).map(value => [value, 0]));
  const byPriority = Object.fromEntries(Object.values(Ticket.PRIORITY).map(value => [value, 0]));
  const byRequestType = Object.fromEntries(Object.values(Ticket.REQUEST_TYPE).map(value => [value, 0]));
  const workload = new Map(team.map(person => [String(person._id), { id: String(person._id), username: person.username, role: person.role, total: 0, open: 0, done: 0 }]));
  let unassigned = 0, urgentOpen = 0, overdue = 0, dueSoon = 0;
  const resolutionHours = [];
  for (const ticket of tickets) {
    byStatus[ticket.status] = (byStatus[ticket.status] || 0) + 1;
    byPriority[ticket.priority] = (byPriority[ticket.priority] || 0) + 1;
    byRequestType[ticket.requestType] = (byRequestType[ticket.requestType] || 0) + 1;
    const done = ticket.status === Ticket.STATUS.DONE;
    const deadlineState = deadlines.info(ticket, now).key;
    if (deadlineState === 'overdue') overdue++;
    if (deadlineState === 'soon') dueSoon++;
    if (!done && !ticket.assignedTo) unassigned++;
    if (!done && ticket.priority === Ticket.PRIORITY.URGENT) urgentOpen++;
    if (done && ticket.resolvedAt) {
      const hours = (new Date(ticket.resolvedAt) - new Date(ticket.createdAt)) / 36e5;
      if (Number.isFinite(hours) && hours >= 0) resolutionHours.push(hours);
    }
    if (ticket.assignedTo) {
      const id = String(ticket.assignedTo._id || ticket.assignedTo);
      if (!workload.has(id)) workload.set(id, { id, username: ticket.assignedTo.username || 'Tài khoản không còn trong nhóm IT', role: '', total: 0, open: 0, done: 0 });
      const row = workload.get(id); row.total++; row[done ? 'done' : 'open']++;
    }
  }
  // Với toàn thời gian, biểu đồ hiển thị 14 ngày gần nhất; các chỉ số vẫn tính toàn bộ kết quả lọc.
  const trendTo = filters.to || dayKey(now);
  const trendFrom = filters.from || dayKey(new Date(now.getTime() - 13 * DAY));
  const days = [];
  for (let value = Date.parse(trendFrom + 'T00:00:00Z'); value <= Date.parse(trendTo + 'T00:00:00Z'); value += DAY) days.push(new Date(value).toISOString().slice(0, 10));
  const dayCounts = Object.fromEntries(days.map(key => [key, 0]));
  for (const ticket of tickets) {
    const key = dayKey(ticket.createdAt);
    if (Object.hasOwn(dayCounts, key)) dayCounts[key]++;
  }
  const doneCount = byStatus[Ticket.STATUS.DONE] || 0;
  const attention = tickets.filter(ticket => ticket.status !== Ticket.STATUS.DONE)
    .sort((a, b) => (Ticket.PRIORITY_WEIGHT[b.priority] || 0) - (Ticket.PRIORITY_WEIGHT[a.priority] || 0) || new Date(a.createdAt) - new Date(b.createdAt)).slice(0, 6);
  const recent = [...tickets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  return {
    total: tickets.length, byStatus, byPriority, byRequestType, unassigned, urgentOpen, overdue, dueSoon,
    openCount: tickets.length - doneCount,
    completionRate: tickets.length ? Math.round(doneCount * 1000 / tickets.length) / 10 : 0,
    avgResolutionHours: resolutionHours.length ? resolutionHours.reduce((sum, value) => sum + value, 0) / resolutionHours.length : null,
    workload: [...workload.values()].sort((a, b) => b.open - a.open || a.username.localeCompare(b.username, 'vi')),
    attention, recent,
    chartData: { status: byStatus, priority: byPriority, type: byRequestType,
      trend: { labels: days, counts: days.map(key => dayCounts[key]) } },
    trendFrom, trendTo, generatedAt: now.toISOString(),
  };
}

async function loadDashboard(query, user, now = new Date()) {
  const { filters, filter } = parseFilters(query, user, now);
  const [tickets, team] = await Promise.all([
    Ticket.find(filter).select('title user status priority requestType assignedTo createdAt resolvedAt dueAt')
      .populate('user', 'username').populate('assignedTo', 'username').lean(),
    User.find({ role: { $in: ['admin', 'staff'] } }).select('username role').sort({ username: 1 }).lean(),
  ]);
  // Các liên kết trên thẻ giữ nguyên bộ lọc thời gian/loại, chỉ thay điều kiện được bấm.
  const dashboardUrl = (changes = {}) => {
    const values = { ...filters, ...changes };
    const params = new URLSearchParams(Object.entries(values).filter(([, value]) => value !== ''));
    return '/admin/dashboard?' + params;
  };
  const exportParams = new URLSearchParams(Object.entries(filters).filter(([key, value]) => key !== 'range' && value !== ''));
  return { ...summarize(tickets, team, filters, now), filters, team, dashboardUrl, deadlines,
    exportUrl: '/admin/export/tickets.xlsx?' + exportParams };
}
module.exports = { dayKey, validDate, parseFilters, summarize, loadDashboard };
