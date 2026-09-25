# Hệ thống quản lý yêu cầu sửa lỗi IT

Backend: Node.js + Express
Frontend: EJS (HTML render server-side) + CSS thuần
Database: MongoDB (Mongoose)

## Tính năng (nâng cấp theo hướng Jira Service Desk)

- Loại yêu cầu (Phần cứng / Phần mềm / Mạng / Tài khoản / Khác) và mức độ ưu tiên (Thấp / Trung bình / Cao / Khẩn cấp) khi tạo ticket.
- Đính kèm file (ảnh, PDF, Word, txt) — tối đa 5 file/ticket, mỗi file ≤ 5MB.
- Bảng Kanban cho admin (`/admin/board`): kéo-thả ticket giữa 3 cột trạng thái để đổi trạng thái ngay lập tức.
- Dashboard thống kê cho admin (`/admin/dashboard`): tổng số ticket, số đang mở/đã xong, thời gian xử lý trung bình, biểu đồ theo trạng thái/độ ưu tiên/loại yêu cầu, xu hướng 14 ngày gần nhất.

## Cài đặt

```bash
npm install
npm start
```

## Bảo mật — cần lưu ý

File `.env` hiện có sẵn một chuỗi kết nối MongoDB Atlas thật (kèm mật khẩu) và cũng được để làm giá trị mặc định (fallback) trong `config/db.js`. Vì thông tin này đã nằm trong file được chia sẻ, bạn nên **đổi mật khẩu/user MongoDB đó ngay** trên Atlas và cập nhật lại `.env`, đồng thời bỏ chuỗi kết nối cứng khỏi `config/db.js` trước khi đưa mã nguồn này lên Git hoặc chia sẻ tiếp.

## Tài khoản mặc định

Khi server khởi động lần đầu, hệ thống tự tạo sẵn tài khoản IT:

- Username: `adminIT`
- Password: `123456`

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
