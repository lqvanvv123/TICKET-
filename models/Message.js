const mongoose = require("mongoose");

// Mỗi cuộc trò chuyện được nhóm theo "conversationUser" (chính là user thường,
// không phải admin) — vì phía IT có nhiều admin nhưng chỉ có 1 luồng chat chung
// với mỗi user, giống kiểu chat 1-1 của UltraViewer.
const messageSchema = new mongoose.Schema(
  {
    conversationUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["user", "admin"], required: true },
    text: { type: String, required: true, trim: true },
    readByUser: { type: Boolean, default: false },
    readByAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ conversationUser: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
