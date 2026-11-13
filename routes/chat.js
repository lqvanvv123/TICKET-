const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const ChatMessage = require("../models/ChatMessage");
const User = require("../models/User");
const { requireLogin, requireRole } = require("../middleware/auth");

// Dữ liệu 1 tin nhắn trả về cho giao diện: có tên người gửi và cờ "tin của chính mình"
function chatMessageDto(m, viewerId) {
  // DTO là dữ liệu rút gọn gửi ra trình duyệt; isMine xác định tin nhắn do chính người xem gửi.
  const sender = m.sender && m.sender._id ? m.sender : null;
  return {
    id: m._id,
    text: m.text,
    senderRole: m.senderRole,
    senderName: sender ? sender.username : m.senderRole !== "user" ? "IT Support" : "Người dùng",
    isMine: String(sender ? sender._id : m.sender) === String(viewerId),
    createdAt: m.createdAt,
  };
}

// ============ Phía USER: 1 cuộc trò chuyện duy nhất với team IT ============

// Lấy toàn bộ tin nhắn của user hiện tại + đánh dấu đã đọc phần admin gửi
router.get("/chat/api/messages", requireLogin, requireRole("user"), async (req, res) => {
  const userId = req.session.user.id;
  const messages = await ChatMessage.find({ user: userId })
    // Sắp cũ → mới để đọc theo thứ tự hội thoại; limit giới hạn số bản ghi trả về.
    .sort({ createdAt: 1 })
    .limit(200)
    .populate("sender", "username");

  // User mở cuộc trò chuyện thì đánh dấu các tin từ nhóm IT là đã đọc.
  await ChatMessage.updateMany(
    { user: userId, senderRole: { $in: ["admin", "staff"] }, readByUser: false },
    { $set: { readByUser: true } }
  );

  res.json({
    messages: messages.map((m) => chatMessageDto(m, req.session.user.id)),
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
    senderRole: { $in: ["admin", "staff"] },
    readByUser: false,
  });
  res.json({ count });
});

// ============ Phía ADMIN: danh sách cuộc trò chuyện + chi tiết từng user ============

// Danh sách user đã từng chat, kèm tin nhắn cuối + số tin chưa đọc
router.get("/chat/api/conversations", requireLogin, requireRole("admin", "staff"), async (req, res) => {
  // Pipeline: sắp tin mới nhất trước → gom theo user → lấy tin đầu mỗi nhóm → sắp hội thoại.
  // Nhờ sắp trước nên $first lấy đúng tin mới nhất, không phải tin đầu tiên từng gửi.
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

  // Lấy tên các user trong một truy vấn rồi tạo bảng ID → tên, tránh truy vấn từng hội thoại.
  const userIds = conversations.map((c) => c._id);
  const users = await User.find({ _id: { $in: userIds } }, "username");
  const usernameById = {};
  users.forEach((u) => (usernameById[u._id.toString()] = u.username));

  // $match lọc tin user chưa được nhóm IT đọc; $group gom theo user, $sum: 1 đếm từng tin.
  // readByAdmin là trạng thái đọc chung của nhóm IT, không tách riêng từng nhân viên.
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
router.get("/chat/api/admin-unread-count", requireLogin, requireRole("admin", "staff"), async (req, res) => {
  const count = await ChatMessage.countDocuments({ senderRole: "user", readByAdmin: false });
  res.json({ count });
});

// Lấy tin nhắn với 1 user cụ thể + đánh dấu đã đọc phần user gửi
router.get("/chat/api/messages/:userId", requireLogin, requireRole("admin", "staff"), async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ error: "userId không hợp lệ" });

  const messages = await ChatMessage.find({ user: userId })
    .sort({ createdAt: 1 })
    .limit(200)
    .populate("sender", "username");

  await ChatMessage.updateMany(
    { user: userId, senderRole: "user", readByAdmin: false },
    { $set: { readByAdmin: true } }
  );

  res.json({
    messages: messages.map((m) => chatMessageDto(m, req.session.user.id)),
  });
});

// Admin gửi tin nhắn cho 1 user cụ thể
router.post("/chat/api/messages/:userId", requireLogin, requireRole("admin", "staff"), async (req, res) => {
  const { userId } = req.params;
  const text = (req.body.text || "").trim();
  if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ error: "userId không hợp lệ" });
  if (!text) return res.status(400).json({ ok: false, error: "Nội dung trống." });

  const msg = await ChatMessage.create({
    user: userId,
    sender: req.session.user.id,
    senderRole: req.session.user.role,
    // Lưu đúng người và vai trò gửi để hiển thị tên nhân viên hỗ trợ trong cuộc trò chuyện.
    text,
    readByAdmin: true,
    readByUser: false,
  });

  res.json({ ok: true, message: { id: msg._id, text: msg.text, senderRole: msg.senderRole, createdAt: msg.createdAt } });
});

module.exports = router;
