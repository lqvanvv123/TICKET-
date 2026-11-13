const Ticket = require("../models/Ticket");
const User = require("../models/User");
const deadlines = require("../public/js/deadlines");
const {
  parseTicketFilters,
  parsePagination,
} = require("../utils/ticket-filters");

// Tạo URL từ dữ liệu đã kiểm tra; link phân trang giữ nguyên lọc, link xuất bỏ page/pageSize.
function listMetadata(filters, pagination, team = []) {
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== ""),
  );
  const exportUrl = "/admin/export/tickets.xlsx?" + params;
  const filterUrl = (page = pagination.page, changes = {}) => {
    const values = {
      ...filters,
      pageSize: String(pagination.pageSize),
      page: String(page),
      ...changes,
    };
    return (
      "/admin?" +
      new URLSearchParams(
        Object.entries(values).filter(([, value]) => value !== ""),
      )
    );
  };
  const activeFilters = [];
  const labels = {
    q: "Tìm kiếm",
    status: "Trạng thái",
    priority: "Ưu tiên",
    type: "Loại",
    assignee: "Người xử lý",
    deadline: "Hạn",
    from: "Từ ngày",
    to: "Đến ngày",
  };
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    let label = value;
    if (key === "status" && value === "open") label = "Còn mở";
    if (key === "deadline") label = deadlines.LABELS[value];
    if (key === "assignee")
      label =
        value === "mine"
          ? "Việc của tôi"
          : value === "unassigned"
            ? "Chưa phân công"
            : team.find((person) => String(person._id) === value)?.username ||
              "Tài khoản IT đã chọn";
    activeFilters.push({
      label: labels[key] + ": " + label,
      removeUrl: filterUrl(1, { [key]: "" }),
    });
  }
  return {
    filters,
    pagination,
    team,
    exportUrl,
    filterUrl,
    activeFilters,
    listUrl: filterUrl(),
  };
}
async function loadTicketList(query, user, now = new Date()) {
  const { filters, filter } = parseTicketFilters(query, user, now);
  const requested = parsePagination(query);
  const [total, team] = await Promise.all([
    Ticket.countDocuments(filter),
    User.find({ role: { $in: ["admin", "staff"] } })
      .select("username")
      .sort({ username: 1 })
      .lean(),
  ]);
  const pages = Math.max(1, Math.ceil(total / requested.pageSize));
  const page = Math.min(requested.page, pages);
  // Nếu xóa dòng cuối trang cuối, quay về trang còn dữ liệu thay vì hiện trang trống sai số.
  const tickets = await Ticket.find(filter)
    .populate("user", "username")
    .populate("assignedTo", "username")
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * requested.pageSize)
    .limit(requested.pageSize)
    .lean();
  const pagination = {
    total,
    page,
    pages,
    pageSize: requested.pageSize,
    from: total ? (page - 1) * requested.pageSize + 1 : 0,
    to: Math.min(page * requested.pageSize, total),
  };
  return { tickets, ...listMetadata(filters, pagination, team) };
}
module.exports = { loadTicketList, listMetadata };
