// Kéo-thả ticket giữa các cột trạng thái trên bảng Kanban.
document.addEventListener("DOMContentLoaded", () => {
  const cards = document.querySelectorAll(".board-card");
  const dropzones = document.querySelectorAll("[data-dropzone]");

  let draggedCard = null;

  cards.forEach((card) => {
    card.addEventListener("dragstart", () => {
      draggedCard = card;
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggedCard = null;
    });
  });

  dropzones.forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drop-hover");
    });
    zone.addEventListener("dragleave", () => {
      zone.classList.remove("drop-hover");
    });
    zone.addEventListener("drop", async (e) => {
      e.preventDefault();
      zone.classList.remove("drop-hover");
      if (!draggedCard) return;

      const column = zone.closest(".board-col");
      const newStatus = column.dataset.status;
      const ticketId = draggedCard.dataset.id;
      const sourceColumn = draggedCard.closest(".board-col");

      if (sourceColumn === column) return; // thả lại cùng cột, không cần gọi API

      // Cập nhật UI trước (optimistic), lùi lại nếu server báo lỗi
      const previousParent = draggedCard.parentElement;
      zone.appendChild(draggedCard);
      updateColumnCounts();

      try {
        const res = await fetch(`/admin/ticket/${ticketId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "status=" + encodeURIComponent(newStatus),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Cập nhật thất bại");

        // Cập nhật lại nhãn stamp trạng thái nếu có hiển thị trên card
        const stamp = column.querySelector(".board-col-head .stamp");
        // không cần đổi gì trên card, chỉ đảm bảo đã lưu đúng cột
      } catch (err) {
        // Lỗi mạng/server -> hoàn tác lại vị trí cũ
        previousParent.appendChild(draggedCard);
        updateColumnCounts();
        alert("Không thể cập nhật trạng thái: " + err.message);
      }
    });
  });

  function updateColumnCounts() {
    document.querySelectorAll(".board-col").forEach((col) => {
      const count = col.querySelectorAll(".board-card").length;
      const countEl = col.querySelector(".board-count");
      if (countEl) countEl.textContent = count;
    });
  }
});
