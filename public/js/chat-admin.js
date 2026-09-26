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
    view = "list";
    listHead.style.display = "flex";
    listBox.style.display = "block";
    detailHead.style.display = "none";
    detailMessages.style.display = "none";
    detailForm.style.display = "none";
    if (pollTimer) clearInterval(pollTimer);
    loadConversations();
    pollTimer = setInterval(loadConversations, 5000);
  }

  function showDetail(userId, username) {
    view = "detail";
    activeUserId = userId;
    activeUsername = username;
    lastCount = 0;
    listHead.style.display = "none";
    listBox.style.display = "none";
    detailHead.style.display = "flex";
    detailMessages.style.display = "block";
    detailForm.style.display = "flex";
    detailUsername.textContent = username;
    if (pollTimer) clearInterval(pollTimer);
    loadDetail();
    pollTimer = setInterval(loadDetail, 4000);
    setTimeout(() => detailInput && detailInput.focus(), 150);
  }

  async function loadConversations() {
    try {
      const res = await fetch("/chat/api/conversations");
      if (!res.ok) return;
      const data = await res.json();
      renderList(data.conversations || []);
    } catch (e) {
      /* bỏ qua */
    }
  }

  function renderList(conversations) {
    if (!conversations.length) {
      listBox.innerHTML = '<p class="chat-empty">Chưa có cuộc trò chuyện nào.</p>';
      return;
    }
    listBox.innerHTML = conversations
      .map((c) => {
        const preview = c.lastSenderRole === "admin" ? "Bạn: " + c.lastText : c.lastText;
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

  async function loadDetail() {
    if (!activeUserId) return;
    try {
      const res = await fetch("/chat/api/messages/" + activeUserId);
      if (!res.ok) return;
      const data = await res.json();
      renderDetail(data.messages || []);
      refreshBadge();
    } catch (e) {
      /* bỏ qua */
    }
  }

  function renderDetail(messages) {
    if (!messages.length) {
      detailMessages.innerHTML = '<p class="chat-empty">Chưa có tin nhắn với người dùng này.</p>';
      return;
    }
    const nearBottom = detailMessages.scrollTop + detailMessages.clientHeight >= detailMessages.scrollHeight - 20;
    detailMessages.innerHTML = messages
      .map((m) => {
        const side = m.senderRole === "admin" ? "me" : "them";
        const time = new Date(m.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        return `<div class="chat-bubble ${side}"><span class="chat-bubble-text">${escapeHtml(m.text)}</span><span class="chat-bubble-time">${time}</span></div>`;
      })
      .join("");
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
    detailInput.value = "";
    try {
      const res = await fetch("/chat/api/messages/" + activeUserId, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "text=" + encodeURIComponent(text),
      });
      if (res.ok) loadDetail();
    } catch (e) {
      /* bỏ qua lỗi mạng tạm thời */
    }
  });

  refreshBadge();
  setInterval(() => {
    if (!isOpen) refreshBadge();
  }, 15000);
});
