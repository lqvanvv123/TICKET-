// Tầng thời gian thực (Socket.IO): đẩy thay đổi yêu cầu & thông báo tới đúng người.
//   - phòng "admins"       : mọi tài khoản IT đang online
//   - phòng "user:<id>"    : mọi tab của 1 tài khoản
const path = require("path");
const ejs = require("ejs");
const { Server } = require("socket.io");
const Ticket = require("../models/Ticket");
const Notification = require("../models/Notification");

let io = null;

function init(httpServer, sessionMiddleware) {
  io = new Server(httpServer);

  // Dùng chung session Express để biết ai đang kết nối (không tin dữ liệu client gửi lên)
  io.engine.use(sessionMiddleware);

  io.on("connection", (socket) => {
    const sessUser = socket.request.session && socket.request.session.user;
    if (!sessUser) {
      socket.disconnect(true);
      return;
    }
    socket.join("user:" + sessUser.id);
    if (sessUser.role === "admin") socket.join("admins");
  });
  return io;
}

const toAdmins = (event, payload) => io && io.to("admins").emit(event, payload);
const toUser = (userId, event, payload) => io && io.to("user:" + userId).emit(event, payload);

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

// Render sẵn HTML 1 dòng bảng + 1 thẻ Kanban để admin chèn thẳng vào trang
async function renderAdminTicket(ticket) {
  const locals = {
    t: ticket,
    STATUS: Ticket.STATUS,
    STATUS_SLUG: Ticket.STATUS_SLUG,
    PRIORITY_SLUG: Ticket.PRIORITY_SLUG,
    REQUEST_TYPE_SLUG: Ticket.REQUEST_TYPE_SLUG,
  };
  const dir = path.join(__dirname, "..", "views", "partials");
  const [rowHtml, cardHtml] = await Promise.all([
    ejs.renderFile(path.join(dir, "admin-ticket-row.ejs"), locals),
    ejs.renderFile(path.join(dir, "board-card.ejs"), locals),
  ]);
  return { rowHtml, cardHtml };
}

module.exports = { init, toAdmins, toUser, notify, renderAdminTicket };
