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

### Xuất PDF

Admin có thể xuất PDF tại danh sách yêu cầu, Dashboard và quản lý tài khoản, bên cạnh lựa chọn Excel. Hai định dạng dùng chung truy vấn và workbook nên áp dụng cùng bộ lọc; PDF chứa dữ liệu tĩnh, số trang và phần tổng hợp báo cáo yêu cầu. Mỗi bản ghi trình bày theo chiều dọc trên A4 để mô tả dài không bị ép vào nhiều cột nhỏ.

`utils/pdf-report.js` tạo PDF bằng PDFKit. Font Noto Sans lưu trong `assets/fonts` để hiển thị tiếng Việt trên các máy chủ khác nhau; giấy phép đi kèm trong `OFL.txt`. Cần mang theo thư mục này khi triển khai. PDF không chứa mật khẩu tài khoản.

### Dashboard quản lý yêu cầu

- `/admin/dashboard`: lọc ngày tạo theo toàn thời gian, 7/14/30/90 ngày hoặc khoảng tùy chọn tối đa 366 ngày; mốc ngày theo giờ Việt Nam và bao gồm cả hai đầu.
- Kết hợp bộ lọc trạng thái, mức ưu tiên, loại yêu cầu và người phụ trách. Các chỉ số, biểu đồ, danh sách ưu tiên, yêu cầu mới nhất và bảng phân công dùng cùng tập kết quả lọc.
- Theo dõi tỷ lệ hoàn thành, thời gian trung bình từ tạo đến hoàn thành, việc chưa có người nhận và khẩn cấp còn mở. Đây là trạng thái hiện tại của các yêu cầu tạo trong kỳ, không phải số lượt hoàn thành phát sinh trong kỳ.
- Bảng nhóm IT tính theo người phụ trách hiện tại, gồm cả tài khoản chưa được giao việc. Bấm thẻ chỉ số hoặc tên người phụ trách để lọc tiếp; bấm tiêu đề để xem chi tiết yêu cầu.
- Tự làm mới riêng phần số liệu khi tạo, phân công, đổi trạng thái hoặc xóa yêu cầu; có nút làm mới và công tắc tự cập nhật. Giữ dữ liệu cũ nếu tải lỗi, không xóa bộ lọc đang nhập.
- Admin xuất Excel đúng bộ lọc Dashboard; staff vẫn xem Dashboard nhưng không có quyền xuất Excel. Biểu đồ dùng Chart.js 4.4.4 lưu trong `public/vendor`, kèm giấy phép.
- Ở chế độ toàn thời gian, các chỉ số tính toàn bộ dữ liệu nhưng biểu đồ xu hướng chỉ hiển thị 14 ngày gần nhất để dễ đọc.

### Phản hồi thao tác và lỗi biểu mẫu

- `public/js/ui.js` và `public/ui.css`: thông báo thành công/lỗi, nút đang gửi/lưu, lỗi cạnh ô nhập và khôi phục nút khi thất bại.
- `utils/validation.js`: kiểm tra lại dữ liệu ở server cho đăng nhập, đăng ký và tạo yêu cầu.
- Form sai giữ nội dung chữ để sửa; không điền lại mật khẩu. File đính kèm phải chọn lại khi server trả lỗi.
- Chat giữ tin nhắn trong ô nhập nếu gửi thất bại; chỉ xóa nội dung đã gửi sau khi server xác nhận.
- Thao tác nhận việc, phân công và cập nhật trạng thái vẫn giữ nguyên quy tắc phân quyền.

### Icon giao diện

