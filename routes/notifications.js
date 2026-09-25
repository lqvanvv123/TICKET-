const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { requireLogin } = require("../middleware/auth");

// API cho JS phía client hỏi định kỳ (polling) số thông báo chưa đọc
router.get("/api/notifications/count", requireLogin, async (req, res) => {
  const count = await Notification.countDocuments({
    recipient: req.session.user.id,
    isRead: false,
  });
  res.json({ count });
});

// Đánh dấu 1 thông báo đã đọc
router.post("/notifications/:id/read", requireLogin, async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.session.user.id },
    { isRead: true }
  );
  res.redirect(req.get("referer") || "/");
});

// Đánh dấu tất cả thông báo đã đọc
router.post("/notifications/read-all", requireLogin, async (req, res) => {
  await Notification.updateMany(
    { recipient: req.session.user.id, isRead: false },
    { isRead: true }
  );
  res.redirect(req.get("referer") || "/");
});

module.exports = router;
