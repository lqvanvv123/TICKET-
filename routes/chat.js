const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const ChatMessage = require("../models/ChatMessage");
const User = require("../models/User");
const { requireLogin, requireRole } = require("../middleware/auth");

// ============ Phía USER: 1 cuộc trò chuyện duy nhất với team IT ============

// Lấy toàn bộ tin nhắn của user hiện tại + đánh dấu đã đọc phần admin gửi
router.get("/chat/api/messages", requireLogin, requireRole("user"), async (req, res) => {
  const userId = req.session.user.id;
  const messages = await ChatMessage.find({ user: userId }).sort({ createdAt: 1 }).limit(200);

  await ChatMessage.updateMany(
    { user: userId, senderRole: "admin", readByUser: false },
    { $set: { readByUser: true } }
  );

  res.json({
    messages: messages.map((m) => ({
      id: m._id,
      text: m.text,
      senderRole: m.senderRole,
      createdAt: m.createdAt,
    })),
  });
});

// User gửi tin nhắn mới cho team IT
router.post("/chat/api/messages", requireLogin, requireRole("user"), async (req, res) => {
  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ ok: false, error: "Nội dung trống." });

  const msg = await ChatMessage.create({
    user: req.session.user.id,
    sender: req.session.user.id,
    senderRole: "user",
    text,
    readByUser: true,
    readByAdmin: false,
  });

  res.json({ ok: true, message: { id: msg._id, text: msg.text, senderRole: msg.senderRole, createdAt: msg.createdAt } });
});

// Số tin nhắn admin gửi mà user chưa đọc (hiện badge trên nút chat)
router.get("/chat/api/unread-count", requireLogin, requireRole("user"), async (req, res) => {
  const count = await ChatMessage.countDocuments({
    user: req.session.user.id,
    senderRole: "admin",
    readByUser: false,
  });
  res.json({ count });
});

// ============ Phía ADMIN: danh sách cuộc trò chuyện + chi tiết từng user ============

// Danh sách user đã từng chat, kèm tin nhắn cuối + số tin chưa đọc
router.get("/chat/api/conversations", requireLogin, requireRole("admin"), async (req, res) => {
  const conversations = await ChatMessage.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$user",
        lastText: { $first: "$text" },
        lastAt: { $first: "$createdAt" },
        lastSenderRole: { $first: "$senderRole" },
      },
    },
    { $sort: { lastAt: -1 } },
  ]);

  const userIds = conversations.map((c) => c._id);
  const users = await User.find({ _id: { $in: userIds } }, "username");
  const usernameById = {};
  users.forEach((u) => (usernameById[u._id.toString()] = u.username));

  const unreadCounts = await ChatMessage.aggregate([
    { $match: { senderRole: "user", readByAdmin: false, user: { $in: userIds } } },
    { $group: { _id: "$user", count: { $sum: 1 } } },
  ]);
  const unreadByUser = {};
  unreadCounts.forEach((u) => (unreadByUser[u._id.toString()] = u.count));

  res.json({
    conversations: conversations.map((c) => ({
      userId: c._id,
      username: usernameById[c._id.toString()] || "N/A",
      lastText: c.lastText,
      lastAt: c.lastAt,
      lastSenderRole: c.lastSenderRole,
      unread: unreadByUser[c._id.toString()] || 0,
    })),
  });
});

// Tổng số tin nhắn chưa đọc (mọi user) — hiện badge trên nút chat của admin
router.get("/chat/api/admin-unread-count", requireLogin, requireRole("admin"), async (req, res) => {
  const count = await ChatMessage.countDocuments({ senderRole: "user", readByAdmin: false });
  res.json({ count });
});

// Lấy tin nhắn với 1 user cụ thể + đánh dấu đã đọc phần user gửi
router.get("/chat/api/messages/:userId", requireLogin, requireRole("admin"), async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ error: "userId không hợp lệ" });

  const messages = await ChatMessage.find({ user: userId }).sort({ createdAt: 1 }).limit(200);

  await ChatMessage.updateMany(
    { user: userId, senderRole: "user", readByAdmin: false },
    { $set: { readByAdmin: true } }
  );

  res.json({
    messages: messages.map((m) => ({
      id: m._id,
      text: m.text,
      senderRole: m.senderRole,
      createdAt: m.createdAt,
    })),
  });
});

// Admin gửi tin nhắn cho 1 user cụ thể
router.post("/chat/api/messages/:userId", requireLogin, requireRole("admin"), async (req, res) => {
  const { userId } = req.params;
  const text = (req.body.text || "").trim();
  if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ error: "userId không hợp lệ" });
  if (!text) return res.status(400).json({ ok: false, error: "Nội dung trống." });

  const msg = await ChatMessage.create({
    user: userId,
    sender: req.session.user.id,
    senderRole: "admin",
    text,
    readByAdmin: true,
    readByUser: false,
  });

  res.json({ ok: true, message: { id: msg._id, text: msg.text, senderRole: msg.senderRole, createdAt: msg.createdAt } });
});

module.exports = router;
