// Widget chat của Admin: danh sách hội thoại theo user + chi tiết từng cuộc chat.
document.addEventListener("DOMContentLoaded", () => {
  const fab = document.getElementById("chatFab");
  const panel = document.getElementById("chatPanel");
  const badge = document.getElementById("chatUnreadBadge");

  const listHead = document.getElementById("chatListHead");
  const listBox = document.getElementById("chatList");
  const closeBtn1 = document.getElementById("chatPanelClose");

  const detailHead = document.getElementById("chatDetailHead");
  const detailUsername = document.getElementById("chatDetailUsername");
  const detailMessages = document.getElementById("chatDetailMessages");
  const detailForm = document.getElementById("chatDetailForm");
  const detailInput = document.getElementById("chatDetailInput");
  const backBtn = document.getElementById("chatBackBtn");
  const closeBtn2 = document.getElementById("chatPanelClose2");

  if (!fab || !panel) return;

  let isOpen = false;
  let view = "list"; // "list" | "detail"
  let activeUserId = null;
  let activeUsername = "";
  let pollTimer = null;
  let lastCount = 0;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function timeAgo(dateStr) {
    return new Date(dateStr).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  }

  function showList() {
    // Chuyển về danh sách hội thoại và thay bộ hẹn giờ cũ bằng lịch tải danh sách mỗi 5 giây.
    view = "list";
    listHead.style.display = "flex";
    listBox.style.display = "block";
    detailHead.style.display = "none";
    detailMessages.style.display = "none";
    detailForm.style.display = "none";
    if (pollTimer) clearInterval(pollTimer);
    loadConversations(true);
    pollTimer = setInterval(loadConversations, 5000);
  }

  function showDetail(userId, username) {
    // Ghi nhớ user đang hỗ trợ để gửi/tải đúng cuộc trò chuyện; tải nội dung mỗi 4 giây.
    view = "detail";
    activeUserId = userId;
    activeUsername = username;
    lastCount = 0;
    listHead.style.display = "none";
    listBox.style.display = "none";
    detailHead.style.display = "flex";
    detailMessages.style.display = "flex"; // phải là flex để tin của mình canh phải, tin người kia canh trái
    detailForm.style.display = "flex";
    detailUsername.textContent = username;
    if (pollTimer) clearInterval(pollTimer);
    loadDetail(true);
    pollTimer = setInterval(loadDetail, 4000);
    setTimeout(() => detailInput && detailInput.focus(), 150);
  }

  async function loadConversations(initial = false) {
    try {
      if (initial) listBox.innerHTML = '<p class="chat-empty" role="status">Đang tải hội thoại…</p>';
      const data = await window.ITUI.request('/chat/api/conversations');
      renderList(data.conversations || []);
    } catch (e) {
      if (initial) { listBox.innerHTML = '<p class="chat-empty">Chưa tải được hội thoại. Đang thử lại…</p>'; window.ITUI.toast(e.message, 'error'); }
    }
  }

  function renderList(conversations) {
    // API trả từng hội thoại với tin cuối và số chưa đọc; escapeHtml trước khi chèn nội dung vào HTML.
    if (!conversations.length) {
      listBox.innerHTML = '<p class="chat-empty">Chưa có cuộc trò chuyện nào.</p>';
      return;
    }
    listBox.innerHTML = conversations
      .map((c) => {
        const preview = c.lastSenderRole !== "user" ? "IT: " + c.lastText : c.lastText;
        return `<button type="button" class="chat-list-item" data-user-id="${c.userId}" data-username="${escapeHtml(c.username)}">
          <span class="chat-list-top"><span class="chat-list-name">${escapeHtml(c.username)}</span><span class="chat-list-time">${timeAgo(c.lastAt)}</span></span>
          <span class="chat-list-preview">${escapeHtml(preview)}</span>
          ${c.unread > 0 ? `<span class="chat-list-unread">${c.unread}</span>` : ""}
        </button>`;
      })
      .join("");

    listBox.querySelectorAll(".chat-list-item").forEach((btn) => {
      btn.addEventListener("click", () => showDetail(btn.dataset.userId, btn.dataset.username));
    });
  }

  async function loadDetail(initial = false) {
    // activeUserId quyết định cuộc trò chuyện được gọi tới API messages/:userId.
    if (!activeUserId) return;
    const requestedUserId = activeUserId;
    try {
      if (initial) detailMessages.innerHTML = '<p class="chat-empty" role="status">Đang tải tin nhắn…</p>';
      const data = await window.ITUI.request('/chat/api/messages/' + requestedUserId);
      if (activeUserId !== requestedUserId || view !== 'detail') return;
      renderDetail(data.messages || []);
      refreshBadge();
    } catch (e) {
      if (initial && requestedUserId === activeUserId) { detailMessages.innerHTML = '<p class="chat-empty">Chưa tải được tin nhắn. Đang thử lại…</p>'; window.ITUI.toast(e.message, 'error'); }
    }
  }

  function renderDetail(messages) {
    if (!messages.length) {
      detailMessages.innerHTML = '<p class="chat-empty">Chưa có tin nhắn với người dùng này.</p>';
      return;
    }
    const nearBottom = detailMessages.scrollTop + detailMessages.clientHeight >= detailMessages.scrollHeight - 20;
    window.renderChatMessages(detailMessages, messages, "admin");
    if (nearBottom || messages.length !== lastCount) {
      detailMessages.scrollTop = detailMessages.scrollHeight;
    }
    lastCount = messages.length;
  }

  async function refreshBadge() {
    try {
      const res = await fetch("/chat/api/admin-unread-count");
      if (!res.ok) return;
      const data = await res.json();
      badge.textContent = data.count;
      badge.setAttribute("data-zero", data.count === 0 ? "true" : "false");
    } catch (e) {
      /* bỏ qua */
    }
  }

  function openPanel() {
    isOpen = true;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    showList();
  }

  function closePanel() {
    // Hủy hẹn giờ tải nội dung khi đóng panel để không tiếp tục hỏi hội thoại đang ẩn.
    isOpen = false;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    if (pollTimer) clearInterval(pollTimer);
  }

  fab.addEventListener("click", () => (isOpen ? closePanel() : openPanel()));
  closeBtn1 && closeBtn1.addEventListener("click", closePanel);
  closeBtn2 && closeBtn2.addEventListener("click", closePanel);
  backBtn && backBtn.addEventListener("click", showList);

  detailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = detailInput.value.trim();
    if (!text || !activeUserId) return;
    const button = detailForm.querySelector('button[type="submit"]');
    if (button.disabled) return;
    const recipientId = activeUserId;
    const restore = window.ITUI.busy(button, 'Đang gửi…');
    try {
      await window.ITUI.request("/chat/api/messages/" + recipientId, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "text=" + encodeURIComponent(text),
      });
      if (detailInput.value.trim() === text) detailInput.value = '';
      if (recipientId === activeUserId) loadDetail();
    } catch (e) {
      window.ITUI.toast(e.message, 'error');
    } finally { restore(); }
  });

  refreshBadge();
  setInterval(() => {
    if (!isOpen) refreshBadge();
  }, 15000);
});
