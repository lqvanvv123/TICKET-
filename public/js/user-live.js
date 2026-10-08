// Trang của user: trạng thái yêu cầu đổi/bị xóa là thấy ngay, không cần tải lại trang.
document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("ticketTbody");
  if (!tbody) return;

  const rowOf = (id) => tbody.querySelector('tr[data-ticket-id="' + id + '"]');

  socket.on("ticket:updated", ({ id, status, slug }) => {
    const row = rowOf(id);
    if (!row) return;
    const stamp = row.querySelector(".js-stamp");
    stamp.className = "stamp stamp-" + slug + " js-stamp";
    stamp.textContent = status;
    row.classList.remove("row-flash");
    void row.offsetWidth;
    row.classList.add("row-flash");
  });

  socket.on("ticket:deleted", ({ id }) => {
    const row = rowOf(id);
    if (row) row.remove();
    if (!tbody.querySelector("tr[data-ticket-id]") && !document.getElementById("emptyRow")) {
      const tr = document.createElement("tr");
      tr.className = "empty-row";
      tr.id = "emptyRow";
      tr.innerHTML =
        '<td colspan="6">Bạn chưa gửi yêu cầu nào — điền vào form phía trên để gửi yêu cầu đầu tiên.</td>';
      tbody.appendChild(tr);
    }
  });
});
