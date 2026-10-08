// Trang danh sách của admin: đổi trạng thái không tải lại trang + cập nhật thời gian thực.
document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("ticketTbody");
  if (!tbody) return;

  const rowOf = (id) => tbody.querySelector('tr[data-ticket-id="' + id + '"]');

  function flash(row) {
    row.classList.remove("row-flash");
    void row.offsetWidth; // chạy lại animation
    row.classList.add("row-flash");
  }

  function ensureEmptyRow() {
    if (tbody.querySelector("tr[data-ticket-id]") || document.getElementById("emptyRow")) return;
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.id = "emptyRow";
    tr.innerHTML = '<td colspan="8">Chưa có yêu cầu nào được gửi.</td>';
    tbody.appendChild(tr);
  }

  window.removeTicketEl = (id) => {
    const row = rowOf(id);
    if (row) row.remove();
    ensureEmptyRow();
  };

  // --- Admin tự đổi trạng thái bằng ô chọn (gọi AJAX, giao diện cập nhật qua sự kiện socket) ---
  tbody.addEventListener("change", async (e) => {
    const sel = e.target.closest(".js-status-select");
    if (!sel) return;
    const newStatus = sel.value;
    try {
      const res = await fetch("/admin/ticket/" + sel.dataset.id + "/status", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "status=" + encodeURIComponent(newStatus),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Cập nhật thất bại");
      sel.dataset.prev = newStatus;
    } catch (err) {
      sel.value = sel.dataset.prev; // hoàn tác
      alert("Không thể cập nhật trạng thái: " + err.message);
    }
  });

  // --- Sự kiện thời gian thực ---
  socket.on("ticket:updated", ({ id, status, slug }) => {
    const row = rowOf(id);
    if (!row) return;
    const stamp = row.querySelector(".js-stamp");
    stamp.className = "stamp stamp-" + slug + " js-stamp";
    stamp.textContent = status;
    const sel = row.querySelector(".js-status-select");
    sel.value = status;
    sel.dataset.prev = status;
    flash(row);
  });

  socket.on("ticket:deleted", ({ id }) => window.removeTicketEl(id));

  socket.on("ticket:created", ({ id, rowHtml }) => {
    if (rowOf(id)) return;
    const empty = document.getElementById("emptyRow");
    if (empty) empty.remove();
    tbody.insertAdjacentHTML("afterbegin", rowHtml);
    const row = rowOf(id);
    if (row) flash(row);
  });
});
