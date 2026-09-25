// Mở/đóng thanh sidebar trượt bên trái (menu "Lỗi thường gặp")
document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const openBtn = document.getElementById("sidebarToggle");
  const closeBtn = document.getElementById("sidebarClose");

  if (!sidebar || !overlay || !openBtn) return;

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("open");
    sidebar.setAttribute("aria-hidden", "false");
    openBtn.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
    sidebar.setAttribute("aria-hidden", "true");
    openBtn.setAttribute("aria-expanded", "false");
  }

  openBtn.addEventListener("click", openSidebar);
  closeBtn && closeBtn.addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidebar();
  });
});
