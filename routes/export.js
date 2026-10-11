const express = require("express");
const ExcelJS = require("exceljs");
const router = express.Router();

const Ticket = require("../models/Ticket");
const User = require("../models/User");
const { requireLogin, requireRole } = require("../middleware/auth");

const guard = [requireLogin, requireRole("admin")];
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Excel lưu ngày giờ không kèm múi giờ -> cộng lệch UTC+7 (giờ Việt Nam) để
// giờ hiển thị trong file khớp với giờ trên màn hình.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const toVN = (d) => (d ? new Date(new Date(d).getTime() + VN_OFFSET_MS) : null);
const todayVN = () => toVN(new Date()).toISOString().slice(0, 10);
const DATE_FMT = "dd/mm/yyyy hh:mm";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Mọi giá trị người dùng nhập đều được ghi dưới dạng chuỗi thuần (không phải công thức)
// nên nội dung bắt đầu bằng "=", "+", "@"... sẽ không bị Excel thực thi.
function styleHeader(row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2422" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF000000" } } };
  });
}

function sendWorkbook(res, wb, filename) {
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return wb.xlsx.write(res).then(() => res.end());
}

// ---- Xuất danh sách yêu cầu (có bộ lọc tuỳ chọn) ----
router.get("/admin/export/tickets.xlsx", ...guard, async (req, res) => {
  try {
    const { status, priority, type, from, to } = req.query;
    const filter = {};
    const applied = [];

    if (Object.values(Ticket.STATUS).includes(status)) {
      filter.status = status;
      applied.push(["Trạng thái", status]);
    }
    if (Object.values(Ticket.PRIORITY).includes(priority)) {
      filter.priority = priority;
      applied.push(["Mức độ ưu tiên", priority]);
    }
    if (Object.values(Ticket.REQUEST_TYPE).includes(type)) {
      filter.requestType = type;
      applied.push(["Loại yêu cầu", type]);
    }

    const dateRange = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(from || "")) {
      const d = new Date(from + "T00:00:00+07:00");
      if (!isNaN(d)) {
        dateRange.$gte = d;
        applied.push(["Từ ngày", from]);
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to || "")) {
      const d = new Date(to + "T23:59:59.999+07:00");
      if (!isNaN(d)) {
        dateRange.$lte = d;
        applied.push(["Đến ngày", to]);
      }
    }
    if (Object.keys(dateRange).length) filter.createdAt = dateRange;

    const tickets = await Ticket.find(filter)
      .populate("user", "username")
      .sort({ createdAt: -1 })
      .lean();

    const wb = new ExcelJS.Workbook();
    wb.creator = "Bàn hỗ trợ IT";
    wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true }; // Excel tính lại công thức ở sheet "Tổng hợp" khi mở file

    // ===== Sheet 1: dữ liệu =====
    const DATA_SHEET = "Danh sách yêu cầu";
    const ws = wb.addWorksheet(DATA_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: "Mã", key: "code", width: 10 },
      { header: "Người gửi", key: "user", width: 18 },
      { header: "Tiêu đề", key: "title", width: 32 },
      { header: "Mô tả", key: "description", width: 50 },
      { header: "Loại yêu cầu", key: "type", width: 26 },
      { header: "Ưu tiên", key: "priority", width: 12 },
      { header: "Trạng thái", key: "status", width: 16 },
      { header: "Số file đính kèm", key: "files", width: 16 },
      { header: "Ngày tạo", key: "createdAt", width: 18, style: { numFmt: DATE_FMT } },
      { header: "Ngày hoàn thành", key: "resolvedAt", width: 18, style: { numFmt: DATE_FMT } },
      { header: "Thời gian xử lý (giờ)", key: "hours", width: 20, style: { numFmt: "0.0" } },
    ];
    styleHeader(ws.getRow(1));

    tickets.forEach((t) => {
      const hours =
        t.status === Ticket.STATUS.DONE && t.resolvedAt
          ? (new Date(t.resolvedAt) - new Date(t.createdAt)) / 36e5
          : null;
      ws.addRow({
        code: "#" + String(t._id).slice(-6),
        user: t.user ? t.user.username : "N/A",
        title: String(t.title || ""),
        description: String(t.description || ""),
        type: t.requestType,
        priority: t.priority,
        status: t.status,
        files: (t.attachments || []).length,
        createdAt: toVN(t.createdAt),
        resolvedAt: toVN(t.resolvedAt),
        hours,
      });
    });

    ws.eachRow((row, n) => {
      if (n === 1) return;
      row.alignment = { vertical: "top", wrapText: true };
    });
    ws.autoFilter = { from: "A1", to: "K1" };

    // ===== Sheet 2: tổng hợp (dùng công thức COUNTIF nên tự cập nhật khi sửa dữ liệu) =====
    const sum = wb.addWorksheet("Tổng hợp");
    sum.columns = [{ width: 30 }, { width: 14 }];
    sum.addRow(["BÁO CÁO YÊU CẦU HỖ TRỢ IT"]).font = { bold: true, size: 14 };
    sum.addRow(["Xuất lúc", toVN(new Date())]).getCell(2).numFmt = DATE_FMT;
    sum.addRow(["Người xuất", req.session.user.username]);
    sum.addRow(["Bộ lọc", applied.length ? applied.map(([k, v]) => `${k}: ${v}`).join("; ") : "Không (tất cả yêu cầu)"]);
    sum.addRow([]);

    const ref = `'${DATA_SHEET}'`; // tên sheet dữ liệu dùng trong công thức
    const section = (title, col, values, countOf) => {
      const head = sum.addRow([title, "Số lượng"]);
      styleHeader(head);
      values.forEach((v) => {
        const row = sum.addRow([v]);
        row.getCell(2).value = {
          formula: `COUNTIF(${ref}!$${col}:$${col},"${v}")`,
          result: countOf(v),
        };
      });
      sum.addRow([]);
    };

    const totalRow = sum.addRow(["Tổng số yêu cầu"]);
    totalRow.getCell(2).value = { formula: `COUNTA(${ref}!$A:$A)-1`, result: tickets.length };
    totalRow.font = { bold: true };
    sum.addRow([]);

    section("Theo trạng thái", "G", Object.values(Ticket.STATUS), (v) => tickets.filter((t) => t.status === v).length);
    section("Theo mức độ ưu tiên", "F", Object.values(Ticket.PRIORITY), (v) => tickets.filter((t) => t.priority === v).length);
    section("Theo loại yêu cầu", "E", Object.values(Ticket.REQUEST_TYPE), (v) => tickets.filter((t) => t.requestType === v).length);

    const done = tickets.filter((t) => t.status === Ticket.STATUS.DONE && t.resolvedAt);
    const avg = done.length
      ? done.reduce((s, t) => s + (new Date(t.resolvedAt) - new Date(t.createdAt)) / 36e5, 0) / done.length
      : null;
    const avgRow = sum.addRow(["Thời gian xử lý trung bình (giờ)"]);
    avgRow.getCell(2).value = {
      formula: `IFERROR(AVERAGE(${ref}!$K:$K),"")`,
      result: avg === null ? "" : avg,
    };
    avgRow.getCell(2).numFmt = "0.0";
    avgRow.font = { bold: true };

    await sendWorkbook(res, wb, `yeu-cau-ho-tro-${todayVN()}.xlsx`);
  } catch (err) {
    console.error("Export tickets failed:", err);
    if (!res.headersSent) res.status(500).send("Không thể xuất file Excel, vui lòng thử lại.");
  }
});

