const { LABELS } = require('../public/js/deadlines');
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };

// datetime-local không có múi giờ: luôn hiểu là giờ Việt Nam, không phụ thuộc máy chạy server.
function parseDeadline(value, now = new Date()) {
  if (value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) fail('Vui lòng nhập ngày và giờ hạn xử lý hợp lệ.');
  const date = new Date(value + ':00+07:00');
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 7 * 36e5).toISOString().slice(0, 16) !== value) fail('Ngày hoặc giờ hạn xử lý không tồn tại.');
  if (date <= now) fail('Hạn xử lý mới phải sau thời điểm hiện tại.');
  return date;
}

// Điều kiện hạn là độc lập với các bộ lọc trạng thái; dùng $and để không ghi đè nhau.
function deadlineFilter(value, now = new Date()) {
  if (value === '' || value === undefined) return {};
  if (typeof value !== 'string' || !Object.hasOwn(LABELS, value)) fail('Bộ lọc hạn xử lý không hợp lệ.');
  if (value === 'none') return { dueAt: null };
  const end = new Date(now.getTime() + 86400000);
  const dueAt = value === 'overdue' ? { $ne: null, $lte: now }
    : value === 'soon' ? { $gt: now, $lte: end } : { $gt: end };
  return { $and: [{ status: { $ne: 'Hoàn thành' } }, { dueAt }] };
}
module.exports = { parseDeadline, deadlineFilter };
