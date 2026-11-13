const express = require("express");
const router = express.Router();
const multer = require("multer");
const Ticket = require("../models/Ticket");
const Notification = require("../models/Notification");
const User = require("../models/User");
const realtime = require("../utils/realtime");
const { requireLogin, requireRole } = require("../middleware/auth");
const { upload } = require("../middleware/upload");
const { text, ticketErrors } = require('../utils/validation');
const wrap = require('../middleware/async');
const fs = require('fs/promises');

// Trang chính của User: form gửi lỗi + lịch sử yêu cầu
async function renderUser(req, res, extra = {}) {
  // Lọc theo ID trong session để user không xem được yêu cầu của tài khoản khác.
  // populate lấy tên người xử lý; sort -1 đưa yêu cầu mới nhất lên đầu.
  const tickets = await Ticket.find({ user: req.session.user.id }).populate("assignedTo", "username").sort({ createdAt: -1 });
  const notifications = await Notification.find({ recipient: req.session.user.id })
    .sort({ createdAt: -1 })
    .limit(50);

  res.render("user", {
    user: req.session.user,
    tickets,
    deadlines: require('../public/js/deadlines'),
    notifications,
    STATUS_SLUG: Ticket.STATUS_SLUG,
    PRIORITY: Ticket.PRIORITY,
    PRIORITY_SLUG: Ticket.PRIORITY_SLUG,
    REQUEST_TYPE: Ticket.REQUEST_TYPE,
    REQUEST_TYPE_SLUG: Ticket.REQUEST_TYPE_SLUG,
    formError: req.query.error || null,
    formValues: {}, fieldErrors: {},
    ...extra,
  });
}
router.get('/user', requireLogin, requireRole('user'), wrap((req, res) => renderUser(req, res)));

async function rejectTicket(req, res, fieldErrors, message, status = 422) {
  // Xóa file của lần gửi bị từ chối, giữ lại các ô chữ; trình duyệt yêu cầu người dùng chọn lại file.
  await Promise.all((req.files || []).map(file => fs.unlink(file.path).catch(() => {})));
  const body = req.body || {};
  return renderUser(req, res.status(status), { fieldErrors, formError: message,
    formValues: { title: text(body.title), description: text(body.description),
      priority: text(body.priority), requestType: text(body.requestType) } });
}

// Gửi yêu cầu sửa lỗi mới -> thông báo tới toàn bộ admin
router.post(
  "/user/ticket",
  requireLogin,
  requireRole("user"),
  (req, res, next) => {
    // Multer đọc form multipart có file; sau bước này req.body có ô nhập, req.files có file.
    upload.array("attachments", 5)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const msg =
          err.code === "LIMIT_FILE_SIZE"
            ? "Mỗi file đính kèm tối đa 5MB."
            : err.code === "LIMIT_FILE_COUNT"
            ? "Chỉ được đính kèm tối đa 5 file."
            : "Lỗi khi tải file lên.";
        return rejectTicket(req, res, { attachments: msg + ' Vui lòng chọn lại file.' }, msg).catch(next);
      }
      if (err) return next(err);
      next();
    });
  },
  wrap(async (req, res) => {
    const { title, description, priority, requestType } = req.body;

    if (req.fileValidationError) {
      return rejectTicket(req, res, { attachments: req.fileValidationError + ' Vui lòng chọn lại file.' }, req.fileValidationError);
    }
    const errors = ticketErrors(req.body);
    if (Object.keys(errors).length) return rejectTicket(req, res, errors, 'Vui lòng kiểm tra các ô bên dưới. File đính kèm cần chọn lại sau khi sửa lỗi.');

    // Chỉ nhận giá trị thuộc danh sách cho phép, dùng mặc định nếu dữ liệu gửi lên không hợp lệ.
    const validPriority = Object.values(Ticket.PRIORITY).includes(priority)
      ? priority
      : Ticket.PRIORITY.MEDIUM;
    const validType = Object.values(Ticket.REQUEST_TYPE).includes(requestType)
      ? requestType
      : Ticket.REQUEST_TYPE.OTHER;

    // File thật nằm trên ổ đĩa; MongoDB chỉ lưu thông tin và đường dẫn để hiển thị/tải file.
    const attachments = (req.files || []).map((f) => ({
      originalName: f.originalname,
      storedName: f.filename,
      url: "/uploads/tickets/" + f.filename,
      mimetype: f.mimetype,
      size: f.size,
    }));

    // Dùng ID người đăng nhập làm chủ yêu cầu; thêm mốc đầu tiên vào lịch sử ngay khi tạo.
    const ticket = await Ticket.create({
      user: req.session.user.id,
      title: text(title),
      description: text(description),
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

    // $in nghĩa là thuộc một trong các giá trị: thông báo cho cả admin và nhân viên IT.
    // Ticket đã lưu: lỗi gửi thông báo không được làm người dùng tưởng chưa tạo và gửi trùng.
    try {
      const admins = await User.find({ role: { $in: ["admin", "staff"] } });
      if (admins.length) {
        await realtime.notify(
          admins.map((a) => a._id),
          ticket._id,
          `Người dùng "${req.session.user.username}" vừa gửi yêu cầu mới (${validPriority}): "${title}"`
        );
      }

      // Đẩy yêu cầu mới (đã render sẵn dòng bảng) tới các admin đang online
      await ticket.populate("user", "username");
      const html = await realtime.renderAdminTicket(ticket);
      realtime.toAdmins("ticket:created", { id: ticket._id, status: ticket.status, ...html });
    } catch (error) { console.error('Ticket saved; realtime notification failed:', error.message); }
    req.session.uiFlash = 'Đã gửi yêu cầu thành công. Nhóm IT sẽ tiếp nhận và xử lý.';
    res.redirect("/user");
  })
);

router.use('/user/ticket', (error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('Create ticket failed:', error.message);
  rejectTicket(req, res, {}, 'Không thể gửi yêu cầu lúc này. Nội dung đã được giữ lại; vui lòng thử lại và chọn lại file đính kèm.', 500).catch(next);
});

module.exports = router;
