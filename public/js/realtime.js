// Kết nối Socket.IO dùng chung cho mọi trang đã đăng nhập (server nhận diện người dùng qua session).
window.socket = io();

// Chỉ báo "Trực tiếp" ở tiêu đề các trang admin (xanh = đang nhận cập nhật tức thì)
(function () {
  const STATES = {
    online: "Trực tiếp",
    offline: "Mất kết nối",
    connecting: "Đang kết nối",
  };
  function setLive(state) {
    const pill = document.getElementById("livePill");
    if (!pill) return;
    pill.dataset.state = state;
    pill.querySelector(".live-text").textContent = STATES[state];
  }
  socket.on("connect", () => setLive("online"));
  socket.on("disconnect", () => setLive("offline"));
  socket.on("connect_error", () => setLive("offline"));
  document.addEventListener("DOMContentLoaded", () => setLive(socket.connected ? "online" : "connecting"));

  // Đổi class màu trạng thái (status-new / status-in-progress / status-done) trên 1 phần tử
  window.setStatusClass = function (el, slug) {
    [...el.classList].filter((c) => c.startsWith("status-")).forEach((c) => el.classList.remove(c));
    el.classList.add("status-" + slug);
  };

  // Cập nhật số đếm ở tiêu đề trang
  window.addPageCount = function (delta) {
    const el = document.getElementById("pageCount");
    if (el) el.textContent = Math.max(0, (parseInt(el.textContent, 10) || 0) + delta);
  };
})();
