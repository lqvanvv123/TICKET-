# Hệ thống quản lý yêu cầu sửa lỗi IT

Backend: Node.js + Express
Frontend: EJS (HTML render server-side) + CSS thuần
Database: MongoDB (Mongoose)

## Tính năng (nâng cấp theo hướng Jira Service Desk)

- Loại yêu cầu (Phần cứng / Phần mềm / Mạng / Tài khoản / Khác) và mức độ ưu tiên (Thấp / Trung bình / Cao / Khẩn cấp) khi tạo ticket.
- Đính kèm file (ảnh, PDF, Word, txt) — tối đa 5 file/ticket, mỗi file ≤ 5MB.
- Dashboard thống kê cho admin (`/admin/dashboard`): tổng số ticket, số đang mở/đã xong, thời gian xử lý trung bình, biểu đồ theo trạng thái/độ ưu tiên/loại yêu cầu, xu hướng 14 ngày gần nhất.
- Quản lý người dùng cho admin (`/admin/users`, mở từ mục "👥 Quản lý người dùng" trong thanh menu trái): tìm kiếm/lọc theo vai trò, tạo tài khoản, đổi vai trò Người dùng ↔ Admin IT, đặt lại mật khẩu, xoá tài khoản (kèm yêu cầu, file đính kèm, thông báo, chat của tài khoản đó). Không thể tự đổi vai trò hoặc tự xoá chính mình.
- Xuất Excel (admin): ở trang Danh sách có thanh "📊 Xuất Excel" lọc theo trạng thái/ưu tiên/loại yêu cầu/khoảng ngày → file .xlsx gồm sheet dữ liệu + sheet "Tổng hợp" (công thức COUNTIF); trang Quản lý người dùng có nút xuất danh sách tài khoản (không chứa mật khẩu). Giờ trong file theo múi giờ Việt Nam (UTC+7).
- Thanh menu trượt bên trái: "Lỗi thường gặp" + "Liên hệ IT trực tiếp" (bên user), "Cẩm nang xử lý nội bộ" (bên admin). Trên màn hình rộng, sidebar đẩy nội dung chính sang phải khi mở, thu lại khi đóng; nội dung chính luôn tràn hết chiều rộng còn lại.
- Chat trực tiếp giữa user và team IT (nút tròn góc dưới-phải, giống UltraViewer): 1 cuộc trò chuyện/user, admin xem được danh sách hội thoại của tất cả user. Cập nhật bằng polling (tự làm mới vài giây/lần), không cần cài thêm gói realtime.

- **Lịch sử trạng thái (admin)**: mỗi lần đổi trạng thái (từ bảng danh sách) đều được lưu lại kèm người đổi và thời gian; bấm "🕒 Lịch sử trạng thái" ở cột Trạng thái để xem.
- **Bảng thông báo (user + admin)**: bấm biểu tượng chuông để mở bảng; bấm vào thông báo chưa đọc để đánh dấu đã đọc, nút ✕ để xóa từng thông báo, "Xóa tất cả" để xóa hết.
- **Thời gian thực (Socket.IO)**: đổi trạng thái (ô chọn trong danh sách), tạo mới và xóa yêu cầu được đẩy ngay tới mọi admin đang mở trang (danh sách; trang Thống kê tự tải lại) và tới chủ yêu cầu (bảng lịch sử của user cập nhật tức thì). Thông báo mới cũng hiện ngay trong bảng chuông. Server dùng chung session đăng nhập để chia phòng (`admins`, `user:<id>`), người chưa đăng nhập bị ngắt kết nối.
- **Xóa yêu cầu (admin)**: nút "🗑 Xóa yêu cầu" ở trang danh sách; xóa luôn file đính kèm trên đĩa và gửi thông báo cho người gửi.

## Cài đặt

### Vai trò và quyền hạn

Nhân viên IT chỉ được cập nhật trạng thái yêu cầu do chính mình phụ trách. Yêu cầu chưa phân công cần nhận xử lý trước; yêu cầu của người khác có ô cập nhật bị khóa. Admin vẫn được cập nhật tất cả yêu cầu. Quyền cập nhật được kiểm tra cả ở server và khi phân công thay đổi theo thời gian thực.

Mỗi yêu cầu có một **Người xử lý**. Admin bấm **Phân công** hoặc mở tiêu đề yêu cầu để giao cho Admin/Nhân viên IT, đổi người hoặc bỏ phân công. Nhân viên IT bấm **Nhận xử lý** để tự nhận yêu cầu còn trống; không thể lấy yêu cầu của người khác. Khi staff nhận xử lý, yêu cầu tự chuyển sang **Đang sửa lỗi** và lưu lịch sử trạng thái. Khi **Hoàn thành**, giao diện ẩn ô cập nhật trạng thái, nút nhận xử lý và biểu mẫu phân công, đồng thời giữ thông tin người phụ trách.

Danh sách hỗ trợ lọc **Việc của tôi** và **Chưa phân công**. Người gửi cũng nhìn thấy người phụ trách. Lịch sử phân công hiển thị trong trang chi tiết; thông báo được gửi cho người nhận việc và người gửi yêu cầu. Xóa tài khoản IT hoặc chuyển về User sẽ đưa các yêu cầu đang phụ trách về chưa phân công. File Excel có thêm cột Người xử lý.

| Quyền | User | Nhân viên IT (`staff`) | Admin |
|---|---|---|---|
| Tạo và xem yêu cầu cá nhân | Có | — | — |
| Xem toàn bộ yêu cầu, đổi trạng thái, xem lịch sử và thống kê | — | Có | Có |
| Chat hỗ trợ người dùng | — | Có | Có |
| Xóa yêu cầu, xuất Excel, quản lý tài khoản | — | — | Có |

Admin có thể tạo tài khoản Nhân viên IT hoặc đổi vai trò tài khoản tại **Quản lý người dùng**. Đăng ký công khai luôn tạo User. Quyền được kiểm tra lại từ database ở mỗi yêu cầu; đổi vai trò sẽ ngắt kết nối realtime cũ và áp dụng quyền mới khi tải lại trang.

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
