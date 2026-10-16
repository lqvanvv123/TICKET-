// Cửa sổ xem lịch sử các trạng thái của 1 yêu cầu (trang danh sách admin).
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("historyModal");
  const list = document.getElementById("historyList");
  const sub = document.getElementById("historySub");
  if (!modal || !list) return;

  const SLUG = { "Chưa sửa": "new", "Đang sửa lỗi": "in-progress", "Hoàn thành": "done" };

  function stamp(status) {
    const el = document.createElement("span");
    el.className = "stamp stamp-" + (SLUG[status] || "new");
    el.textContent = status;
    return el;
  }

  function close() {
    modal.hidden = true;
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-history]");
    if (!btn) return;

    list.innerHTML = "";
    sub.textContent = "Đang tải...";
    modal.hidden = false;

    try {
      const res = await fetch("/admin/ticket/" + btn.dataset.history + "/history");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      sub.textContent = "#" + data.code + " — " + data.title;
      data.history.forEach((h) => {
        const li = document.createElement("li");
        const change = document.createElement("div");
        change.className = "history-change";
        if (h.from) {
          const arrow = document.createElement("span");
          arrow.textContent = "→";
          change.append(stamp(h.from), arrow, stamp(h.to));
        } else {
          const label = document.createElement("span");
          label.textContent = "Tạo yêu cầu:";
          change.append(label, stamp(h.to));
        }
        const meta = document.createElement("span");
        meta.className = "history-meta";
        meta.textContent = new Date(h.at).toLocaleString("vi-VN") + " · " + h.by;
        li.append(change, meta);
        list.append(li);
      });
    } catch (err) {
      sub.textContent = "Không tải được lịch sử trạng thái.";
    }
  });

  document.getElementById("historyClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
});
