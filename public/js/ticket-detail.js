// Trang chi tiết: gửi form bằng fetch và nhận thay đổi từ các tab/người dùng khác qua Socket.IO.
document.addEventListener("DOMContentLoaded", () => {
  const ticketId = document.body.dataset.ticketDetail;
  if (!ticketId) return;
  const feedback = document.getElementById("detailFeedback");
  function showFeedback(message) {
    feedback.textContent = message;
    feedback.hidden = false;
  }
  for (const form of document.querySelectorAll("[data-assignment-form], [data-status-form], [data-deadline-form]")) {
    // Dùng chung cách gửi cho hai form, chọn endpoint dựa vào thuộc tính data-* của form.
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); // Ngăn trình duyệt gửi form theo cách thông thường.
      const button = form.querySelector('button[type="submit"]');
      if (button.disabled) return;
      if (form.hasAttribute('data-deadline-form')) window.ITUI.fieldError(form.elements.dueAt, '');
      const restore = window.ITUI.busy(button, form.hasAttribute('data-assignment-form') ? 'Đang phân công…' : 'Đang lưu…');
      const url = form.hasAttribute("data-status-form") ? "/admin/ticket/" + ticketId + "/status" : form.action;
      try {
        await window.ITUI.request(url, {
          method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
          // FormData lấy các ô nhập; URLSearchParams chuyển thành dữ liệu form mà Express đọc được.
          body: new URLSearchParams(new FormData(form)),
        });
        // Lấy lại lịch sử mới nhất và các nút được phép thao tác sau khi cập nhật.
        window.ITUI.flash(form.hasAttribute('data-deadline-form') ? 'Đã cập nhật hạn xử lý.' : form.hasAttribute('data-status-form') ? 'Đã cập nhật trạng thái yêu cầu.' : 'Đã cập nhật người phụ trách.');
        window.location.reload();
      } catch (error) {
        if (form.hasAttribute('data-deadline-form')) { window.ITUI.fieldError(form.elements.dueAt, error.message); form.elements.dueAt.focus(); }
        showFeedback(error.message || "Kết nối bị gián đoạn. Vui lòng thử lại.");
        window.ITUI.toast(error.message, 'error');
      } finally {
        restore();
        if (form.hasAttribute('data-status-form') && form.querySelector('select')?.disabled) button.disabled = true;
      }
    });
  }
  if (!window.socket) return;
  window.socket.on("ticket:updated", (payload) => {
    // Socket nhận nhiều ticket; chỉ xử lý sự kiện thuộc trang chi tiết đang xem.
    if (String(payload.id) !== ticketId) return;
    const stamp = document.getElementById("detailStatus");
    stamp.textContent = payload.status;
    stamp.className = "stamp stamp-" + payload.slug;
    const statusSelect = document.getElementById("detailStatusSelect");
    if (statusSelect) statusSelect.value = payload.status;
    if (payload.slug === "done") {
      // Hoàn thành: ẩn form phân công và cập nhật, vẫn giữ thông tin xử lý cùng lịch sử.
      document.querySelectorAll("[data-assignment-form], [data-status-form], [data-deadline-form]").forEach(form => form.remove());
    }
    document.getElementById("detailResolved").textContent = payload.resolvedAt
      ? new Date(payload.resolvedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";
    showFeedback("Trạng thái vừa thay đổi. Tải lại trang để xem lịch sử mới nhất.");
  });
  window.socket.on("ticket:assigned", (payload) => {
    if (String(payload.id) !== ticketId) return;
    document.getElementById("detailAssignee").textContent = payload.assignedTo ? payload.assignedTo.username : "Chưa phân công";
    if (document.body.dataset.role === "staff") {
      // Nếu admin chuyển việc cho người khác, khóa form của người phụ trách cũ ngay lập tức.
      const locked = !payload.assignedTo || String(payload.assignedTo.id) !== document.body.dataset.userId;
      const form = document.querySelector("[data-status-form]");
      if (form) form.querySelectorAll("select, button").forEach(control => { control.disabled = locked; });
    }
    const claim = document.querySelector('[data-assignment-form] input[type="hidden"]');
    if (claim && payload.assignedTo) claim.form.querySelector('button[type="submit"]').disabled = true;
    showFeedback("Người phụ trách vừa thay đổi. Tải lại trang để xem lịch sử mới nhất.");
  });
  window.socket.on("ticket:deleted", (payload) => {
    if (String(payload.id) !== ticketId) return;
    for (const button of document.querySelectorAll('button[type="submit"]')) button.disabled = true;
    showFeedback("Yêu cầu đã bị xóa. Vui lòng quay lại danh sách.");
  });
});
