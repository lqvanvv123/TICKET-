const fs = require("fs");
const path = require("path");
const multer = require("multer");

const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads", "tickets");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Chỉ cho phép các loại file thường gặp khi báo lỗi IT (ảnh chụp màn hình, tài liệu)
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB / file
const MAX_FILES = 5;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, safeBase + ext);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    req.fileValidationError = "Chỉ chấp nhận file ảnh, PDF, Word hoặc .txt.";
    return cb(null, false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

module.exports = { upload, UPLOAD_DIR };
