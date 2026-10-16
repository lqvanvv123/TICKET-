const mongoose = require("mongoose");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const realtime = require("../utils/realtime");

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

async function getTicket(id, account) {
  if (!mongoose.isValidObjectId(id)) fail(400, "Mã yêu cầu không hợp lệ.");
  const filter = { _id: id };
  if (account.role === "user") filter.user = account._id || account.id;
  else if (!["admin", "staff"].includes(account.role))
    fail(403, "Bạn không có quyền xem yêu cầu.");
  return Ticket.findOne(filter)
    .populate("user", "username")
    .populate("assignedTo", "username role");
}

async function assignTicket(id, assigneeId, account) {
  if (!["admin", "staff"].includes(account.role))
    fail(403, "Bạn không có quyền phân công yêu cầu.");
  if (!mongoose.isValidObjectId(id)) fail(400, "Mã yêu cầu không hợp lệ.");
  if (typeof assigneeId !== "string")
    fail(400, "Người phụ trách không hợp lệ.");
  const actorId = String(account._id || account.id);
  if (account.role === "staff" && assigneeId !== actorId) {
    fail(403, "Nhân viên IT chỉ có thể tự nhận yêu cầu chưa được phân công.");
  }
  let assignee = null;
  if (assigneeId) {
    if (!mongoose.isValidObjectId(assigneeId))
      fail(400, "Người phụ trách không hợp lệ.");
    assignee = await User.findOne({
      _id: assigneeId,
      role: { $in: ["admin", "staff"] },
    }).select("username");
    if (!assignee)
      fail(400, "Chỉ có thể giao yêu cầu cho Admin hoặc Nhân viên IT.");
  }
  const current = await Ticket.findById(id);
  if (!current) return null;
  if (account.role === "staff" && current.status === Ticket.STATUS.DONE) {
    fail(409, "Yêu cầu đã hoàn thành, không thể nhận xử lý.");
  }
  const previousId = current.assignedTo ? String(current.assignedTo) : "";
  if (account.role === "staff" && previousId && previousId !== actorId) {
    fail(
      409,
      "Yêu cầu đã được giao cho người khác. Vui lòng tải lại danh sách.",
    );
  }
  if (previousId === assigneeId) return current;
  const startProcessing =
    account.role === "staff" && current.status !== Ticket.STATUS.IN_PROGRESS;
  const update = {
    $set: { assignedTo: assigneeId || null },
    $push: {
      assignmentHistory: {
        assignedTo: assigneeId || null,
        assignedToName: assignee ? assignee.username : "",
        changedBy: actorId,
        changedByName: account.username,
        changedAt: new Date(),
      },
    },
  };
  if (startProcessing) {
    update.$set.status = Ticket.STATUS.IN_PROGRESS;
    update.$set.resolvedAt = null;
    update.$push.statusHistory = {
      from: current.status,
      to: Ticket.STATUS.IN_PROGRESS,
      changedBy: actorId,
      changedByName: account.username,
      changedAt: new Date(),
    };
  }
  // So sánh người phụ trách cũ ngay trong lệnh cập nhật: hai nhân viên không thể cùng nhận một yêu cầu.
  const ticket = await Ticket.findOneAndUpdate(
    { _id: id, assignedTo: current.assignedTo || null, status: current.status },
    update,
    { new: true, runValidators: true },
  );
  if (!ticket)
    fail(409, "Phân công vừa thay đổi. Vui lòng tải lại và thử lại.");
  const payload = {
    id: ticket._id,
    assignedTo: assignee
      ? { id: String(assignee._id), username: assignee.username }
      : null,
  };
  realtime.toAdmins("ticket:assigned", payload);
  realtime.toUser(ticket.user, "ticket:assigned", payload);
  if (startProcessing) {
    const statusPayload = {
      id: ticket._id,
      status: ticket.status,
      slug: Ticket.STATUS_SLUG[ticket.status],
      resolvedAt: ticket.resolvedAt,
    };
    realtime.toAdmins("ticket:updated", statusPayload);
    realtime.toUser(ticket.user, "ticket:updated", statusPayload);
  }
  const recipients = [
    ...new Set([String(ticket.user), ...(assigneeId ? [assigneeId] : [])]),
  ];
  await realtime.notify(
    recipients,
    ticket._id,
    assignee
      ? `Yêu cầu "${ticket.title}" được giao cho ${assignee.username}${startProcessing ? " và đang sửa lỗi" : ""}.`
      : `Yêu cầu "${ticket.title}" đã được bỏ phân công.`,
  );
  return ticket;
}

async function releaseAssignments(userId, actor) {
  const tickets = await Ticket.find({ assignedTo: userId }).select("_id");
  for (const ticket of tickets)
    await assignTicket(String(ticket._id), "", actor);
}

module.exports = { getTicket, assignTicket, releaseAssignments };
