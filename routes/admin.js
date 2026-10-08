const express = require("express");
const router = express.Router();
const Ticket = require("../models/Ticket");
const Notification = require("../models/Notification");
const fs = require("fs");
const path = require("path");
const realtime = require("../utils/realtime");
const { UPLOAD_DIR } = require("../middleware/upload");
const { requireLogin, requireRole } = require("../middleware/auth");

const commonLocals = () => ({
  STATUS: Ticket.STATUS,
  STATUS_SLUG: Ticket.STATUS_SLUG,
  PRIORITY: Ticket.PRIORITY,
  PRIORITY_SLUG: Ticket.PRIORITY_SLUG,
  PRIORITY_WEIGHT: Ticket.PRIORITY_WEIGHT,
  REQUEST_TYPE: Ticket.REQUEST_TYPE,
  REQUEST_TYPE_SLUG: Ticket.REQUEST_TYPE_SLUG,
});

// Lấy toàn bộ thông báo (mới nhất trước) để hiển thị trong bảng thông báo
async function getNotifications(userId) {
  return Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(50);
}

// Cập nhật trạng thái ticket + tạo thông báo tương ứng cho user.
// Dùng chung cho cả bảng danh sách (form submit) và bảng Kanban (AJAX).
async function applyStatusChange(ticketId, status, admin) {
  const validStatuses = Object.values(Ticket.STATUS);
  if (!validStatuses.includes(status)) return null;

  const current = await Ticket.findById(ticketId);
  if (!current) return null;
  // Không đổi gì thì không ghi thêm lịch sử / không gửi thông báo trùng
  if (current.status === status) return current;

  const update = { status };
  if (status === Ticket.STATUS.DONE) update.resolvedAt = new Date();
  else update.resolvedAt = null;

  const ticket = await Ticket.findByIdAndUpdate(
    ticketId,
    {
      ...update,
      $push: {
        statusHistory: {
          from: current.status,
          to: status,
          changedBy: admin && admin.id,
          changedByName: (admin && admin.username) || "",
          changedAt: new Date(),
        },
      },
    },
    { new: true }
  );
  if (!ticket) return null;

  if (status === Ticket.STATUS.DONE) {
    await realtime.notify([ticket.user], ticket._id, `Lỗi "${ticket.title}" của bạn đã được sửa xong!`);
  } else if (status === Ticket.STATUS.IN_PROGRESS) {
    await realtime.notify([ticket.user], ticket._id, `Lỗi "${ticket.title}" của bạn đang được IT xử lý.`);
  }

  // Đẩy trạng thái mới tới mọi admin và tới chủ yêu cầu ngay lập tức
  const payload = {
    id: ticket._id,
    status: ticket.status,
    slug: Ticket.STATUS_SLUG[ticket.status],
    resolvedAt: ticket.resolvedAt,
  };
  realtime.toAdmins("ticket:updated", payload);
  realtime.toUser(ticket.user, "ticket:updated", payload);

  return ticket;
}

// ---- Danh sách (bảng) ----
router.get("/admin", requireLogin, requireRole("admin"), async (req, res) => {
  const tickets = await Ticket.find().populate("user", "username").sort({ createdAt: -1 });
  const notifications = await getNotifications(req.session.user.id);

  res.render("admin", {
    user: req.session.user,
    tickets,
    notifications,
    activeTab: "list",
    ...commonLocals(),
  });
});

// ---- Bảng Kanban ----
router.get("/admin/board", requireLogin, requireRole("admin"), async (req, res) => {
  const tickets = await Ticket.find().populate("user", "username").sort({ createdAt: -1 });
  const notifications = await getNotifications(req.session.user.id);

  const columns = Object.values(Ticket.STATUS).map((status) => ({
    status,
    slug: Ticket.STATUS_SLUG[status],
    tickets: tickets.filter((t) => t.status === status),
  }));

  res.render("admin-board", {
    user: req.session.user,
    columns,
    notifications,
    activeTab: "board",
    ...commonLocals(),
  });
});

