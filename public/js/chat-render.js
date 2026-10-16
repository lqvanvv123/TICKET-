// Hiển thị danh sách tin nhắn chat, dùng chung cho widget của admin và của user
// -> hai bên nhìn giống hệt nhau: tin của mình bên phải, tin của người kia bên trái, có tên người gửi.
(function () {
  function esc(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // mySide: "user" (widget người dùng) hoặc "admin" (widget IT) = phía hiển thị bên phải
  window.renderChatMessages = function (box, messages, mySide) {
    let lastKey = null;
    let lastDay = null;
    let html = "";

    messages.forEach((m) => {
      const when = new Date(m.createdAt);
      const day = when.toLocaleDateString("vi-VN");
      if (day !== lastDay) {
        html += '<div class="chat-day"><span>' + day + "</span></div>";
        lastDay = day;
        lastKey = null; // sang ngày mới thì hiện lại tên
      }

      const side = (mySide === "user" ? m.senderRole === "user" : m.senderRole !== "user") ? "me" : "them";
      const name = m.senderName || (m.senderRole !== "user" ? "IT Support" : "Người dùng");
      const label = m.isMine ? "Bạn" : name + (m.senderRole !== "user" ? " · IT" : "");

      // Nhiều tin liên tiếp của cùng 1 người chỉ hiện tên ở tin đầu
      const key = m.senderRole + "|" + name + "|" + (m.isMine ? 1 : 0);
      const startsGroup = key !== lastKey;
      lastKey = key;

      const time = when.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      html +=
        '<div class="chat-bubble ' + side + " role-" + m.senderRole + (startsGroup ? " group-start" : "") + '">' +
        (startsGroup ? '<span class="chat-bubble-name">' + esc(label) + "</span>" : "") +
        '<span class="chat-bubble-text">' + esc(m.text) + "</span>" +
        '<span class="chat-bubble-time">' + time + "</span></div>";
    });

    box.innerHTML = html;
  };
})();
