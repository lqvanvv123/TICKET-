const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { requireLogin } = require("../middleware/auth");

// ---- API cho bảng thông báo (dùng chung cho user và admin, chỉ thao tác trên thông báo của chính mình) ----

// Số thông báo chưa đọc (JS phía client hỏi định kỳ)
router.get("/api/notifications/count", requireLogin, async (req, res) => {
  const count = await Notification.countDocuments({
    recipient: req.session.user.id,
    isRead: false,
  });
  res.json({ count });
});

// Danh sách thông báo mới nhất (cả đã đọc lẫn chưa đọc) + số chưa đọc
router.get("/api/notifications", requireLogin, async (req, res) => {
  const recipient = req.session.user.id;
  const [items, unread] = await Promise.all([
    Notification.find({ recipient }).sort({ createdAt: -1 }).limit(50),
    Notification.countDocuments({ recipient, isRead: false }),
  ]);
  res.json({
    unread,
    items: items.map((n) => ({
      id: n._id,
      message: n.message,
      isRead: n.isRead,
      createdAt: n.createdAt,
    })),
  });
});

// Đánh dấu tất cả đã đọc (đặt trước các route có :id)
router.post("/api/notifications/read-all", requireLogin, async (req, res) => {
  await Notification.updateMany({ recipient: req.session.user.id, isRead: false }, { isRead: true });
  res.json({ ok: true });
});

// Xóa tất cả thông báo của mình
router.delete("/api/notifications", requireLogin, async (req, res) => {
  await Notification.deleteMany({ recipient: req.session.user.id });
  res.json({ ok: true });
});

// Đánh dấu 1 thông báo đã đọc
router.post("/api/notifications/:id/read", requireLogin, async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.session.user.id },
    { isRead: true }
  );
  res.json({ ok: true });
});

// Xóa 1 thông báo
router.delete("/api/notifications/:id", requireLogin, async (req, res) => {
  await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.session.user.id });
  res.json({ ok: true });
});

// ---- Route form cũ (giữ lại để tương thích) ----
router.post("/notifications/:id/read", requireLogin, async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.session.user.id },
    { isRead: true }
  );
  res.redirect(req.get("referer") || "/");
});

router.post("/notifications/read-all", requireLogin, async (req, res) => {
  await Notification.updateMany({ recipient: req.session.user.id, isRead: false }, { isRead: true });
  res.redirect(req.get("referer") || "/");
});

module.exports = router;