// ---- Xuất danh sách người dùng (theo bộ lọc đang áp dụng ở trang quản lý) ----
router.get("/admin/export/users.xlsx", ...guard, async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const role = ["user", "admin"].includes(req.query.role) ? req.query.role : "";
    const filter = {};
    if (q) filter.username = { $regex: escapeRegex(q), $options: "i" };
    if (role) filter.role = role;

    const [users, counts] = await Promise.all([
      // Chỉ lấy các trường cần thiết — tuyệt đối không xuất mật khẩu (hash)
      User.find(filter, "username role createdAt").sort({ createdAt: -1 }).lean(),
      Ticket.aggregate([
        {
          $group: {
            _id: "$user",
            total: { $sum: 1 },
            open: { $sum: { $cond: [{ $ne: ["$status", Ticket.STATUS.DONE] }, 1, 0] } },
          },
        },
      ]),
    ]);
    const byId = {};
    counts.forEach((c) => (byId[String(c._id)] = c));

    const wb = new ExcelJS.Workbook();
    wb.creator = "Bàn hỗ trợ IT";
    const ws = wb.addWorksheet("Người dùng", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: "Tên đăng nhập", key: "username", width: 24 },
      { header: "Vai trò", key: "role", width: 14 },
      { header: "Tổng số yêu cầu", key: "total", width: 18 },
      { header: "Yêu cầu đang mở", key: "open", width: 18 },
      { header: "Ngày tạo tài khoản", key: "createdAt", width: 20, style: { numFmt: DATE_FMT } },
    ];
    styleHeader(ws.getRow(1));
    users.forEach((u) => {
      const c = byId[String(u._id)] || { total: 0, open: 0 };
      ws.addRow({
        username: u.username,
        role: u.role === "admin" ? "Admin IT" : "Người dùng",
        total: c.total,
        open: c.open,
        createdAt: toVN(u.createdAt),
      });
    });
    ws.autoFilter = { from: "A1", to: "E1" };

    await sendWorkbook(res, wb, `nguoi-dung-${todayVN()}.xlsx`);
  } catch (err) {
    console.error("Export users failed:", err);
    if (!res.headersSent) res.status(500).send("Không thể xuất file Excel, vui lòng thử lại.");
  }
});

module.exports = router;
