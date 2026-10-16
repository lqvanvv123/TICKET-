const express = require("express");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const wrap = require("../middleware/async");
const { requireLogin } = require("../middleware/auth");
const { getTicket, assignTicket } = require("../services/tickets");
const router = express.Router();

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
    res.locals.account = account;
    next();
  }),
);

router.get(
  "/tickets/:id",
  wrap(async (req, res) => {
    const account = res.locals.account;
    const ticket = await getTicket(req.params.id, account);
    if (!ticket)
      return res
        .status(404)
        .send("Không tìm thấy yêu cầu hoặc bạn không có quyền truy cập.");
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
      admins,
      STATUS: Ticket.STATUS,
      STATUS_SLUG: Ticket.STATUS_SLUG,
      PRIORITY_SLUG: Ticket.PRIORITY_SLUG,
      message: req.query.saved === "1" ? "Đã cập nhật người phụ trách." : null,
    });
  }),
);

router.post(
  "/tickets/:id/assignee",
  wrap(async (req, res) => {
    const ticket = await assignTicket(
      req.params.id,
      req.body.assignedTo,
      res.locals.account,
    );
    if (!ticket) return res.status(404).send("Không tìm thấy yêu cầu.");
    if (req.get("Accept") === "application/json") return res.json({ ok: true });
    res.redirect("/tickets/" + req.params.id + "?saved=1");
  }),
);

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
