const express = require("express");
const router = express.Router();
const multer = require("multer");
const Ticket = require("../models/Ticket");
const Notification = require("../models/Notification");
const User = require("../models/User");
const realtime = require("../utils/realtime");
const { requireLogin, requireRole } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

// Trang chính của User: form gửi lỗi + lịch sử yêu cầu
router.get("/user", requireLogin, requireRole("user"), async (req, res) => {
  const tickets = await Ticket.find({ user: req.session.user.id }).sort({ createdAt: -1 });
  const notifications = await Notification.find({ recipient: req.session.user.id })
    .sort({ createdAt: -1 })
    .limit(50);

  res.render("user", {
    user: req.session.user,
    tickets,
    notifications,
    STATUS_SLUG: Ticket.STATUS_SLUG,
    PRIORITY: Ticket.PRIORITY,
    PRIORITY_SLUG: Ticket.PRIORITY_SLUG,
    REQUEST_TYPE: Ticket.REQUEST_TYPE,
    REQUEST_TYPE_SLUG: Ticket.REQUEST_TYPE_SLUG,
    formError: req.query.error || null,
  });
});

// Gửi yêu cầu sửa lỗi mới -> thông báo tới toàn bộ admin
router.post(
  "/user/ticket",
  requireLogin,
  requireRole("user"),
  (req, res, next) => {
    upload.array("attachments", 5)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const msg =
          err.code === "LIMIT_FILE_SIZE"
            ? "Mỗi file đính kèm tối đa 5MB."
            : err.code === "LIMIT_FILE_COUNT"
            ? "Chỉ được đính kèm tối đa 5 file."
            : "Lỗi khi tải file lên.";
        return res.redirect("/user?error=" + encodeURIComponent(msg));
      }
      if (err) return next(err);
      next();
    });
  },
  async (req, res) => {
    const { title, description, priority, requestType } = req.body;

    if (req.fileValidationError) {
      return res.redirect("/user?error=" + encodeURIComponent(req.fileValidationError));
    }
    if (!title || !description) return res.redirect("/user");

    const validPriority = Object.values(Ticket.PRIORITY).includes(priority)
      ? priority
      : Ticket.PRIORITY.MEDIUM;
    const validType = Object.values(Ticket.REQUEST_TYPE).includes(requestType)
      ? requestType
      : Ticket.REQUEST_TYPE.OTHER;

    const attachments = (req.files || []).map((f) => ({
      originalName: f.originalname,
      storedName: f.filename,
      url: "/uploads/tickets/" + f.filename,
      mimetype: f.mimetype,
      size: f.size,
    }));

    const ticket = await Ticket.create({
      user: req.session.user.id,
      title,
      description,
      priority: validPriority,
      requestType: validType,
      attachments,
      statusHistory: [
        {
          from: null,
          to: Ticket.STATUS.NEW,
          changedBy: req.session.user.id,
          changedByName: req.session.user.username,
        },
      ],
    });

    const admins = await User.find({ role: "admin" });
    if (admins.length) {
      await realtime.notify(
        admins.map((a) => a._id),
        ticket._id,
        `Người dùng "${req.session.user.username}" vừa gửi yêu cầu mới (${validPriority}): "${title}"`
      );
    }

    // Đẩy yêu cầu mới (đã render sẵn dòng bảng + thẻ Kanban) tới các admin đang online
    await ticket.populate("user", "username");
    const html = await realtime.renderAdminTicket(ticket);
    realtime.toAdmins("ticket:created", { id: ticket._id, status: ticket.status, ...html });

    res.redirect("/user");
  }
);

module.exports = router;
