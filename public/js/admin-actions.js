// Xóa yêu cầu từ trang danh sách của admin.
// Việc gỡ phần tử khỏi giao diện do sự kiện Socket.IO "ticket:deleted" đảm nhiệm
// (admin nào cũng thấy cùng lúc); ở đây gỡ luôn phần tử cục bộ để phản hồi tức thì.
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-delete-ticket]");
  if (!btn) return;
  const id = btn.dataset.deleteTicket;

  if (!confirm("Xóa yêu cầu này? Thao tác không thể hoàn tác và người gửi sẽ nhận được thông báo.")) return;

  if (btn.disabled) return;
  const restore = window.ITUI.busy(btn, 'Đang xóa…');
  try {
    const res = await fetch("/admin/ticket/" + id, { method: "DELETE" });
    // 404 = đã có admin khác xóa trước -> cũng gỡ khỏi giao diện
    if (!res.ok && res.status !== 404) throw new Error("HTTP " + res.status);
    if (window.removeTicketEl) window.removeTicketEl(id);
    window.ITUI.toast(res.status === 404 ? 'Yêu cầu này đã được xóa trước đó.' : 'Đã xóa yêu cầu.');
  } catch (err) {
    restore();
    window.ITUI.toast('Không thể xóa yêu cầu. Kiểm tra kết nối và thử lại.', 'error');
  }
});
