const express = require("express");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const router = express.Router();

const User = require("../models/User");
const Ticket = require("../models/Ticket");
const Notification = require("../models/Notification");
const ChatMessage = require("../models/ChatMessage");
const { requireLogin, requireRole } = require("../middleware/auth");

const guard = [requireLogin, requireRole("admin")];
const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads", "tickets");

const back = (res, { msg, error } = {}) => {
  const qs = msg ? "?msg=" + encodeURIComponent(msg) : error ? "?error=" + encodeURIComponent(error) : "";
  res.redirect("/admin/users" + qs);
};

const isSelf = (req, id) => String(req.session.user.id) === String(id);
const validId = (id) => mongoose.Types.ObjectId.isValid(id);

// Escape ký tự đặc biệt để tìm kiếm theo username không bị hiểu thành regex
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- Danh sách người dùng (có tìm kiếm + lọc vai trò) ----
router.get("/admin/users", ...guard, async (req, res) => {
  const q = (req.query.q || "").trim();
  const roleFilter = ["user", "admin"].includes(req.query.role) ? req.query.role : "";

  const filter = {};
  if (q) filter.username = { $regex: escapeRegex(q), $options: "i" };
  if (roleFilter) filter.role = roleFilter;

  const [users, ticketCounts, notifications, totalUsers, totalAdmins] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }),
    Ticket.aggregate([{ $group: { _id: "$user", total: { $sum: 1 }, open: { $sum: { $cond: [{ $ne: ["$status", Ticket.STATUS.DONE] }, 1, 0] } } } }]),
    Notification.find({ recipient: req.session.user.id, isRead: false }).sort({ createdAt: -1 }),
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "admin" }),
  ]);

  const countsById = {};
  ticketCounts.forEach((c) => (countsById[String(c._id)] = c));

  res.render("admin-users", {
    user: req.session.user,
    users,
    countsById,
    notifications,
    activeTab: "users",
    q,
    roleFilter,
    totalUsers,
    totalAdmins,
    flashMsg: req.query.msg || null,
    flashError: req.query.error || null,
  });
});

// ---- Tạo tài khoản mới ----
router.post("/admin/users", ...guard, async (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  const role = req.body.role === "admin" ? "admin" : "user";

  if (!username || !password) return back(res, { error: "Vui lòng nhập tên đăng nhập và mật khẩu." });
  if (username.length < 3 || username.length > 30) return back(res, { error: "Tên đăng nhập phải từ 3 đến 30 ký tự." });
  if (password.length < 6) return back(res, { error: "Mật khẩu phải có ít nhất 6 ký tự." });
  if (await User.findOne({ username })) return back(res, { error: `Tên đăng nhập "${username}" đã tồn tại.` });

  await User.create({ username, password: await bcrypt.hash(password, 10), role });
  back(res, { msg: `Đã tạo tài khoản "${username}" (${role === "admin" ? "Admin IT" : "Người dùng"}).` });
});

// ---- Đổi vai trò ----
router.post("/admin/users/:id/role", ...guard, async (req, res) => {
  const { id } = req.params;
  const role = req.body.role === "admin" ? "admin" : "user";
  if (!validId(id)) return back(res, { error: "Tài khoản không hợp lệ." });
  if (isSelf(req, id)) return back(res, { error: "Bạn không thể đổi vai trò của chính mình." });

  const target = await User.findByIdAndUpdate(id, { role }, { new: true });
  if (!target) return back(res, { error: "Không tìm thấy tài khoản." });
  back(res, { msg: `Đã đổi "${target.username}" thành ${role === "admin" ? "Admin IT" : "Người dùng"}.` });
});

// ---- Đặt lại mật khẩu ----
router.post("/admin/users/:id/password", ...guard, async (req, res) => {
  const { id } = req.params;
  const password = req.body.password || "";
  if (!validId(id)) return back(res, { error: "Tài khoản không hợp lệ." });
  if (password.length < 6) return back(res, { error: "Mật khẩu mới phải có ít nhất 6 ký tự." });

  const target = await User.findByIdAndUpdate(id, { password: await bcrypt.hash(password, 10) });
  if (!target) return back(res, { error: "Không tìm thấy tài khoản." });
  back(res, { msg: `Đã đặt lại mật khẩu cho "${target.username}".` });
});

// ---- Xoá tài khoản (kèm toàn bộ dữ liệu của tài khoản đó) ----
router.post("/admin/users/:id/delete", ...guard, async (req, res) => {
  const { id } = req.params;
  if (!validId(id)) return back(res, { error: "Tài khoản không hợp lệ." });
  if (isSelf(req, id)) return back(res, { error: "Bạn không thể xoá chính tài khoản đang đăng nhập." });

  const target = await User.findById(id);
  if (!target) return back(res, { error: "Không tìm thấy tài khoản." });

  // Xoá file đính kèm trên đĩa trước khi xoá ticket (basename để tránh path traversal)
  const tickets = await Ticket.find({ user: id }, "attachments");
  tickets.forEach((t) =>
    (t.attachments || []).forEach((a) => {
      fs.unlink(path.join(UPLOAD_DIR, path.basename(a.storedName)), () => {});
    })
  );

  await Promise.all([
    Ticket.deleteMany({ user: id }),
    Notification.deleteMany({ $or: [{ recipient: id }, { ticket: { $in: tickets.map((t) => t._id) } }] }),
    ChatMessage.deleteMany({ user: id }),
    User.deleteOne({ _id: id }),
  ]);

  back(res, { msg: `Đã xoá tài khoản "${target.username}" và dữ liệu liên quan.` });
});

module.exports = router;