// ---- Dashboard thống kê ----
router.get("/admin/dashboard", requireLogin, requireRole("admin"), async (req, res) => {
  const tickets = await Ticket.find();
  const notifications = await getNotifications(req.session.user.id);

  const total = tickets.length;
  const byStatus = {};
  Object.values(Ticket.STATUS).forEach((s) => (byStatus[s] = 0));
  tickets.forEach((t) => (byStatus[t.status] = (byStatus[t.status] || 0) + 1));

  const byPriority = {};
  Object.values(Ticket.PRIORITY).forEach((p) => (byPriority[p] = 0));
  tickets.forEach((t) => (byPriority[t.priority] = (byPriority[t.priority] || 0) + 1));

  const byRequestType = {};
  Object.values(Ticket.REQUEST_TYPE).forEach((r) => (byRequestType[r] = 0));
  tickets.forEach((t) => (byRequestType[t.requestType] = (byRequestType[t.requestType] || 0) + 1));

  // Số ticket tạo mới trong 14 ngày gần nhất (theo ngày)
  const days = [];
  const dayCounts = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(key);
    dayCounts[key] = 0;
  }
  tickets.forEach((t) => {
    const key = new Date(t.createdAt).toISOString().slice(0, 10);
    if (key in dayCounts) dayCounts[key] += 1;
  });

  // Thời gian xử lý trung bình (giờ) của các ticket đã hoàn thành
  const doneTickets = tickets.filter((t) => t.status === Ticket.STATUS.DONE && t.resolvedAt);
  let avgResolutionHours = null;
  if (doneTickets.length) {
    const totalHours = doneTickets.reduce((sum, t) => {
      return sum + (new Date(t.resolvedAt) - new Date(t.createdAt)) / 36e5;
    }, 0);
    avgResolutionHours = totalHours / doneTickets.length;
  }

  res.render("admin-dashboard", {
    user: req.session.user,
    notifications,
    activeTab: "dashboard",
    total,
    byStatus,
    byPriority,
    byRequestType,
    trend: { labels: days, counts: days.map((d) => dayCounts[d]) },
    avgResolutionHours,
    ...commonLocals(),
  });
});

// ---- Cập nhật trạng thái từ bảng danh sách (form submit truyền thống) ----
router.post("/admin/ticket/:id", requireLogin, requireRole("admin"), async (req, res) => {
  await applyStatusChange(req.params.id, req.body.status, req.session.user);
  res.redirect("/admin");
});

// ---- Cập nhật trạng thái từ bảng Kanban (AJAX, trả về JSON) ----
router.post("/admin/ticket/:id/status", requireLogin, requireRole("admin"), async (req, res) => {
  const ticket = await applyStatusChange(req.params.id, req.body.status, req.session.user);
  if (!ticket) return res.status(400).json({ ok: false, error: "Trạng thái không hợp lệ." });
  res.json({ ok: true, status: ticket.status, slug: Ticket.STATUS_SLUG[ticket.status] });
});

// ---- Xóa yêu cầu (AJAX) -> báo thời gian thực cho mọi admin và chủ yêu cầu ----
router.delete("/admin/ticket/:id", requireLogin, requireRole("admin"), async (req, res) => {
  const ticket = await Ticket.findByIdAndDelete(req.params.id);
  if (!ticket) return res.status(404).json({ ok: false, error: "Không tìm thấy yêu cầu." });

  // Dọn file đính kèm trên đĩa (bỏ qua lỗi nếu file đã mất)
  (ticket.attachments || []).forEach((a) => {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(a.storedName)), () => {});
  });

  realtime.toAdmins("ticket:deleted", { id: ticket._id });
  realtime.toUser(ticket.user, "ticket:deleted", { id: ticket._id });
  await realtime.notify([ticket.user], null, `Yêu cầu "${ticket.title}" của bạn đã bị IT xóa.`);

  res.json({ ok: true });
});

// ---- Lịch sử trạng thái của 1 yêu cầu (JSON, hiển thị trong cửa sổ popup) ----
router.get("/admin/ticket/:id/history", requireLogin, requireRole("admin"), async (req, res) => {
  const ticket = await Ticket.findById(req.params.id).populate("user", "username");
  if (!ticket) return res.status(404).json({ ok: false, error: "Không tìm thấy yêu cầu." });

  // Ticket cũ (tạo trước khi có tính năng này) chưa có lịch sử -> dựng bản ghi khởi tạo từ ngày tạo
  let history = ticket.statusHistory.map((h) => ({
    from: h.from,
    to: h.to,
    by: h.changedByName || "—",
    at: h.changedAt,
  }));
  if (!history.length) {
    history = [
      { from: null, to: Ticket.STATUS.NEW, by: ticket.user ? ticket.user.username : "—", at: ticket.createdAt },
    ];
  }

  res.json({
    ok: true,
    title: ticket.title,
    code: ticket._id.toString().slice(-6),
    current: ticket.status,
    history,
  });
});

module.exports = router;
