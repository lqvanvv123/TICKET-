const mongoose = require("mongoose");

// 3 trạng thái đúng theo yêu cầu: chưa sửa -> đang sửa lỗi -> hoàn thành
const STATUS = {
  NEW: "Chưa sửa",
  IN_PROGRESS: "Đang sửa lỗi",
  DONE: "Hoàn thành",
};

// slug không dấu, dùng để đặt tên class CSS an toàn
const STATUS_SLUG = {
  [STATUS.NEW]: "new",
  [STATUS.IN_PROGRESS]: "in-progress",
  [STATUS.DONE]: "done",
};

// Mức độ ưu tiên (giống Jira: Low / Medium / High / Highest)
const PRIORITY = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  URGENT: "Khẩn cấp",
};

const PRIORITY_SLUG = {
  [PRIORITY.LOW]: "low",
  [PRIORITY.MEDIUM]: "medium",
  [PRIORITY.HIGH]: "high",
  [PRIORITY.URGENT]: "urgent",
};

// Thứ tự để sắp xếp/so sánh mức độ ưu tiên (số càng lớn càng gấp)
const PRIORITY_WEIGHT = {
  [PRIORITY.LOW]: 1,
  [PRIORITY.MEDIUM]: 2,
  [PRIORITY.HIGH]: 3,
  [PRIORITY.URGENT]: 4,
};

// Loại yêu cầu (giống "Request type" trong Jira Service Desk)
const REQUEST_TYPE = {
  HARDWARE: "Phần cứng",
  SOFTWARE: "Phần mềm",
  NETWORK: "Mạng / Internet",
  ACCOUNT: "Tài khoản / Quyền truy cập",
  OTHER: "Khác",
};

const REQUEST_TYPE_SLUG = {
  [REQUEST_TYPE.HARDWARE]: "hardware",
  [REQUEST_TYPE.SOFTWARE]: "software",
  [REQUEST_TYPE.NETWORK]: "network",
  [REQUEST_TYPE.ACCOUNT]: "account",
  [REQUEST_TYPE.OTHER]: "other",
};

const attachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    url: { type: String, required: true },
    mimetype: { type: String },
    size: { type: Number },
  },
  { _id: false }
);

const ticketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    status: { type: String, enum: Object.values(STATUS), default: STATUS.NEW },
    priority: { type: String, enum: Object.values(PRIORITY), default: PRIORITY.MEDIUM },
    requestType: { type: String, enum: Object.values(REQUEST_TYPE), default: REQUEST_TYPE.OTHER },
    attachments: { type: [attachmentSchema], default: [] },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ticketSchema.statics.STATUS = STATUS;
ticketSchema.statics.STATUS_SLUG = STATUS_SLUG;
ticketSchema.statics.PRIORITY = PRIORITY;
ticketSchema.statics.PRIORITY_SLUG = PRIORITY_SLUG;
ticketSchema.statics.PRIORITY_WEIGHT = PRIORITY_WEIGHT;
ticketSchema.statics.REQUEST_TYPE = REQUEST_TYPE;
ticketSchema.statics.REQUEST_TYPE_SLUG = REQUEST_TYPE_SLUG;

module.exports = mongoose.model("Ticket", ticketSchema);
