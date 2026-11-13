const mongoose = require("mongoose");

// Mỗi cuộc chat gắn với 1 user (không theo ticket cụ thể) — giống 1 khung
// chat trực tiếp giữa user đó và team IT (admin nào trả lời cũng được).
const chatMessageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // chủ cuộc trò chuyện
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // người gửi tin nhắn này
    senderRole: { type: String, enum: ["user", "staff", "admin"], required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    // Hai cờ đọc cho hai phía của cuộc trò chuyện; readByAdmin được dùng chung cho admin và staff.
    readByUser: { type: Boolean, default: false },
    readByAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Chỉ mục hỗ trợ tìm tin theo chủ hội thoại rồi sắp theo thời gian.
chatMessageSchema.index({ user: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
