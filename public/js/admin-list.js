// Trang danh sách của admin: đổi trạng thái không tải lại trang + cập nhật thời gian thực.
document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("ticketTbody");
  if (!tbody) return;

  const rowOf = (id) => tbody.querySelector('tr[data-ticket-id="' + id + '"]');
  function syncStatusPermission(row) {
    const select = row.querySelector(".js-status-select");
    if (select) select.disabled = document.body.dataset.role === "staff"
      && row.dataset.assigneeId !== document.body.dataset.userId;
  }

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
    tr.innerHTML = '<td colspan="9">Không có yêu cầu phù hợp.</td>';
    tbody.appendChild(tr);
  }

  window.removeTicketEl = (id) => {
    const row = rowOf(id);
    if (!row) return; // đã gỡ rồi (vd. phản hồi AJAX tới trước sự kiện socket) -> không trừ đếm 2 lần
    row.remove();
    window.addPageCount(-1);
    ensureEmptyRow();
  };

  // --- Admin tự đổi trạng thái bằng ô chọn (gọi AJAX, giao diện cập nhật qua sự kiện socket) ---
  tbody.addEventListener("change", async (e) => {
    const sel = e.target.closest(".js-status-select");
    if (!sel || sel.disabled) return;
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
  tbody.addEventListener("click", async (event) => {
    const button = event.target.closest(".js-claim-ticket");
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      const response = await fetch("/tickets/" + button.dataset.id + "/assignee", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: "assignedTo=" + encodeURIComponent(document.body.dataset.userId),
      });
      if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("Vui lòng đăng nhập lại.");
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Không thể nhận yêu cầu.");
      window.location.reload();
    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
  });

  socket.on("ticket:assigned", ({ id, assignedTo }) => {
    const row = rowOf(id);
    if (row) {
      row.dataset.assigneeId = assignedTo ? assignedTo.id : "";
      syncStatusPermission(row);
      row.querySelector(".js-assignee").textContent = assignedTo ? assignedTo.username : "Chưa phân công";
      const button = row.querySelector(".js-claim-ticket");
      if (button) button.remove();
      if (!assignedTo && document.body.dataset.role === "staff" && !row.classList.contains("status-done")) {
        const claim = document.createElement("button");
        claim.type = "button";
        claim.className = "btn btn-ghost js-claim-ticket";
        claim.dataset.id = id;
        claim.textContent = "Nhận xử lý";
        row.querySelector(".js-assignee").parentElement.appendChild(claim);
      }
      flash(row);
    }
    document.getElementById("assignmentNotice").hidden = false;
  });
  socket.on("ticket:updated", ({ id, status, slug }) => {
    const row = rowOf(id);
    if (!row) return;
    window.setStatusClass(row, slug);
    const stamp = row.querySelector(".js-stamp");
    stamp.className = "stamp stamp-" + slug + " js-stamp";
    stamp.textContent = status;
    const sel = row.querySelector(".js-status-select");
    if (sel) {
      sel.value = status;
      sel.dataset.prev = status;
      if (slug === "done") sel.remove();
    }
    if (slug === "done") {
      row.querySelectorAll('.js-claim-ticket, a[href^="/tickets/"]').forEach(element => {
        if (!element.closest('.ticket-title')) element.remove();
      });
    }
    flash(row);
  });

  socket.on("ticket:deleted", ({ id }) => window.removeTicketEl(id));

  socket.on("ticket:created", ({ id, rowHtml, staffRowHtml }) => {
    if (document.body.dataset.assignmentFilter === "mine") return;
    if (rowOf(id)) return;
    const empty = document.getElementById("emptyRow");
    if (empty) empty.remove();
    tbody.insertAdjacentHTML("afterbegin", document.body.dataset.role === 'staff' ? staffRowHtml : rowHtml);
    window.addPageCount(1);
    const row = rowOf(id);
    if (row) {
      syncStatusPermission(row);
      flash(row);
    }
  });
});
