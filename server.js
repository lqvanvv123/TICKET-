require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const http = require("http");
const bcrypt = require("bcryptjs");

const connectDB = require("./config/db");
const User = require("./models/User");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");
const notificationRoutes = require("./routes/notifications");
const chatRoutes = require("./routes/chat");
const realtime = require("./utils/realtime");

const app = express();

// Kết nối MongoDB rồi tạo sẵn tài khoản AdminIT nếu chưa có
connectDB().then(seedAdmin);

async function seedAdmin() {
  const existing = await User.findOne({ username: "adminIT" });
  if (!existing) {
    const hashed = await bcrypt.hash("123456", 10);
    await User.create({ username: "adminIT", password: hashed, role: "admin" });
    console.log("");
  }
}

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "secret-key",
  resave: false,
  saveUninitialized: true,
});
app.use(sessionMiddleware);

app.use(authRoutes);
app.use(userRoutes);
app.use(adminRoutes);
app.use(notificationRoutes);
app.use(chatRoutes);

app.get("/", (req, res) => res.redirect("/login"));

const PORT = process.env.PORT || 3000;
// Socket.IO chạy chung cổng với Express và dùng chung session đăng nhập
const server = http.createServer(app);
realtime.init(server, sessionMiddleware);
server.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
