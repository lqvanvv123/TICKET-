// Bảng thông báo: bấm chuông để mở/đóng, xóa từng thông báo hoặc xóa tất cả.
// Dùng chung cho cả trang user và admin.
document.addEventListener("DOMContentLoaded", () => {
  const wrap = document.getElementById("notifWrap");
  const bellBtn = document.getElementById("bellBtn");
  const panel = document.getElementById("notifPanel");
  const list = document.getElementById("notifList");
  const empty = document.getElementById("notifEmpty");
  const badge = document.getElementById("notif-count");
  if (!wrap || !bellBtn || !panel || !list) return;

  function setBadge(count) {
    if (!badge) return;
    badge.textContent = count;
    badge.setAttribute("data-zero", count === 0 ? "true" : "false");
  }

  function updateEmpty() {
    const has = list.querySelector(".notif-item");
    if (empty) empty.hidden = !!has;
  }

  function unreadInDom() {
    return list.querySelectorAll(".notif-item.unread").length;
  }

  function openPanel() {
    panel.hidden = false;
    bellBtn.setAttribute("aria-expanded", "true");
  }
  function closePanel() {
    panel.hidden = true;
    bellBtn.setAttribute("aria-expanded", "false");
  }

  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.hidden ? openPanel() : closePanel();
  });
  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });

  async function api(url, method) {
    const res = await fetch(url, { method });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // Bấm vào 1 thông báo -> đánh dấu đã đọc; bấm ✕ -> xóa
  list.addEventListener("click", async (e) => {
    const item = e.target.closest(".notif-item");
    if (!item) return;
    const id = item.dataset.id;

    try {
      if (e.target.closest("[data-del]")) {
        await api("/api/notifications/" + id, "DELETE");
        item.remove();
        updateEmpty();
        setBadge(unreadInDom());
      } else if (item.classList.contains("unread")) {
        await api("/api/notifications/" + id + "/read", "POST");
        item.classList.remove("unread");
        setBadge(unreadInDom());
      }
    } catch (err) {
      alert("Không thể cập nhật thông báo. Vui lòng thử lại.");
    }
  });

  document.getElementById("notifReadAll").addEventListener("click", async () => {
    try {
      await api("/api/notifications/read-all", "POST");
      list.querySelectorAll(".notif-item.unread").forEach((el) => el.classList.remove("unread"));
      setBadge(0);
    } catch (err) {
      alert("Không thể cập nhật thông báo. Vui lòng thử lại.");
    }
  });

  document.getElementById("notifClearAll").addEventListener("click", async () => {
    if (!list.querySelector(".notif-item")) return;
    if (!confirm("Xóa tất cả thông báo?")) return;
    try {
      await api("/api/notifications", "DELETE");
      list.querySelectorAll(".notif-item").forEach((el) => el.remove());
      updateEmpty();
      setBadge(0);
    } catch (err) {
      alert("Không thể xóa thông báo. Vui lòng thử lại.");
    }
  });

  function buildItem(n) {
    const item = document.createElement("div");
    item.className = "notif-item" + (n.isRead ? "" : " unread");
    item.dataset.id = n.id;

    const body = document.createElement("div");
    body.className = "notif-item-body";
    const text = document.createElement("span");
    text.className = "notif-text";
    text.textContent = n.message;
    const time = document.createElement("span");
    time.className = "notif-time";
    time.textContent = new Date(n.createdAt).toLocaleString("vi-VN");
    body.append(text, time);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "notif-del";
    del.setAttribute("data-del", "");
    del.setAttribute("aria-label", "Xóa thông báo");
    del.title = "Xóa thông báo";
    del.textContent = "✕";

    item.append(body, del);
    return item;
  }

  function render(items) {
    list.querySelectorAll(".notif-item").forEach((el) => el.remove());
    items.forEach((n) => list.insertBefore(buildItem(n), empty || null));
    updateEmpty();
  }

  // Thông báo mới đẩy tới ngay qua Socket.IO (không phải chờ polling)
  if (window.socket) {
    window.socket.on("notification:new", (n) => {
      if (list.querySelector('.notif-item[data-id="' + n.id + '"]')) return;
      list.insertBefore(buildItem(n), list.firstChild);
      updateEmpty();
      setBadge(unreadInDom());
    });
  }

  // Làm mới dự phòng (30 giây) phòng khi mất kết nối socket tạm thời
  async function refresh() {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setBadge(data.unread);
      render(data.items);
    } catch (e) {
      // Bỏ qua lỗi mạng tạm thời, thử lại ở lần sau
    }
  }

  setInterval(refresh, 30000);
});