Icon SVG được lấy từ [Lucide Animated](https://lucide-animated.com/), chuyển sang sprite nội bộ để dùng với EJS. Hiệu ứng CSS chạy khi hover/focus; chuông chuyển động khi có thông báo mới và tôn trọng `prefers-reduced-motion`.

- `views/partials/icon.ejs`: chèn icon theo tên.
- `public/icons/lucide.svg`: bộ hình SVG, không phụ thuộc CDN khi chạy.
- `public/icons.css`: kích thước và chuyển động.
- `public/js/icons.js`: tạo icon cho thành phần được thêm động.
- `public/icons/LICENSE-lucide-animated.txt`: giấy phép nguồn.
- `scripts/build-icons.py`: tải lại sprite từ phiên bản nguồn đã cố định, cần mạng khi chạy script này.

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

## Hạn xử lý yêu cầu

- Admin mở chi tiết yêu cầu → **Đặt hạn xử lý** → chọn ngày/giờ → **Lưu hạn xử lý**. Để trống và lưu để bỏ hạn. Staff và User chỉ xem hạn; server từ chối mọi yêu cầu đổi hạn của hai vai trò này.
- Giờ nhập/hiển thị là giờ Việt Nam (UTC+7), dữ liệu lưu dưới dạng UTC. Hạn mới phải nằm trong tương lai. Yêu cầu cũ chưa có hạn vẫn hoạt động; không tự gán thời hạn cho dữ liệu cũ.
- Yêu cầu còn mở: **Quá hạn** khi giờ hiện tại lớn hơn hoặc bằng hạn; **Sắp đến hạn** khi còn tối đa 24 giờ; **Còn trên 24 giờ** khi còn nhiều hơn 24 giờ. Nhãn tự cập nhật mỗi phút và khi quay lại tab.
- Yêu cầu hoàn thành được đánh dấu đúng hạn/trễ hạn theo `resolvedAt`; không tiếp tục đếm quá hạn và không được đổi hạn. Nếu dữ liệu cũ thiếu thời điểm hoàn thành, hiển thị chưa rõ thời điểm.
- Danh sách và Dashboard có bộ lọc hạn; Dashboard có chỉ số quá hạn/sắp đến hạn và làm mới mỗi phút khi bật tự cập nhật. Báo cáo Excel/PDF giữ bộ lọc, thêm hạn và tình trạng hạn.
- Đổi/bỏ hạn ghi vào lịch sử và thông báo cho chủ yêu cầu, người phụ trách; các trang đang mở nhận cập nhật qua Socket.IO. Cảnh báo quá hạn là nhãn/chỉ số trên giao diện, chưa có tác vụ gửi email/thông báo định kỳ.

## Danh sách yêu cầu và bộ lọc chung

- Trang `/admin` của Admin/Staff dùng bảng 6 cột: yêu cầu (mã, tiêu đề, người gửi, ngày tạo), ưu tiên, trạng thái, người xử lý, hạn, thao tác. Mô tả, loại và file đính kèm nằm ở trang chi tiết. Lịch sử/xóa ở menu `•••`; quyền nhận việc/cập nhật trạng thái giữ nguyên và vẫn kiểm tra tại server.
- Tìm theo tiêu đề, mã đầy đủ hoặc 6 ký tự cuối (có thể nhập `#a1b2c3`). Lọc đồng thời theo trạng thái, người xử lý, hạn; mở **Lọc thêm** để chọn ưu tiên, loại và ngày tạo. Bấm **Áp dụng**; các nhãn phía trên bảng cho biết điều kiện đã áp dụng và cho phép bỏ từng điều kiện.
- Chọn 20 hoặc 50 yêu cầu mỗi trang. URL giữ bộ lọc khi chuyển trang; xóa hết trang cuối tự chuyển về trang còn dữ liệu. Bộ lọc dùng GET nên vẫn hoạt động khi tắt JavaScript.
- **Xuất báo cáo → Excel/PDF** chỉ dành cho Admin, xuất toàn bộ kết quả phù hợp trên mọi trang. Cả danh sách và xuất file dùng chung `utils/ticket-filters.js`; `page`/`pageSize` không giới hạn dữ liệu xuất. Khoảng ngày theo giờ Việt Nam và bao gồm trọn ngày cuối.
- Realtime tải lại đúng bộ lọc/trang qua `/admin/tickets/data`, cập nhật đồng thời số kết quả, phân trang và link xuất; giữ nguyên bộ lọc đang nhập và danh sách trước đó nếu mạng lỗi. Tạm hoãn cập nhật khi đang thao tác trong menu hoặc ô trạng thái.
- Trên màn hình nhỏ, một dòng bảng thành một thẻ; bộ lọc thu gọn, bấm **Tìm kiếm & bộ lọc** để mở. Không thêm thư viện giao diện hoặc thay đổi quyền truy cập.
