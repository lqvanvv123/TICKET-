// Kiểm tra server vẫn chạy khi JavaScript bị tắt hoặc request được gửi trực tiếp.
const text = value => typeof value === 'string' ? value.trim() : '';
function authErrors(body, register = false) {
  const errors = {};
  if (!text(body.username)) errors.username = 'Vui lòng nhập tên đăng nhập.';
  if (typeof body.password !== 'string' || !body.password.trim()) errors.password = 'Vui lòng nhập mật khẩu.';
  else if (register && body.password.length < 6) errors.password = 'Mật khẩu phải có ít nhất 6 ký tự.';
  if (register && body.confirmPassword !== body.password) errors.confirmPassword = 'Mật khẩu nhập lại chưa khớp.';
  if (register && !body.confirmPassword) errors.confirmPassword = 'Vui lòng nhập lại mật khẩu.';
  return errors;
}
function ticketErrors(body) {
  const errors = {};
  if (!text(body.title)) errors.title = 'Vui lòng nhập tiêu đề lỗi.';
  if (!text(body.description)) errors.description = 'Vui lòng mô tả lỗi cần hỗ trợ.';
  return errors;
}
module.exports = { text, authErrors, ticketErrors };
