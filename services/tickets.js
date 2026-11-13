// Nghiệp vụ yêu cầu: xem chi tiết, phân công, tự nhận việc và bỏ phân công.
// Luồng nhận việc: kiểm tra quyền → chuẩn bị dữ liệu → lưu có điều kiện → báo cho giao diện.
const mongoose = require("mongoose");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const realtime = require("../utils/realtime");

function fail(status, message) {
  // Gắn mã HTTP vào lỗi để route trả đúng lý do: 400 = dữ liệu sai,
  // 403 = không có quyền, 409 = dữ liệu đã thay đổi hoặc không còn cho phép nhận.
  throw Object.assign(new Error(message), { status });
}

async function getTicket(id, account) {
  // User chỉ xem yêu cầu của mình; admin và staff được xem toàn bộ.
  if (!mongoose.isValidObjectId(id)) fail(400, "Mã yêu cầu không hợp lệ.");
  const filter = { _id: id };
  if (account.role === "user") filter.user = account._id || account.id;
  else if (!["admin", "staff"].includes(account.role))
    fail(403, "Bạn không có quyền xem yêu cầu.");
  // populate thay ID tham chiếu bằng thông tin tài khoản để hiển thị tên trên trang.
  return Ticket.findOne(filter)
    .populate("user", "username")
    .populate("assignedTo", "username role");
}

async function assignTicket(id, assigneeId, account) {
  // id: yêu cầu nào; assigneeId: giao cho ai (chuỗi rỗng = bỏ phân công);
  // account: người đang thao tác, lấy ở server, không tin vai trò do trình duyệt gửi lên.
  if (!["admin", "staff"].includes(account.role))
    fail(403, "Bạn không có quyền phân công yêu cầu.");
  if (!mongoose.isValidObjectId(id)) fail(400, "Mã yêu cầu không hợp lệ.");
  if (typeof assigneeId !== "string")
    fail(400, "Người phụ trách không hợp lệ.");
  const actorId = String(account._id || account.id);
  // Staff chỉ được nhận cho bản thân. Admin mới được giao cho người khác hoặc bỏ phân công.
  if (account.role === "staff" && assigneeId !== actorId) {
    fail(403, "Nhân viên IT chỉ có thể tự nhận yêu cầu chưa được phân công.");
  }
  let assignee = null;
  // Kiểm tra người nhận thực sự tồn tại và thuộc nhóm IT; không giao việc cho user thường.
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
  // Đọc dữ liệu hiện tại để biết trạng thái và người đang phụ trách.
  if (!current) return null;
  if (account.role === "staff" && current.status === Ticket.STATUS.DONE) {
    fail(409, "Yêu cầu đã hoàn thành, không thể nhận xử lý.");
  }
  const previousId = current.assignedTo ? String(current.assignedTo) : "";
  // Nếu đã giao cho người khác thì staff không được lấy việc đó.
  if (account.role === "staff" && previousId && previousId !== actorId) {
    fail(
      409,
      "Yêu cầu đã được giao cho người khác. Vui lòng tải lại danh sách.",
    );
  }
  // Gửi lại cùng một phân công thì trả về luôn, tránh trùng lịch sử và thông báo.
  if (previousId === assigneeId) return current;
  // Chỉ staff tự nhận mới tự chuyển sang Đang sửa lỗi; admin giao việc không tự đổi trạng thái.
  const startProcessing =
    account.role === "staff" && current.status !== Ticket.STATUS.IN_PROGRESS;
  const update = {
    // $set: thay giá trị hiện tại. null biểu thị chưa có người phụ trách.
    $set: { assignedTo: assigneeId || null },
    $push: {
      // $push: thêm một lần phân công vào mảng lịch sử, giữ lại các lần trước.
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
    // Gom đổi người nhận, trạng thái và lịch sử vào cùng một lần ghi trên ticket.
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
  // Nếu An nhận trước, điều kiện assignedTo cũ không còn đúng khi Bình ghi sau.
  // Kiểm tra cả status để không ghi đè nếu yêu cầu vừa được hoàn thành ở màn hình khác.
  const ticket = await Ticket.findOneAndUpdate(
    { _id: id, assignedTo: current.assignedTo || null, status: current.status },
    update,
    // new: trả dữ liệu sau cập nhật; runValidators: kiểm tra dữ liệu theo schema.
    { new: true, runValidators: true },
  );
  if (!ticket)
    fail(409, "Phân công vừa thay đổi. Vui lòng tải lại và thử lại.");
  const payload = {
    // Chỉ gửi dữ liệu cần cho giao diện: mã yêu cầu và thông tin người nhận mới.
    id: ticket._id,
    assignedTo: assignee
      ? { id: String(assignee._id), username: assignee.username }
      : null,
  };
  // Lưu thành công rồi mới phát sự kiện; nhóm admins gồm cả admin và staff.
  realtime.toAdmins("ticket:assigned", payload);
  realtime.toUser(ticket.user, "ticket:assigned", payload);
  if (startProcessing) {
    const statusPayload = {
      // slug là tên CSS không dấu để trình duyệt đổi màu theo trạng thái.
      id: ticket._id,
      status: ticket.status,
      slug: Ticket.STATUS_SLUG[ticket.status],
      resolvedAt: ticket.resolvedAt,
    };
    realtime.toAdmins("ticket:updated", statusPayload);
    realtime.toUser(ticket.user, "ticket:updated", statusPayload);
  }
  // Set loại ID trùng: mỗi tài khoản chỉ nhận một thông báo cho lần phân công này.
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
  // Khi xóa tài khoản IT hoặc hạ xuống user, bỏ các phân công của tài khoản đó.
  // Dùng lại assignTicket để vẫn ghi lịch sử và cập nhật các màn hình đang mở.
  const tickets = await Ticket.find({ assignedTo: userId }).select("_id");
  for (const ticket of tickets)
    await assignTicket(String(ticket._id), "", actor);
}

module.exports = { getTicket, assignTicket, releaseAssignments };
