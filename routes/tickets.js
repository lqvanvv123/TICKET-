const express = require("express");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const wrap = require("../middleware/async");
const { requireLogin } = require("../middleware/auth");
const { getTicket, assignTicket } = require("../services/tickets");
const { setDeadline } = require('../services/deadlines');
const deadlines = require('../public/js/deadlines');
const router = express.Router();

// Mọi đường dẫn /tickets đều phải đăng nhập và dùng thông tin tài khoản hiện tại.
router.use(
  "/tickets",
  requireLogin,
  wrap(async (req, res, next) => {
    const account = await User.findById(req.session.user.id)
      .select("username role")
      .lean();
    if (!account)
      return res
        .status(401)
        .send("Tài khoản không còn tồn tại. Vui lòng đăng nhập lại.");
    // res.locals lưu dữ liệu dùng chung trong quá trình xử lý request này.
    res.locals.account = account;
    next();
  }),
);

// GET: đọc chi tiết. getTicket kiểm tra quyền sở hữu nếu người xem là user.
router.get(
  "/tickets/:id",
  wrap(async (req, res) => {
    const account = res.locals.account;
    const ticket = await getTicket(req.params.id, account);
    if (!ticket)
      return res
        .status(404)
        .send("Không tìm thấy yêu cầu hoặc bạn không có quyền truy cập.");
    // Tên biến admins ở đây chứa cả admin và staff để admin chọn người nhận việc.
    const admins =
      account.role === "admin"
        ? await User.find({ role: { $in: ["admin", "staff"] } })
            .select("username")
            .sort({ username: 1 })
            .lean()
        : [];
    res.render("ticket-detail", {
      user: {
        id: String(account._id),
        username: account.username,
        role: account.role,
      },
      ticket,
      deadlines,
      admins,
      STATUS: Ticket.STATUS,
      STATUS_SLUG: Ticket.STATUS_SLUG,
      PRIORITY_SLUG: Ticket.PRIORITY_SLUG,
      message: req.query.deadlineSaved === '1' ? 'Đã cập nhật hạn xử lý.' : req.query.saved === "1" ? "Đã cập nhật người phụ trách." : null,
    });
  }),
);

// Chỉ Admin được sửa hạn; service kiểm tra lại quyền và lưu lịch sử trong cùng lần ghi.
router.post('/tickets/:id/deadline', wrap(async (req, res) => {
  const ticket = await setDeadline(req.params.id, req.body.dueAt, res.locals.account);
  if (req.get('Accept') === 'application/json') return res.json({ ok: true, dueAt: ticket.dueAt || null });
  res.redirect('/tickets/' + req.params.id + '?deadlineSaved=1');
}));

// POST: thực hiện phân công. Route nhận dữ liệu, service chịu trách nhiệm kiểm tra và lưu.
router.post(
  "/tickets/:id/assignee",
  wrap(async (req, res) => {
    const ticket = await assignTicket(
      req.params.id,
      req.body.assignedTo,
      res.locals.account,
    );
    if (!ticket) return res.status(404).send("Không tìm thấy yêu cầu.");
    // fetch nhận JSON; form HTML thông thường được chuyển về trang chi tiết sau khi lưu.
    if (req.get("Accept") === "application/json") return res.json({ ok: true });
    res.redirect("/tickets/" + req.params.id + "?saved=1");
  }),
);

// wrap chuyển lỗi async vào đây; trả thông báo nghiệp vụ hoặc thông báo chung khi lỗi hệ thống.
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const message = err.status
    ? err.message
    : "Không thể xử lý yêu cầu. Vui lòng thử lại.";
  if (req.get("Accept") === "application/json")
    return res.status(err.status || 500).json({ ok: false, error: message });
  res.status(err.status || 500).send(message);
});
module.exports = router;
