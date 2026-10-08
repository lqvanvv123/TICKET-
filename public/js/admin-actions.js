// Xóa yêu cầu (dùng chung cho trang danh sách và bảng Kanban của admin).
// Việc gỡ phần tử khỏi giao diện do sự kiện Socket.IO "ticket:deleted" đảm nhiệm
// (admin nào cũng thấy cùng lúc); ở đây gỡ luôn phần tử cục bộ để phản hồi tức thì.
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-delete-ticket]");
  if (!btn) return;
  const id = btn.dataset.deleteTicket;

  if (!confirm("Xóa yêu cầu này? Thao tác không thể hoàn tác và người gửi sẽ nhận được thông báo.")) return;

  btn.disabled = true;
  try {
    const res = await fetch("/admin/ticket/" + id, { method: "DELETE" });
    // 404 = đã có admin khác xóa trước -> cũng gỡ khỏi giao diện
    if (!res.ok && res.status !== 404) throw new Error("HTTP " + res.status);
    if (window.removeTicketEl) window.removeTicketEl(id);
  } catch (err) {
    btn.disabled = false;
    alert("Không thể xóa yêu cầu. Vui lòng thử lại.");
  }
});
