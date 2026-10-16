// Tầng thời gian thực (Socket.IO): đẩy thay đổi yêu cầu & thông báo tới đúng người.
//   - phòng "admins"       : mọi tài khoản IT đang online
//   - phòng "user:<id>"    : mọi tab của 1 tài khoản
const path = require("path");
const ejs = require("ejs");
const { Server } = require("socket.io");
const Ticket = require("../models/Ticket");
const Notification = require("../models/Notification");
const User = require("../models/User");

let io = null;

function init(httpServer, sessionMiddleware) {
  io = new Server(httpServer);

  // Dùng chung session Express để biết ai đang kết nối (không tin dữ liệu client gửi lên)
  io.engine.use(sessionMiddleware);

  io.on("connection", async (socket) => {
    const sessUser = socket.request.session && socket.request.session.user;
    if (!sessUser) {
      socket.disconnect(true);
      return;
    }
    try {
      const account = await User.findById(sessUser.id).select('role').lean();
      if (!account || !socket.connected) return socket.disconnect(true);
      socket.join("user:" + sessUser.id);
      if (["admin", "staff"].includes(account.role)) socket.join("admins");
    } catch (err) { socket.disconnect(true); }
  });
  return io;
}

const toAdmins = (event, payload) => io && io.to("admins").emit(event, payload);
const toUser = (userId, event, payload) => io && io.to("user:" + userId).emit(event, payload);
const disconnectUser = (userId) => io && io.in("user:" + userId).disconnectSockets(true);

// Tạo thông báo trong DB rồi đẩy ngay tới người nhận
async function notify(recipientIds, ticketId, message) {
  const docs = await Notification.insertMany(
    recipientIds.map((id) => ({ recipient: id, ticket: ticketId || undefined, message }))
  );
  docs.forEach((n) =>
    toUser(n.recipient, "notification:new", {
      id: n._id,
      message: n.message,
      isRead: n.isRead,
      createdAt: n.createdAt,
    })
  );
  return docs;
}

// Render sẵn HTML 1 dòng bảng để admin chèn thẳng vào danh sách
async function renderAdminTicket(ticket) {
  const locals = {
    t: ticket,
    STATUS: Ticket.STATUS,
    STATUS_SLUG: Ticket.STATUS_SLUG,
    PRIORITY_SLUG: Ticket.PRIORITY_SLUG,
    REQUEST_TYPE_SLUG: Ticket.REQUEST_TYPE_SLUG,
  };
  const dir = path.join(__dirname, "..", "views", "partials");
  const template = path.join(dir, "admin-ticket-row.ejs");
  const [rowHtml, staffRowHtml] = await Promise.all([
    ejs.renderFile(template, { ...locals, user: { role: 'admin' } }),
    ejs.renderFile(template, { ...locals, user: { role: 'staff' } }),
  ]);
  return { rowHtml, staffRowHtml };
}

module.exports = { init, toAdmins, toUser, notify, renderAdminTicket, disconnectUser };
