const User = require('../models/User');

async function requireLogin(req, res, next) {
  // Chặn người chưa đăng nhập trước khi chạy các route cần tài khoản.
  if (!req.session.user) return res.redirect("/login");
  try {
    // Đọc lại vai trò ở mỗi request: đổi quyền trong database có hiệu lực ở request tiếp theo.
    const account = await User.findById(req.session.user.id).select('username role').lean();
    if (!account) return req.session.destroy(() => res.redirect('/login'));
    req.session.user = { id: String(account._id), username: account.username, role: account.role };
    // next() cho phép chạy bước kiểm tra quyền hoặc hàm xử lý route tiếp theo.
    next();
  } catch (err) { next(err); }
}

function requireRole(...roles) {
  // ...roles nhận nhiều vai trò được phép, ví dụ requireRole("admin", "staff").
  // Middleware này dùng sau requireLogin; khóa giao diện không thay thế kiểm tra phía server.
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send('Bạn không có quyền thực hiện thao tác này.');
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };
