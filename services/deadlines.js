const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const realtime = require('../utils/realtime');
const { parseDeadline } = require('../utils/deadline');
const { format } = require('../public/js/deadlines');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

async function setDeadline(id, value, account, now = new Date()) {
  if (account.role !== 'admin') fail(403, 'Chỉ Admin được đặt hoặc đổi hạn xử lý.');
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id) || !mongoose.isValidObjectId(id)) fail(400, 'Mã yêu cầu không hợp lệ.');
  const dueAt = parseDeadline(value, now);
  const current = await Ticket.findById(id);
  if (!current) fail(404, 'Không tìm thấy yêu cầu.');
  if (current.status === Ticket.STATUS.DONE) fail(409, 'Yêu cầu đã hoàn thành, không thể đổi hạn xử lý.');
  if ((current.dueAt ? new Date(current.dueAt).getTime() : null) === (dueAt ? dueAt.getTime() : null)) return current;
  // Kiểm tra hạn cũ và trạng thái ngay khi ghi, tránh ghi đè Admin khác hoặc yêu cầu vừa hoàn thành.
  const ticket = await Ticket.findOneAndUpdate({ _id: id, status: current.status, dueAt: current.dueAt || null }, {
    $set: { dueAt },
    $push: { deadlineHistory: { from: current.dueAt || null, to: dueAt,
      changedBy: account._id || account.id, changedByName: account.username, changedAt: now } },
  }, { new: true, runValidators: true });
  if (!ticket) fail(409, 'Yêu cầu vừa thay đổi. Vui lòng tải lại trước khi đổi hạn.');
  const payload = { id: ticket._id, dueAt: ticket.dueAt || null };
  realtime.toAdmins('ticket:deadline', payload);
  realtime.toUser(ticket.user, 'ticket:deadline', payload);
  // Dữ liệu đã lưu: lỗi thông báo không được làm người dùng hiểu nhầm rằng cập nhật thất bại.
  try {
    const recipients = [...new Set([String(ticket.user), ...(ticket.assignedTo ? [String(ticket.assignedTo)] : [])])];
    await realtime.notify(recipients, ticket._id, dueAt
      ? `Hạn xử lý yêu cầu "${ticket.title}" được đặt là ${format(dueAt)} (giờ Việt Nam).`
      : `Admin đã bỏ hạn xử lý yêu cầu "${ticket.title}".`);
  } catch (error) { console.error('Deadline saved; notification failed:', error.message); }
  return ticket;
}
module.exports = { setDeadline };
