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
const realtime = require("../utils/realtime");
const { releaseAssignments } = require("../services/tickets");
const wrap = require("../middleware/async");
const { text, authErrors } = require('../utils/validation');

// Dùng chung hai lớp kiểm tra cho mọi route quản lý tài khoản: đăng nhập và đúng vai trò admin.
const guard = [requireLogin, requireRole("admin")];
const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads", "tickets");

const back = (res, { msg, error } = {}) => {
  const qs = msg
    ? "?msg=" + encodeURIComponent(msg)
    : error
      ? "?error=" + encodeURIComponent(error)
      : "";
  res.redirect("/admin/users" + qs);
};

const isSelf = (req, id) => String(req.session.user.id) === String(id);
const validId = (id) => mongoose.Types.ObjectId.isValid(id);

// Escape ký tự đặc biệt để tìm kiếm theo username không bị hiểu thành regex
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- Danh sách người dùng (có tìm kiếm + lọc vai trò) ----
async function renderUsers(req, res, extra = {}) {
  const q = (req.query.q || "").trim();
  const roleFilter = ["user", "staff", "admin"].includes(req.query.role)
    ? req.query.role
    : "";

  const filter = {};
  if (q) filter.username = { $regex: escapeRegex(q), $options: "i" };
  if (roleFilter) filter.role = roleFilter;

  const [
    users,
    ticketCounts,
    notifications,
    totalUsers,
    totalAdmins,
    totalStaff,
  // Lấy danh sách, thống kê yêu cầu và số lượng từng vai trò đồng thời vì chúng độc lập nhau.
  ] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }),
    // Gom ticket theo người GỬI: total đếm tất cả, open chỉ đếm ticket chưa hoàn thành.
    Ticket.aggregate([
      {
        $group: {
          _id: "$user",
          total: { $sum: 1 },
          open: {
            $sum: { $cond: [{ $ne: ["$status", Ticket.STATUS.DONE] }, 1, 0] },
          },
        },
      },
    ]),
    Notification.find({ recipient: req.session.user.id })
      .sort({ createdAt: -1 })
      .limit(50),
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "admin" }),
    User.countDocuments({ role: "staff" }),
  ]);

  // Bảng tra ID → thống kê giúp template lấy số lượng trực tiếp cho mỗi dòng tài khoản.
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
    totalStaff,
    flashMsg: req.query.msg || null,
    flashError: req.query.error || null,
    fieldErrors: {}, formValues: {}, ...extra,
  });
}
router.get('/admin/users', ...guard, wrap((req, res) => renderUsers(req, res)));

// ---- Tạo tài khoản mới ----
router.post("/admin/users", ...guard, wrap(async (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  const role = req.body.role || "user";
  const errors = authErrors(req.body);
  if (username.length < 3 || username.length > 30) errors.username = 'Tên đăng nhập phải từ 3 đến 30 ký tự.';
  if (password.length < 6) errors.password = 'Mật khẩu phải có ít nhất 6 ký tự.';
  if (!['user', 'staff', 'admin'].includes(role)) errors.role = 'Vai trò không hợp lệ.';
  if (!Object.keys(errors).length && await User.findOne({ username })) errors.username = 'Tên đăng nhập đã tồn tại.';
  if (Object.keys(errors).length) return renderUsers(req, res.status(422), {
    fieldErrors: errors, formValues: { username: text(username), role }, flashError: 'Vui lòng kiểm tra các ô trong phần tạo tài khoản.',
  });
  await User.create({
    username,
    password: await bcrypt.hash(password, 10),
    role,
  });
  back(res, {
    msg: `Đã tạo tài khoản "${username}" (${role === "admin" ? "Admin IT" : role === "staff" ? "Nhân viên IT" : "Người dùng"}).`,
  });
}));

// ---- Đổi vai trò ----
router.post(
  "/admin/users/:id/role",
  ...guard,
  wrap(async (req, res) => {
    const { id } = req.params;
    const role = req.body.role || "user";
    if (!["user", "staff", "admin"].includes(role))
      return back(res, { error: "Vai trò không hợp lệ." });
    if (!validId(id)) return back(res, { error: "Tài khoản không hợp lệ." });
    if (isSelf(req, id))
      return back(res, { error: "Bạn không thể đổi vai trò của chính mình." });

    const target = await User.findByIdAndUpdate(id, { role }, { new: true });
    if (!target) return back(res, { error: "Không tìm thấy tài khoản." });
    // Hạ quyền về user thì bỏ các việc đang phụ trách, tránh để việc thuộc tài khoản không còn xử lý được.
    if (role === "user") await releaseAssignments(id, req.session.user);
    realtime.disconnectUser(id);
    back(res, {
      msg: `Đã đổi "${target.username}" thành ${role === "admin" ? "Admin IT" : role === "staff" ? "Nhân viên IT" : "Người dùng"}.`,
    });
  }),
);

// ---- Đặt lại mật khẩu ----
router.post("/admin/users/:id/password", ...guard, async (req, res) => {
  const { id } = req.params;
  const password = req.body.password || "";
  if (!validId(id)) return back(res, { error: "Tài khoản không hợp lệ." });
  if (password.length < 6)
    return back(res, { error: "Mật khẩu mới phải có ít nhất 6 ký tự." });

  const target = await User.findByIdAndUpdate(id, {
    password: await bcrypt.hash(password, 10),
  });
  if (!target) return back(res, { error: "Không tìm thấy tài khoản." });
  back(res, { msg: `Đã đặt lại mật khẩu cho "${target.username}".` });
});

// ---- Xoá tài khoản (kèm toàn bộ dữ liệu của tài khoản đó) ----
router.post(
  "/admin/users/:id/delete",
  ...guard,
  wrap(async (req, res) => {
    const { id } = req.params;
    if (!validId(id)) return back(res, { error: "Tài khoản không hợp lệ." });
    if (isSelf(req, id))
      return back(res, {
        error: "Bạn không thể xoá chính tài khoản đang đăng nhập.",
      });

    const target = await User.findById(id);
    if (!target) return back(res, { error: "Không tìm thấy tài khoản." });
    // Bỏ phân công trên yêu cầu của người khác trước khi xóa tài khoản đang phụ trách.
    await releaseAssignments(id, req.session.user);

    // Xoá file đính kèm trên đĩa trước khi xoá ticket (basename để tránh path traversal)
    const tickets = await Ticket.find({ user: id }, "attachments");
    tickets.forEach((t) =>
      (t.attachments || []).forEach((a) => {
        fs.unlink(path.join(UPLOAD_DIR, path.basename(a.storedName)), () => {});
      }),
    );

    // Xóa các nhóm dữ liệu liên quan. Promise.all chạy đồng thời, không phải transaction:
    // nếu một thao tác lỗi, các thao tác khác đã thành công không tự được hoàn tác.
    await Promise.all([
      Ticket.deleteMany({ user: id }),
      Notification.deleteMany({
        $or: [
          { recipient: id },
          { ticket: { $in: tickets.map((t) => t._id) } },
        ],
      }),
      ChatMessage.deleteMany({ user: id }),
      User.deleteOne({ _id: id }),
    ]);

    realtime.disconnectUser(id);

    // Các admin khác đang mở danh sách sẽ thấy các yêu cầu của tài khoản này biến mất ngay
    tickets.forEach((t) => realtime.toAdmins("ticket:deleted", { id: t._id }));

    back(res, {
      msg: `Đã xoá tài khoản "${target.username}" và dữ liệu liên quan.`,
    });
  }),
);

module.exports = router;
