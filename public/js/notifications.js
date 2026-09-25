// Hỏi server mỗi 10 giây xem có thông báo mới không (polling đơn giản)
async function refreshNotifCount() {
  try {
    const res = await fetch("/api/notifications/count");
    if (!res.ok) return;
    const data = await res.json();
    const badge = document.getElementById("notif-count");
    if (badge) {
      badge.textContent = data.count;
      badge.setAttribute("data-zero", data.count === 0 ? "true" : "false");
    }
  } catch (e) {
    // Bỏ qua lỗi mạng tạm thời, thử lại ở lần sau
  }
}

setInterval(refreshNotifCount, 10000);
