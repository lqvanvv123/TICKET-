document.addEventListener("DOMContentLoaded", () => {
  const ticketId = document.body.dataset.ticketDetail;
  if (!ticketId) return;
  const feedback = document.getElementById("detailFeedback");
  function showFeedback(message) {
    feedback.textContent = message;
    feedback.hidden = false;
  }
  for (const form of document.querySelectorAll("[data-assignment-form], [data-status-form]")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      if (button.disabled) return;
      button.disabled = true;
      const url = form.hasAttribute("data-status-form") ? "/admin/ticket/" + ticketId + "/status" : form.action;
      try {
        const response = await fetch(url, {
          method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(new FormData(form)),
        });
        if (response.redirected || !(response.headers.get("content-type") || "").includes("application/json")) {
          throw new Error("Không thể cập nhật. Kiểm tra phiên đăng nhập rồi thử lại.");
        }
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Không thể cập nhật yêu cầu.");
        window.location.reload();
      } catch (error) {
        showFeedback(error.message || "Kết nối bị gián đoạn. Vui lòng thử lại.");
      } finally { button.disabled = false; }
    });
  }
  if (!window.socket) return;
  window.socket.on("ticket:updated", (payload) => {
    if (String(payload.id) !== ticketId) return;
    const stamp = document.getElementById("detailStatus");
    stamp.textContent = payload.status;
    stamp.className = "stamp stamp-" + payload.slug;
    const statusSelect = document.getElementById("detailStatusSelect");
    if (statusSelect) statusSelect.value = payload.status;
    if (payload.slug === "done") {
      document.querySelectorAll("[data-assignment-form], [data-status-form]").forEach(form => form.remove());
    }
    document.getElementById("detailResolved").textContent = payload.resolvedAt
      ? new Date(payload.resolvedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";
    showFeedback("Trạng thái vừa thay đổi. Tải lại trang để xem lịch sử mới nhất.");
  });
  window.socket.on("ticket:assigned", (payload) => {
    if (String(payload.id) !== ticketId) return;
    document.getElementById("detailAssignee").textContent = payload.assignedTo ? payload.assignedTo.username : "Chưa phân công";
    if (document.body.dataset.role === "staff") {
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
