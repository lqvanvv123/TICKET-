const mongoose = require("mongoose");

// recipient quyết định tài khoản nào được xem; ticket là liên kết tùy chọn tới yêu cầu.
// isRead điều khiển số chưa đọc; timestamps tự tạo createdAt và updatedAt.
const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket" },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
