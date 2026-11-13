// Ba vai trò: user gửi yêu cầu; staff xử lý việc của mình; admin quản trị toàn hệ thống.
// Enum chỉ giới hạn giá trị được lưu; quyền thao tác được kiểm tra riêng ở middleware/service.
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true }, // đã hash bằng bcrypt
    role: { type: String, enum: ["user", "staff", "admin"], default: "user" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
