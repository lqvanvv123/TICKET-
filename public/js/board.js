// Bảng Kanban: kéo-thả đổi trạng thái + đồng bộ thời gian thực giữa các admin.
document.addEventListener("DOMContentLoaded", () => {
  let draggedCard = null;

  const cardOf = (id) => document.querySelector('.board-card[data-id="' + id + '"]');
  const zoneOfStatus = (status) => {
    const col = [...document.querySelectorAll(".board-col")].find((c) => c.dataset.status === status);
    return col ? col.querySelector("[data-dropzone]") : null;
  };

  function syncColumns() {
    document.querySelectorAll(".board-col").forEach((col) => {
      const zone = col.querySelector("[data-dropzone]");
      const count = zone.querySelectorAll(".board-card").length;
      const countEl = col.querySelector(".board-count");
      if (countEl) countEl.textContent = count;

      let placeholder = zone.querySelector(".board-empty");
      if (count === 0 && !placeholder) {
        placeholder = document.createElement("div");
        placeholder.className = "board-empty";
        placeholder.textContent = "Không có yêu cầu";
        zone.appendChild(placeholder);
      } else if (count > 0 && placeholder) {
        placeholder.remove();
      }
    });
  }

  function flash(card) {
    card.classList.remove("row-flash");
    void card.offsetWidth;
    card.classList.add("row-flash");
  }

  window.removeTicketEl = (id) => {
    const card = cardOf(id);
    if (card) card.remove();
    syncColumns();
  };

  // --- Kéo-thả (dùng event delegation để thẻ mới thêm theo thời gian thực cũng kéo được) ---
  document.addEventListener("dragstart", (e) => {
    const card = e.target.closest && e.target.closest(".board-card");
    if (!card) return;
    draggedCard = card;
    card.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.dataset.id); // Firefox cần có dữ liệu mới cho kéo
    }
  });
  document.addEventListener("dragend", () => {
    if (draggedCard) draggedCard.classList.remove("dragging");
    draggedCard = null;
    document.querySelectorAll(".drop-hover").forEach((z) => z.classList.remove("drop-hover"));
  });
  document.addEventListener("dragover", (e) => {
    const zone = e.target.closest && e.target.closest("[data-dropzone]");
    if (!zone) return;
    e.preventDefault();
    zone.classList.add("drop-hover");
  });
  document.addEventListener("dragleave", (e) => {
    const zone = e.target.closest && e.target.closest("[data-dropzone]");
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("drop-hover");
  });
  document.addEventListener("drop", async (e) => {
    const zone = e.target.closest && e.target.closest("[data-dropzone]");
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove("drop-hover");
    if (!draggedCard) return;

    const card = draggedCard;
    const column = zone.closest(".board-col");
    const newStatus = column.dataset.status;
    const previousParent = card.parentElement;
    if (previousParent === zone) return;

    // Cập nhật UI trước (optimistic), lùi lại nếu server báo lỗi
    zone.appendChild(card);
    syncColumns();

    try {
      const res = await fetch("/admin/ticket/" + card.dataset.id + "/status", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "status=" + encodeURIComponent(newStatus),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Cập nhật thất bại");
    } catch (err) {
      previousParent.appendChild(card);
      syncColumns();
      alert("Không thể cập nhật trạng thái: " + err.message);
    }
  });

  // --- Sự kiện thời gian thực từ server ---
  socket.on("ticket:updated", ({ id, status }) => {
    const card = cardOf(id);
    const zone = zoneOfStatus(status);
    if (!card || !zone) return;
    if (card.parentElement !== zone) {
      zone.appendChild(card);
      syncColumns();
    }
    flash(card);
  });

  socket.on("ticket:deleted", ({ id }) => window.removeTicketEl(id));

  socket.on("ticket:created", ({ id, status, cardHtml }) => {
    if (cardOf(id)) return;
    const zone = zoneOfStatus(status);
    if (!zone) return;
    zone.insertAdjacentHTML("afterbegin", cardHtml);
    syncColumns();
    const card = cardOf(id);
    if (card) flash(card);
  });
});
