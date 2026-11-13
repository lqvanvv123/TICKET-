const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const User = require("../models/User");
const { text, authErrors } = require('../utils/validation');
// Chỉ giữ tên đăng nhập khi trả lỗi; không đưa mật khẩu đã nhập trở lại HTML.
const renderAuth = (res, view, body = {}, fieldErrors = {}, error = null) =>
  res.render(view, { error, fieldErrors, formValues: { username: text(body.username) } });

// ---- Trang đăng ký ----
router.get("/register", (req, res) => {
  renderAuth(res, "register");
});

router.post("/register", async (req, res) => {
  // Đọc form → kiểm tra dữ liệu → kiểm tra trùng tên → băm mật khẩu → lưu tài khoản.
  const { username, password, confirmPassword } = req.body;
  const errors = authErrors(req.body, true);
  if (Object.keys(errors).length) return renderAuth(res.status(422), 'register', req.body, errors, 'Vui lòng kiểm tra các ô bên dưới.');
  try {
    const existing = await User.findOne({ username: username.trim() });
    if (existing) {
      return renderAuth(res.status(422), 'register', req.body, { username: 'Tên đăng nhập đã tồn tại. Vui lòng chọn tên khác.' }, 'Không thể tạo tài khoản.');
    }

    // Hash là chuỗi dùng để kiểm tra mật khẩu, không phải mã hóa có thể giải ngược.
    // 10 là mức chi phí tính toán của bcrypt; database lưu hash thay vì mật khẩu gốc.
    const hashed = await bcrypt.hash(password, 10);
    // Đăng ký công khai luôn là user; chỉ admin mới được tạo/cấp vai trò staff hoặc admin.
    const user = await User.create({ username: username.trim(), password: hashed, role: "user" });

    // Ghi nhận đăng nhập trong session, không đưa mật khẩu/hash vào session.
    req.session.user = { id: user._id, username: user.username, role: user.role };
    req.session.uiFlash = 'Đăng ký thành công. Bạn có thể tạo yêu cầu mới.';
    res.redirect("/user");
  } catch (err) {
    console.error(err);
    if (err.code === 11000) return renderAuth(res.status(422), 'register', req.body, { username: 'Tên đăng nhập đã tồn tại.' }, 'Không thể tạo tài khoản.');
    renderAuth(res.status(500), 'register', req.body, {}, 'Không thể tạo tài khoản lúc này. Vui lòng thử lại.');
  }
});

// ---- Trang đăng nhập ----
router.get("/login", (req, res) => {
  renderAuth(res, 'login');
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const errors = authErrors(req.body);
  if (Object.keys(errors).length) return renderAuth(res.status(422), 'login', req.body, errors, 'Vui lòng kiểm tra các ô bên dưới.');
  try {
    const user = await User.findOne({ username: (username || "").trim() });
    if (!user) return renderAuth(res.status(422), 'login', req.body, {}, 'Sai tài khoản hoặc mật khẩu. Vui lòng kiểm tra lại.');

    // compare kiểm tra mật khẩu nhập vào với hash đã lưu; không so sánh hai chuỗi trực tiếp.
    const match = await bcrypt.compare(password || "", user.password);
    if (!match) return renderAuth(res.status(422), 'login', req.body, {}, 'Sai tài khoản hoặc mật khẩu. Vui lòng kiểm tra lại.');

    req.session.user = { id: user._id, username: user.username, role: user.role };
    // Đưa nhóm IT vào bàn xử lý; user vào trang tạo và xem yêu cầu cá nhân.
    res.redirect(["admin", "staff"].includes(user.role) ? "/admin" : "/user");
  } catch (err) {
    console.error(err);
    renderAuth(res.status(500), 'login', req.body, {}, 'Không thể đăng nhập lúc này. Vui lòng thử lại.');
  }
});

// ---- Đăng xuất ----
router.get("/logout", (req, res) => {
  // Xóa phiên đăng nhập trước khi quay về trang login.
  req.session.destroy(() => res.redirect("/login"));
});

module.exports = router;
