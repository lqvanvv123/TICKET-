document.addEventListener("DOMContentLoaded", () => {
  const notice = document.getElementById("ticketListChanged");
  if (!notice || !window.socket) return;
  const showNotice = () => { notice.hidden = false; };
  for (const event of ["ticket:created", "ticket:updated", "ticket:deleted", "ticket:assigned"]) {
    window.socket.on(event, showNotice);
  }
  window.socket.on("ticket:assigned", ({ id, assignedTo }) => {
    const item = document.querySelector('[data-ticket-id="' + id + '"]');
    if (item) {
      const label = item.querySelector(".js-assignee");
      if (label) label.textContent = assignedTo ? assignedTo.username : "Chưa phân công";
    }
  });
  let hasConnected = window.socket.connected;
  window.socket.on("connect", () => {
    if (hasConnected) showNotice();
    hasConnected = true;
  });
});
