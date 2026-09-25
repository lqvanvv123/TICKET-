const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(" Thiếu MONGODB_URI trong file .env. Vui lòng khai báo chuỗi kết nối MongoDB.");
    process.exit(1);
  }
  try {
    await mongoose.connect(uri);
    console.log(" Đã kết nối MongoDB:", uri);
  } catch (err) {
    console.error(" Lỗi kết nối MongoDB:", err.message);
    console.error(" Kiểm tra lại MongoDB đã chạy chưa .");
    process.exit(1);
  }
};

module.exports = connectDB;
