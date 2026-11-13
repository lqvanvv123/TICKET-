// Danh sách dùng cùng truy vấn ở server cho lọc, phân trang và realtime; không tự chèn dòng sai bộ lọc.
document.addEventListener('DOMContentLoaded', () => {
  const content = document.getElementById('ticketListContent');
  const form = document.getElementById('ticketFilters');
  if (!content || !form) return;
  const sync = document.getElementById('listSync');
  const refreshButton = document.getElementById('listRefresh');
  const filterPanel = document.querySelector('.ticket-filter-panel');
  const mobile = window.matchMedia('(max-width: 760px)');
  function fitFilters() { filterPanel.open = !mobile.matches || document.body.dataset.filterInvalid === 'true'; }
  fitFilters(); mobile.addEventListener('change',fitFilters);
  let activeUrl = document.body.dataset.listUrl;
  let revision = 0, timer, mutations = 0, refreshing = false, refreshAgain = false;
  const rowOf = id => [...content.querySelectorAll('[data-ticket-id]')].find(row => row.dataset.ticketId === String(id));
  const closeMenus = () => content.querySelectorAll('.ticket-row-menu[open], .ticket-export-menu[open]').forEach(menu => { menu.open = false; });

  function scheduleRefresh() {
    if (document.body.dataset.filterInvalid === 'true') return;
    refreshAgain = true;
    if (mutations || refreshing || content.querySelector('details[open]') || content.contains(document.activeElement) && document.activeElement.matches('select')) return;
    clearTimeout(timer);
    timer = setTimeout(() => refresh(), 450);
  }
  async function refresh(manual = false) {
    if (document.body.dataset.filterInvalid === 'true') {
      window.ITUI.toast('Vui lòng chỉnh bộ lọc và bấm Áp dụng trước khi làm mới.', 'error'); return;
    }
    if (mutations) { scheduleRefresh(); return; }
    const currentRevision = ++revision;
    refreshing = true; refreshAgain = false;
    clearTimeout(timer);
    const restore = manual ? window.ITUI.busy(refreshButton, 'Đang tải…') : () => {};
    content.setAttribute('aria-busy', 'true');
    sync.textContent = 'Đang cập nhật danh sách…';
    try {
      const url = new URL(activeUrl, window.location.origin);
      const data = await window.ITUI.request('/admin/tickets/data?' + url.searchParams);
      if (currentRevision !== revision) return;
      if (!manual && (content.querySelector('details[open]') || content.contains(document.activeElement) && document.activeElement.matches('select'))) {
        refreshAgain = true; return;
      }
      content.innerHTML = data.html;
      window.ITDeadlines?.refresh(content);
      document.getElementById('pageCount').textContent = data.total;
      activeUrl = data.url;
      document.body.dataset.listUrl = activeUrl;
      // Xóa dòng cuối trang cuối có thể làm server đưa người dùng về một trang trước đó.
      history.replaceState(null, '', activeUrl);
      sync.textContent = 'Đã cập nhật lúc ' + new Date().toLocaleTimeString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'});
      if (manual) window.ITUI.toast('Đã làm mới danh sách.');
    } catch (error) {
      if (currentRevision !== revision) return;
      sync.textContent = 'Chưa cập nhật được. Danh sách trước đó vẫn được giữ lại.';
      window.ITUI.toast(error.message, 'error');
    } finally {
      restore();
      if (currentRevision === revision) { refreshing = false; content.removeAttribute('aria-busy'); }
      if (refreshAgain) scheduleRefresh();
    }
  }

  // Áp dụng bằng GET để URL chia sẻ được, Back giữ đúng bộ lọc và trang; dữ liệu đang nhập không bị realtime ghi đè.
  form.addEventListener('submit', event => {
    const from = form.elements.from, to = form.elements.to;
    window.ITUI.fieldError(from, ''); window.ITUI.fieldError(to, '');
    if (from.value && to.value && from.value > to.value) {
      event.preventDefault();
      filterPanel.open = true;
      form.querySelector('.ticket-filter-more').open = true;
      window.ITUI.fieldError(to, 'Ngày kết thúc phải từ ngày bắt đầu trở đi.'); to.focus();
      return;
    }
    const restore = window.ITUI.busy(form.querySelector('button[type="submit"]'), 'Đang lọc…');
    // Trang mới thay thế sau khi GET xong; Back không được giữ nút đang tải.
    window.addEventListener('pageshow', restore, {once:true});
  });
  refreshButton.addEventListener('click', () => refresh(true));
  content.addEventListener('toggle', () => { if (refreshAgain) scheduleRefresh(); }, true);
  content.addEventListener('focusout', () => { if (refreshAgain) setTimeout(scheduleRefresh,0); });

  content.addEventListener('change', async event => {
    const select = event.target.closest('.js-status-select');
    if (!select || select.disabled) return;
    mutations++;
    const restore = window.ITUI.busy(select);
    const saving = document.createElement('span');
    saving.className = 'status-saving'; saving.setAttribute('role', 'status'); saving.textContent = 'Đang lưu…'; select.after(saving);
    try {
      const data = await window.ITUI.request('/admin/ticket/' + select.dataset.id + '/status', {
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({status:select.value}),
      });
      select.dataset.prev = data.status;
      applyStatus({id:select.dataset.id,...data});
      window.ITUI.toast('Đã cập nhật trạng thái: ' + data.status + '.');
      refreshAgain = true;
    } catch(error) {
      select.value = select.dataset.prev;
      window.ITUI.toast(error.message, 'error');
    } finally {
      restore(); saving.remove(); mutations--;
      const row = rowOf(select.dataset.id); if(row)syncPermission(row);
      if(refreshAgain)scheduleRefresh();
    }
  });
  content.addEventListener('click', async event => {
    const button = event.target.closest('.js-claim-ticket');
    if (!button || button.disabled) return;
    mutations++;
    const restore = window.ITUI.busy(button, 'Đang nhận…');
    try {
      await window.ITUI.request('/tickets/' + button.dataset.id + '/assignee', {
        method:'POST', headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({assignedTo:document.body.dataset.userId}),
      });
      window.ITUI.toast('Đã nhận xử lý. Trạng thái đã chuyển sang Đang sửa lỗi.');
      refreshAgain = true;
    } catch(error) { window.ITUI.toast(error.message, 'error'); }
    finally { restore(); mutations--; if(refreshAgain)scheduleRefresh(); }
  });

  function syncPermission(row) {
    const select = row.querySelector('.js-status-select');
    if (!select) return;
    const locked = document.body.dataset.role === 'staff' && row.dataset.assigneeId !== document.body.dataset.userId;
    select.disabled = locked;
    const hint = row.querySelector('.ticket-permission-hint');
    if(hint) {
      hint.hidden = !locked;
      hint.textContent = row.dataset.assigneeId ? 'Chỉ ' + row.querySelector('.js-assignee').textContent + ' được cập nhật.' : 'Nhận xử lý để cập nhật trạng thái.';
    }
  }
  function applyStatus(payload) {
    window.ITDeadlines?.update(payload);
    const row = rowOf(payload.id);
    if(!row) return;
    window.setStatusClass(row,payload.slug);
    const stamp = row.querySelector('.js-stamp');
    stamp.className = 'stamp stamp-' + payload.slug + ' js-stamp'; stamp.textContent = payload.status;
    const select = row.querySelector('.js-status-select');
    if(select) { select.value = payload.status; select.dataset.prev = payload.status; }
    if(payload.slug === 'done')row.querySelectorAll('.js-status-select,.js-claim-ticket,.js-open-assignment,.js-open-deadline,.ticket-permission-hint').forEach(element => element.remove());
  }
  // Xóa cục bộ để phản hồi ngay; tổng số, trang và link xuất phải lấy lại từ server.
  window.removeTicketEl = id => { rowOf(id)?.remove(); scheduleRefresh(); };
  if(window.socket) {
    socket.on('ticket:updated', payload => { applyStatus(payload); scheduleRefresh(); });
    socket.on('ticket:assigned', payload => {
      const row = rowOf(payload.id);
      if(row) {
        row.dataset.assigneeId = payload.assignedTo ? String(payload.assignedTo.id) : '';
        row.querySelector('.js-assignee').textContent = payload.assignedTo ? payload.assignedTo.username : 'Chưa phân công';
        syncPermission(row);
        if(payload.assignedTo)row.querySelector('.js-claim-ticket')?.remove();
      }
      scheduleRefresh();
    });
    socket.on('ticket:deleted', payload => window.removeTicketEl(payload.id));
    ['ticket:created','ticket:deadline','connect'].forEach(event => socket.on(event, scheduleRefresh));
  }
  // Đóng menu bằng bàn phím/nhấn ngoài. Không làm menu biến mất khi người dùng đang thao tác bên trong.
  document.addEventListener('click', event => {
    content.querySelectorAll('.ticket-row-menu[open], .ticket-export-menu[open]').forEach(menu => { if(!menu.contains(event.target))menu.open = false; });
    if(event.target.closest('[data-history]'))closeMenus();
  });
  document.addEventListener('keydown', event => {
    if(event.key !== 'Escape')return;
    const open = content.querySelector('details[open]');
    if(open) { open.open = false; open.querySelector('summary').focus(); }
  });
  // Bộ lọc hạn phụ thuộc đồng hồ ngay cả khi không có yêu cầu mới.
  setInterval(() => { if(!document.hidden && new URL(activeUrl,location.origin).searchParams.get('deadline'))scheduleRefresh(); },60000);
  document.addEventListener('visibilitychange', () => { if(!document.hidden)scheduleRefresh(); });
});
