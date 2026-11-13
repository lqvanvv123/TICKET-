const express = require("express");
const router = express.Router();
const Ticket = require("../models/Ticket");
const Notification = require("../models/Notification");
const fs = require("fs");
const path = require("path");
const realtime = require("../utils/realtime");
const { UPLOAD_DIR } = require("../middleware/upload");
const { requireLogin, requireRole } = require("../middleware/auth");
const wrap = require("../middleware/async");
const deadlines = require('../public/js/deadlines');
const { loadTicketList, listMetadata } = require('../services/ticket-list');
const { parseTicketFilters } = require('../utils/ticket-filters');

const commonLocals = () => ({
  deadlines,
  STATUS: Ticket.STATUS,
  STATUS_SLUG: Ticket.STATUS_SLUG,
  PRIORITY: Ticket.PRIORITY,
  PRIORITY_SLUG: Ticket.PRIORITY_SLUG,
  PRIORITY_WEIGHT: Ticket.PRIORITY_WEIGHT,
  REQUEST_TYPE: Ticket.REQUEST_TYPE,
  REQUEST_TYPE_SLUG: Ticket.REQUEST_TYPE_SLUG,
});

// Lấy toàn bộ thông báo (mới nhất trước) để hiển thị trong bảng thông báo
async function getNotifications(userId) {
  return Notification.find({ recipient: userId })
    .sort({ createdAt: -1 })
    .limit(50);
}

// Cập nhật trạng thái ticket + tạo thông báo tương ứng cho user.
// Dùng cho bảng danh sách, hỗ trợ form submit và AJAX.
async function applyStatusChange(ticketId, status, admin) {
  // Biến admin là tài khoản đang thao tác, có thể mang vai trò admin HOẶC staff.
  // Kiểm tra lần lượt: trạng thái hợp lệ → ticket tồn tại → đúng người phụ trách.
  const validStatuses = Object.values(Ticket.STATUS);
  if (!validStatuses.includes(status)) return null;

  const current = await Ticket.findById(ticketId);
  if (!current) return null;
  // Chuyển ID về chuỗi để so sánh được ObjectId từ MongoDB với ID trong session.
  if (
    admin.role === "staff" &&
    String(current.assignedTo || "") !== String(admin.id)
  ) {
    throw Object.assign(
      new Error(
        "Bạn chỉ được cập nhật yêu cầu do mình phụ trách. Hãy nhận xử lý trước.",
      ),
      { status: 403 },
    );
  }
  // Không đổi gì thì không ghi thêm lịch sử / không gửi thông báo trùng
  if (current.status === status) return current;

  const update = { status };
  // Hoàn thành thì ghi thời điểm kết thúc; chuyển sang trạng thái khác thì xóa mốc đó.
  if (status === Ticket.STATUS.DONE) update.resolvedAt = new Date();
  else update.resolvedAt = null;

  // Kiểm tra quyền ngay lúc ghi: nếu admin vừa chuyển việc cho người khác,
  // staff đang mở trang cũ sẽ không cập nhật được nữa. Đồng thời kiểm tra trạng thái cũ.
  const ticket = await Ticket.findOneAndUpdate(
    {
      _id: ticketId,
      status: current.status,
      // ... thêm điều kiện assignedTo chỉ khi là staff; admin không bị giới hạn theo người nhận.
      ...(admin.role === "staff" ? { assignedTo: admin.id } : {}),
    },
    {
      ...update,
      $push: {
        // Lưu ai đổi, đổi từ đâu sang đâu và lúc nào để hiển thị lịch sử xử lý.
        statusHistory: {
          from: current.status,
          to: status,
          changedBy: admin && admin.id,
          changedByName: (admin && admin.username) || "",
          changedAt: new Date(),
        },
      },
    },
    { new: true },
  );
  if (!ticket)
    throw Object.assign(
      new Error(
        "Yêu cầu vừa thay đổi người phụ trách hoặc trạng thái. Vui lòng tải lại.",
      ),
      { status: 409 },
    );

  if (status === Ticket.STATUS.DONE) {
    await realtime.notify(
      [ticket.user],
      ticket._id,
      `Lỗi "${ticket.title}" của bạn đã được sửa xong!`,
    );
  } else if (status === Ticket.STATUS.IN_PROGRESS) {
    await realtime.notify(
      [ticket.user],
      ticket._id,
      `Lỗi "${ticket.title}" của bạn đang được IT xử lý.`,
    );
  }

  // Đẩy trạng thái mới tới mọi admin và tới chủ yêu cầu ngay lập tức
  const payload = {
    id: ticket._id,
    status: ticket.status,
    slug: Ticket.STATUS_SLUG[ticket.status],
    resolvedAt: ticket.resolvedAt,
  };
  realtime.toAdmins("ticket:updated", payload);
  realtime.toUser(ticket.user, "ticket:updated", payload);

  return ticket;
}

// ---- Danh sách (bảng) ----
router.get(
  "/admin",
  requireLogin,
  requireRole("admin", "staff"),
  wrap(async (req, res) => {
    let data, filterError = null;
    try { data = await loadTicketList(req.query, req.session.user); }
    catch(error) {
      if(error.status !== 400)throw error;
      filterError = error.message;
      // URL lỗi không được âm thầm trở thành một báo cáo toàn bộ yêu cầu.
      data = {tickets:[],...listMetadata(parseTicketFilters({},req.session.user).filters,
        {total:0,page:1,pages:1,pageSize:20,from:0,to:0})};
      res.status(400);
    }
    res.render('admin', {...data,filterError,user:req.session.user,activeTab:'list',
      notifications:await getNotifications(req.session.user.id),...commonLocals()});
  }),
);

