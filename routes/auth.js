const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const User = require("../models/User");

// ---- Trang đăng ký ----
router.get("/register", (req, res) => {
  res.render("register", { error: null });
});

router.post("/register", async (req, res) => {
  const { username, password, confirmPassword } = req.body;
  try {
    if (!username || !password || !confirmPassword) {
      return res.render("register", { error: "Vui lòng nhập đầy đủ thông tin." });
    }
    if (password.length < 6) {
      return res.render("register", { error: "Mật khẩu phải có ít nhất 6 ký tự." });
    }
    if (password !== confirmPassword) {
      return res.render("register", { error: "Mật khẩu nhập lại không khớp." });
    }

    const existing = await User.findOne({ username: username.trim() });
    if (existing) {
      return res.render("register", { error: "Tên đăng nhập đã tồn tại, vui lòng chọn tên khác." });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username: username.trim(), password: hashed, role: "user" });

    req.session.user = { id: user._id, username: user.username, role: user.role };
    res.redirect("/user");
  } catch (err) {
    console.error(err);
    res.render("register", { error: "Đã có lỗi xảy ra, vui lòng thử lại." });
  }
});

// ---- Trang đăng nhập ----
router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username: (username || "").trim() });
    if (!user) return res.render("login", { error: "Sai tài khoản hoặc mật khẩu!" });

    const match = await bcrypt.compare(password || "", user.password);
    if (!match) return res.render("login", { error: "Sai tài khoản hoặc mật khẩu!" });

    req.session.user = { id: user._id, username: user.username, role: user.role };
    res.redirect(user.role === "admin" ? "/admin" : "/user");
  } catch (err) {
    console.error(err);
    res.render("login", { error: "Đã có lỗi xảy ra, vui lòng thử lại." });
  }
});

// ---- Đăng xuất ----
router.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

module.exports = router;
