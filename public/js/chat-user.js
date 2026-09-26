// Widget chat của User: 1 cuộc trò chuyện duy nhất với team IT.
document.addEventListener("DOMContentLoaded", () => {
  const fab = document.getElementById("chatFab");
  const panel = document.getElementById("chatPanel");
  const closeBtn = document.getElementById("chatPanelClose");
  const messagesBox = document.getElementById("chatMessages");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const badge = document.getElementById("chatUnreadBadge");

  if (!fab || !panel) return;

  let isOpen = false;
  let pollTimer = null;
  let lastCount = 0;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderMessages(messages) {
    if (!messages.length) {
      messagesBox.innerHTML = '<p class="chat-empty">Chưa có tin nhắn — gửi lời chào để bắt đầu trò chuyện với IT nhé!</p>';
      return;
    }
    const nearBottom = messagesBox.scrollTop + messagesBox.clientHeight >= messagesBox.scrollHeight - 20;
    messagesBox.innerHTML = messages
      .map((m) => {
        const side = m.senderRole === "user" ? "me" : "them";
        const time = new Date(m.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        return `<div class="chat-bubble ${side}"><span class="chat-bubble-text">${escapeHtml(m.text)}</span><span class="chat-bubble-time">${time}</span></div>`;
      })
      .join("");
    if (nearBottom || messages.length !== lastCount) {
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }
    lastCount = messages.length;
  }

  async function loadMessages() {
    try {
      const res = await fetch("/chat/api/messages");
      if (!res.ok) return;
      const data = await res.json();
      renderMessages(data.messages || []);
    } catch (e) {
      // bỏ qua lỗi mạng tạm thời
    }
  }

  async function refreshBadge() {
    try {
      const res = await fetch("/chat/api/unread-count");
      if (!res.ok) return;
      const data = await res.json();
      badge.textContent = data.count;
      badge.setAttribute("data-zero", data.count === 0 ? "true" : "false");
    } catch (e) {
      // bỏ qua
    }
  }

  function openPanel() {
    isOpen = true;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    loadMessages();
    refreshBadge();
    pollTimer = setInterval(loadMessages, 4000);
    setTimeout(() => input && input.focus(), 150);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    if (pollTimer) clearInterval(pollTimer);
  }

  fab.addEventListener("click", () => (isOpen ? closePanel() : openPanel()));
  closeBtn && closeBtn.addEventListener("click", closePanel);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      const res = await fetch("/chat/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "text=" + encodeURIComponent(text),
      });
      if (res.ok) loadMessages();
    } catch (e) {
      // bỏ qua lỗi mạng tạm thời, người dùng có thể gửi lại
    }
  });

  refreshBadge();
  setInterval(() => {
    if (!isOpen) refreshBadge();
  }, 15000);
});
