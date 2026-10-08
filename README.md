# Hệ thống quản lý yêu cầu sửa lỗi IT

Backend: Node.js + Express
Frontend: EJS (HTML render server-side) + CSS thuần
Database: MongoDB (Mongoose)


## Cài đặt

```bash
npm install
npm start
```

## Bảo mật — cần lưu ý

File `.env` hiện có sẵn một chuỗi kết nối MongoDB Atlas thật (kèm mật khẩu) và cũng được để làm giá trị mặc định (fallback) trong `config/db.js`. Vì thông tin này đã nằm trong file được chia sẻ, bạn nên **đổi mật khẩu/user MongoDB đó ngay** trên Atlas và cập nhật lại `.env`, đồng thời bỏ chuỗi kết nối cứng khỏi `config/db.js` trước khi đưa mã nguồn này lên Git hoặc chia sẻ tiếp.

## Tài khoản mặc định


```
IT_new/
├── config/db.js           Kết nối MongoDB
├── models/                User, Ticket, Notification (Mongoose schema)
├── middleware/auth.js     Kiểm tra đăng nhập / phân quyền
├── routes/                auth, user, admin, notifications
├── views/                 register, login, user, admin (EJS)
├── public/                styles.css, js/notifications.js
└── server.js               Điểm khởi động ứng dụng
```
