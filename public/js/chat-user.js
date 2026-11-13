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
    // Chỉ cuộn xuống khi đang gần cuối hoặc số tin thay đổi; lastCount nhớ số tin ở lần trước.
    if (!messages.length) {
      messagesBox.innerHTML = '<p class="chat-empty">Chưa có tin nhắn — gửi lời chào để bắt đầu trò chuyện với IT nhé!</p>';
      return;
    }
    const nearBottom = messagesBox.scrollTop + messagesBox.clientHeight >= messagesBox.scrollHeight - 20;
    window.renderChatMessages(messagesBox, messages, "user");
    if (nearBottom || messages.length !== lastCount) {
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }
    lastCount = messages.length;
  }

  async function loadMessages(initial = false) {
    // Chat dùng polling: trình duyệt hỏi API định kỳ, không nhận tin chat bằng Socket.IO.
    try {
      if (initial) messagesBox.innerHTML = '<p class="chat-empty" role="status">Đang tải tin nhắn…</p>';
      const data = await window.ITUI.request('/chat/api/messages');
      renderMessages(data.messages || []);
    } catch (e) {
      if (initial) {
        messagesBox.innerHTML = '<p class="chat-empty" role="status">Chưa tải được tin nhắn. Đang thử kết nối lại…</p>';
        window.ITUI.toast(e.message, 'error');
      }
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
    loadMessages(true);
    refreshBadge();
    // Khi mở khung chat: tải lại nội dung mỗi 4 giây.
    pollTimer = setInterval(loadMessages, 4000);
    setTimeout(() => input && input.focus(), 150);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    // Đóng khung thì dừng tải nội dung; bộ đếm chưa đọc vẫn được kiểm tra riêng bên dưới.
    if (pollTimer) clearInterval(pollTimer);
  }

  fab.addEventListener("click", () => (isOpen ? closePanel() : openPanel()));
  closeBtn && closeBtn.addEventListener("click", closePanel);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    const restore = window.ITUI.busy(button, 'Đang gửi…');
    try {
      await window.ITUI.request("/chat/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "text=" + encodeURIComponent(text),
      });
      if (input.value.trim() === text) input.value = '';
      loadMessages();
    } catch (e) {
      window.ITUI.toast(e.message, 'error');
    } finally { restore(); }
  });

  refreshBadge();
  // Khi đóng chat, chỉ hỏi số tin chưa đọc mỗi 15 giây để cập nhật huy hiệu trên nút mở.
  setInterval(() => {
    if (!isOpen) refreshBadge();
  }, 15000);
});
