# Hệ thống quản lý yêu cầu sửa lỗi IT

Backend: Node.js + Express
Frontend: EJS (HTML render server-side) + CSS thuần
Database: MongoDB (Mongoose)

## Tính năng (nâng cấp theo hướng Jira Service Desk)

- Loại yêu cầu (Phần cứng / Phần mềm / Mạng / Tài khoản / Khác) và mức độ ưu tiên (Thấp / Trung bình / Cao / Khẩn cấp) khi tạo ticket.
- Đính kèm file (ảnh, PDF, Word, txt) — tối đa 5 file/ticket, mỗi file ≤ 5MB.
- Bảng Kanban cho admin (`/admin/board`): kéo-thả ticket giữa 3 cột trạng thái để đổi trạng thái ngay lập tức.
- Dashboard thống kê cho admin (`/admin/dashboard`): tổng số ticket, số đang mở/đã xong, thời gian xử lý trung bình, biểu đồ theo trạng thái/độ ưu tiên/loại yêu cầu, xu hướng 14 ngày gần nhất.
- Quản lý người dùng cho admin (`/admin/users`, mở từ mục "👥 Quản lý người dùng" trong thanh menu trái): tìm kiếm/lọc theo vai trò, tạo tài khoản, đổi vai trò Người dùng ↔ Admin IT, đặt lại mật khẩu, xoá tài khoản (kèm yêu cầu, file đính kèm, thông báo, chat của tài khoản đó). Không thể tự đổi vai trò hoặc tự xoá chính mình.
- Xuất Excel (admin): ở trang Danh sách có thanh "📊 Xuất Excel" lọc theo trạng thái/ưu tiên/loại yêu cầu/khoảng ngày → file .xlsx gồm sheet dữ liệu + sheet "Tổng hợp" (công thức COUNTIF); trang Quản lý người dùng có nút xuất danh sách tài khoản (không chứa mật khẩu). Giờ trong file theo múi giờ Việt Nam (UTC+7).
- Thanh menu trượt bên trái: "Lỗi thường gặp" + "Liên hệ IT trực tiếp" (bên user), "Cẩm nang xử lý nội bộ" (bên admin). Trên màn hình rộng, sidebar đẩy nội dung chính sang phải khi mở, thu lại khi đóng; nội dung chính luôn tràn hết chiều rộng còn lại.
- Chat trực tiếp giữa user và team IT (nút tròn góc dưới-phải, giống UltraViewer): 1 cuộc trò chuyện/user, admin xem được danh sách hội thoại của tất cả user. Cập nhật bằng polling (tự làm mới vài giây/lần), không cần cài thêm gói realtime.

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