// Lấy lại đúng trang/bộ lọc khi realtime thay đổi; không tự chèn một dòng sai điều kiện.
router.get('/admin/tickets/data', requireLogin, requireRole('admin','staff'), async (req,res) => {
  try {
    const data = await loadTicketList(req.query,req.session.user);
    const html = await require('ejs').renderFile(path.join(__dirname,'..','views','partials','admin-ticket-list.ejs'),
      {...data,user:req.session.user,filterError:null,...commonLocals()});
    res.set('Cache-Control','no-store');
    res.json({ok:true,html,total:data.pagination.total,url:data.listUrl});
  } catch(error) {
    res.status(error.status === 400 ? 400 : 500).json({ok:false,error:error.status === 400 ? error.message : 'Không thể tải danh sách. Vui lòng thử lại.'});
  }
});

// ---- Dashboard: lọc theo ngày tạo, xem phân công và công việc cần ưu tiên ----
async function dashboardLocals(req, query = req.query) {
  const data = await require('../services/dashboard').loadDashboard(query, req.session.user);
  return { ...data, user: req.session.user, ...commonLocals() };
}
router.get('/admin/dashboard', requireLogin, requireRole('admin', 'staff'), wrap(async (req, res) => {
  let locals, filterError = null;
  try { locals = await dashboardLocals(req); }
  catch (error) {
    if (error.status !== 400) throw error;
    filterError = error.message + ' Đang hiển thị dữ liệu toàn thời gian.';
    locals = await dashboardLocals(req, { range: 'all' });
    res.status(400);
  }
  res.render('admin-dashboard', { ...locals, filterError,
    notifications: await getNotifications(req.session.user.id), activeTab: 'dashboard' });
}));

// Trả lại nội dung và số liệu biểu đồ để làm mới mà không tải lại toàn trang.
router.get('/admin/dashboard/data', requireLogin, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const locals = await dashboardLocals(req);
    const html = await require('ejs').renderFile(path.join(__dirname, '..', 'views', 'partials', 'dashboard-content.ejs'), locals);
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, html, chartData: locals.chartData, generatedAt: locals.generatedAt });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.status === 400 ? error.message : 'Không thể tải thống kê. Vui lòng thử lại.' });
  }
});

// ---- Cập nhật trạng thái từ bảng danh sách (form submit truyền thống) ----
router.post(
  "/admin/ticket/:id",
  requireLogin,
  requireRole("admin", "staff"),
  wrap(async (req, res) => {
    await applyStatusChange(req.params.id, req.body.status, req.session.user);
    res.redirect("/admin");
  }),
);

// ---- Cập nhật trạng thái từ ô chọn trong danh sách (AJAX, trả về JSON) ----
router.post(
  "/admin/ticket/:id/status",
  requireLogin,
  requireRole("admin", "staff"),
  wrap(async (req, res) => {
    const ticket = await applyStatusChange(
      req.params.id,
      req.body.status,
      req.session.user,
    );
    if (!ticket)
      return res
        .status(400)
        .json({ ok: false, error: "Trạng thái không hợp lệ." });
    res.json({
      ok: true,
      status: ticket.status,
      slug: Ticket.STATUS_SLUG[ticket.status],
      resolvedAt: ticket.resolvedAt,
    });
  }),
);

// ---- Xóa yêu cầu (AJAX) -> báo thời gian thực cho mọi admin và chủ yêu cầu ----
router.delete(
  "/admin/ticket/:id",
  requireLogin,
  requireRole("admin"),
  async (req, res) => {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    if (!ticket)
      return res
        .status(404)
        .json({ ok: false, error: "Không tìm thấy yêu cầu." });

    // Dọn file đính kèm trên đĩa (bỏ qua lỗi nếu file đã mất)
    (ticket.attachments || []).forEach((a) => {
      fs.unlink(path.join(UPLOAD_DIR, path.basename(a.storedName)), () => {});
    });

    realtime.toAdmins("ticket:deleted", { id: ticket._id });
    realtime.toUser(ticket.user, "ticket:deleted", { id: ticket._id });
    await realtime.notify(
      [ticket.user],
      null,
      `Yêu cầu "${ticket.title}" của bạn đã bị IT xóa.`,
    );

    res.json({ ok: true });
  },
);

// ---- Lịch sử trạng thái của 1 yêu cầu (JSON, hiển thị trong cửa sổ popup) ----
router.get(
  "/admin/ticket/:id/history",
  requireLogin,
  requireRole("admin", "staff"),
  async (req, res) => {
    const ticket = await Ticket.findById(req.params.id).populate(
      "user",
      "username",
    );
    if (!ticket)
      return res
        .status(404)
        .json({ ok: false, error: "Không tìm thấy yêu cầu." });

    // Ticket cũ (tạo trước khi có tính năng này) chưa có lịch sử -> dựng bản ghi khởi tạo từ ngày tạo
    let history = ticket.statusHistory.map((h) => ({
      from: h.from,
      to: h.to,
      by: h.changedByName || "—",
      at: h.changedAt,
    }));
    if (!history.length) {
      history = [
        {
          from: null,
          to: Ticket.STATUS.NEW,
          by: ticket.user ? ticket.user.username : "—",
          at: ticket.createdAt,
        },
      ];
    }

    res.json({
      ok: true,
      title: ticket.title,
      code: ticket._id.toString().slice(-6),
      current: ticket.status,
      history,
    });
  },
);

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (!err.status) return next(err);
  if (req.path.endsWith("/status"))
    return res.status(err.status).json({ ok: false, error: err.message });
  res.status(err.status).send(err.message);
});

module.exports = router;
