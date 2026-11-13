// Dùng chung ở Node và trình duyệt để nhãn hạn xử lý luôn có cùng cách tính.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.ITDeadlines = api;
    document.addEventListener('DOMContentLoaded', () => {
      api.refresh();
      // Thời gian vẫn trôi khi không có thao tác; cập nhật nhãn mỗi phút và khi quay lại tab.
      setInterval(() => api.refresh(), 60000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) api.refresh(); });
      if (root.socket) {
        for (const event of ['ticket:deadline', 'ticket:updated']) root.socket.on(event, payload => api.update(payload));
        root.socket.on('ticket:created', () => api.refresh());
      }
    });
  }
})(typeof window === 'undefined' ? globalThis : window, function () {
  const LABELS = { overdue: 'Quá hạn', soon: 'Sắp đến hạn', scheduled: 'Còn trên 24 giờ', none: 'Chưa đặt hạn' };
  const validTime = value => value ? new Date(value).getTime() : NaN;
  function info(ticket, now = new Date()) {
    const due = validTime(ticket.dueAt);
    if (!Number.isFinite(due)) return { key: 'none', label: LABELS.none };
    if (ticket.status === 'Hoàn thành') {
      const resolved = validTime(ticket.resolvedAt);
      if (!Number.isFinite(resolved)) return { key: 'closed', label: 'Đã hoàn thành (chưa rõ thời điểm)' };
      return resolved <= due ? { key: 'on-time', label: 'Hoàn thành đúng hạn' } : { key: 'late', label: 'Hoàn thành trễ hạn' };
    }
    const remaining = due - new Date(now).getTime();
    const key = remaining <= 0 ? 'overdue' : remaining <= 86400000 ? 'soon' : 'scheduled';
    return { key, label: LABELS[key] };
  }
  function format(value) {
    return Number.isFinite(validTime(value))
      ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : 'Chưa đặt hạn';
  }
  function inputValue(value) {
    return Number.isFinite(validTime(value)) ? new Date(validTime(value) + 7 * 36e5).toISOString().slice(0, 16) : '';
  }
  function refresh(scope = document) {
    scope.querySelectorAll('[data-deadline-ticket]').forEach(element => {
      const state = info({ dueAt: element.dataset.dueAt, status: element.dataset.status, resolvedAt: element.dataset.resolvedAt });
      element.className = 'ticket-deadline deadline-' + state.key;
      element.querySelector('[data-deadline-label]').textContent = state.label;
      const time = element.querySelector('time');
      time.hidden = !element.dataset.dueAt;
      time.textContent = element.dataset.dueAt ? format(element.dataset.dueAt) : '';
      if (element.dataset.dueAt) time.dateTime = element.dataset.dueAt;
      else time.removeAttribute('datetime');
    });
  }
  function update(payload) {
    document.querySelectorAll('[data-deadline-ticket]').forEach(element => {
      if (element.dataset.deadlineTicket !== String(payload.id)) return;
      for (const key of ['dueAt', 'status', 'resolvedAt']) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) element.dataset[key] = payload[key] || '';
      }
    });
    refresh();
    if (Object.prototype.hasOwnProperty.call(payload, 'dueAt')) {
      const notice = document.getElementById('detailFeedback') || document.getElementById('assignmentNotice');
      if (notice) { notice.textContent = 'Hạn xử lý vừa thay đổi. Tải lại trang để xem lịch sử và bộ lọc mới nhất.'; notice.hidden = false; }
    }
  }
  return { LABELS, info, format, inputValue, refresh, update };
});
