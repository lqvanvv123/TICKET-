// Một nơi đọc bộ lọc cho cả danh sách và báo cáo, tránh màn hình và file xuất lệch nhau.
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const { deadlineFilter } = require('./deadline');
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function stringValue(query, key) {
  if (query[key] === undefined) return '';
  if (typeof query[key] !== 'string') fail('Bộ lọc không hợp lệ. Vui lòng chọn lại.');
  return query[key].trim();
}
function validDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z'))
    && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
}
function parseTicketFilters(query, user, now = new Date()) {
  const filters = Object.fromEntries(['q','status','priority','type','assignee','deadline','from','to'].map(key=>[key,stringValue(query,key)]));
  // Giữ các liên kết cũ assignment=mine/unassigned vẫn dùng được; URL mới dùng assignee.
  if (!filters.assignee && query.assignment !== undefined) {
    const old = stringValue(query,'assignment');
    if (!['','all','mine','unassigned'].includes(old)) fail('Người xử lý không hợp lệ.');
    filters.assignee = old === 'all' ? '' : old;
  }
  if (filters.q.length > 100) fail('Từ khóa tìm kiếm tối đa 100 ký tự.');
  for (const [key,values,label] of [['status',[...Object.values(Ticket.STATUS),'open'],'Trạng thái'],
    ['priority',Object.values(Ticket.PRIORITY),'Ưu tiên'],['type',Object.values(Ticket.REQUEST_TYPE),'Loại yêu cầu']]) {
    if(filters[key] && !values.includes(filters[key])) fail(label+' không hợp lệ.');
  }
  const filter = deadlineFilter(filters.deadline, now);
  if(filters.status) filter.status = filters.status === 'open' ? {$ne:Ticket.STATUS.DONE} : filters.status;
  if(filters.priority) filter.priority = filters.priority;
  if(filters.type) filter.requestType = filters.type;
  if(filters.assignee) {
    if(filters.assignee === 'mine') filter.assignedTo = user.id;
    else if(filters.assignee === 'unassigned') filter.assignedTo = null;
    else if(/^[a-f\d]{24}$/i.test(filters.assignee)) filter.assignedTo = new mongoose.Types.ObjectId(filters.assignee);
    else fail('Người phụ trách không hợp lệ.');
  }
  for(const value of [filters.from,filters.to]) if(value && !validDay(value)) fail('Ngày lọc không hợp lệ.');
  if(filters.from && filters.to && filters.from > filters.to) fail('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
  if(filters.from || filters.to) {
    filter.createdAt = {};
    if(filters.from) filter.createdAt.$gte = new Date(filters.from+'T00:00:00+07:00');
    if(filters.to) filter.createdAt.$lte = new Date(filters.to+'T23:59:59.999+07:00');
  }
  if(filters.q) {
    // Dùng regex đã escape để dấu chấm/ngoặc của người dùng luôn là ký tự tìm kiếm thông thường.
    filter.$or = [{title:{$regex:escapeRegex(filters.q),$options:'i'}}];
    const code = filters.q.replace(/^#/,'').toLowerCase();
    if(/^[a-f\d]{24}$/.test(code)) filter.$or.push({_id:new mongoose.Types.ObjectId(code)});
    // Mã ngắn trên giao diện là 6 ký tự cuối của ObjectId; không nhầm thành 6 ký tự đầu.
    else if(/^[a-f\d]{6}$/.test(code)) filter.$or.push({$expr:{$eq:[{$substrBytes:[{$toString:'$_id'},18,6]},code]}});
  }
  return { filters, filter };
}
function parsePagination(query) {
  const size = query.pageSize === undefined ? '20' : stringValue(query,'pageSize');
  if(!['20','50'].includes(size)) fail('Chỉ chọn 20 hoặc 50 yêu cầu mỗi trang.');
  const page = query.page === undefined ? '1' : stringValue(query,'page');
  if(!/^[1-9]\d{0,6}$/.test(page)) fail('Số trang không hợp lệ.');
  return { page: Number(page), pageSize: Number(size) };
}
module.exports = { parseTicketFilters, parsePagination };
