// Điều khiển bộ lọc, biểu đồ và cập nhật realtime; không thực hiện thao tác sửa yêu cầu.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('dashboardFilters');
  if (!form) return;
  const content = document.getElementById('dashboardContent');
  const refreshButton = document.getElementById('dashboardRefresh');
  const sync = document.getElementById('dashboardSync');
  const auto = document.getElementById('dashboardAuto');
  let activeParams;
  let revision = 0, timer;
  const charts = [];
  function destroyCharts() { while (charts.length) charts.pop().destroy(); }
  function drawCharts(data) {
    if (!window.Chart) {
      content.querySelectorAll('.chart-box').forEach(box => { box.hidden = true; });
      const note = document.createElement('p'); note.className = 'dashboard-hint';
      note.textContent = 'Chưa tải được thư viện biểu đồ. Bạn vẫn có thể xem đầy đủ số liệu bên dưới.';
      content.querySelector('.dashboard-chart-grid').before(note);
      return;
    }
    const css = getComputedStyle(document.documentElement);
    const color = name => css.getPropertyValue(name).trim();
    const ink = color('--ink-soft');
    const options = { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0, color: ink }, grid: { color: color('--rule') } }, x: { ticks: { color: ink }, grid: { display: false } } } };
    function chart(id, type, entries, colors) {
      const canvas = document.getElementById(id);
      if (!canvas) return;
      charts.push(new Chart(canvas, { type,
        data: { labels: Object.keys(entries), datasets: [{ data: Object.values(entries), backgroundColor: colors, borderWidth: type === 'doughnut' ? 2 : 0, borderColor: color('--surface') }] },
        options: type === 'doughnut' ? { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } : options,
      }));
    }
    chart('chartStatus', 'doughnut', data.status, ['--stamp-new', '--stamp-progress', '--stamp-done'].map(color));
    chart('chartPriority', 'bar', data.priority, ['--prio-low', '--prio-medium', '--prio-high', '--prio-urgent'].map(color));
    chart('chartType', 'bar', data.type, color('--type-ink'));
    if (document.getElementById('chartTrend')) charts.push(new Chart(document.getElementById('chartTrend'), { type: 'line',
      data: { labels: data.trend.labels.map(day => day.split('-').reverse().join('/')),
        datasets: [{ label: 'Yêu cầu mới', data: data.trend.counts, borderColor: color('--stamp-progress'),
          backgroundColor: color('--stamp-progress-bg'), fill: true, tension: .2, pointRadius: data.trend.labels.length > 60 ? 0 : 3 }] },
      options,
    }));
  }
  function dateControls() {
    const custom = form.elements.range.value === 'custom';
    form.querySelectorAll('[data-custom-date]').forEach(box => { box.hidden = !custom; });
    for (const field of [form.elements.from, form.elements.to]) { field.disabled = !custom; field.required = custom; }
  }
  dateControls();
  form.noValidate = true;
  activeParams = new URLSearchParams(new FormData(form));
  form.elements.range.addEventListener('change', dateControls);
  drawCharts(JSON.parse(document.getElementById('dashboardData').textContent));

  async function refresh(params = activeParams, manual = false, apply = false) {
    const requestRevision = ++revision;
    const restore = manual ? window.ITUI.busy(refreshButton, 'Đang tải…') : () => {};
    const filterButton = form.querySelector('button[type="submit"]');
    const restoreFilter = apply ? window.ITUI.busy(filterButton, 'Đang lọc…') : () => {};
    sync.textContent = 'Đang cập nhật số liệu…';
    content.setAttribute('aria-busy', 'true');
    try {
      const data = await window.ITUI.request('/admin/dashboard/data?' + params);
      // Bỏ phản hồi cũ nếu người dùng đã gửi bộ lọc khác trong lúc request trước chưa xong.
      if (requestRevision !== revision) return;
      destroyCharts(); content.innerHTML = data.html; drawCharts(data.chartData);
      window.ITDeadlines?.refresh(content);
      activeParams = new URLSearchParams(params);
      if (apply) history.replaceState(null, '', '/admin/dashboard?' + activeParams);
      sync.textContent = 'Đã cập nhật lúc ' + new Date(data.generatedAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      if (apply || manual) window.ITUI.toast(apply ? 'Đã áp dụng bộ lọc Dashboard.' : 'Đã làm mới Dashboard.');
    } catch (error) {
      if (requestRevision !== revision) return;
      sync.textContent = 'Chưa cập nhật được. Dữ liệu trước đó vẫn được giữ lại.';
      window.ITUI.toast(error.message, 'error');
    } finally {
      restore(); restoreFilter();
      if (requestRevision === revision) content.removeAttribute('aria-busy');
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const { range, from, to } = form.elements;
    window.ITUI.fieldError(from, ''); window.ITUI.fieldError(to, '');
    if (range.value === 'custom') {
      const message = !from.value || !to.value ? 'Vui lòng chọn đủ ngày bắt đầu và kết thúc.'
        : from.value > to.value ? 'Ngày kết thúc phải từ ngày bắt đầu trở đi.'
        : (Date.parse(to.value) - Date.parse(from.value)) / 86400000 > 365 ? 'Chọn tối đa 366 ngày.' : '';
      if (message) { window.ITUI.fieldError(to, message); to.focus(); return; }
    }
    clearTimeout(timer);
    refresh(new URLSearchParams(new FormData(form)), false, true);
  });
  refreshButton.addEventListener('click', () => { clearTimeout(timer); refresh(activeParams, true); });
  function scheduleRefresh() {
    if (!auto.checked) { sync.textContent = 'Có thay đổi mới. Bấm Làm mới để cập nhật.'; return; }
    // Không ghi đè một bộ lọc người dùng đang chờ áp dụng bằng request realtime dùng bộ lọc cũ.
    if (form.querySelector('button[type="submit"]').disabled) { sync.textContent = 'Có thay đổi mới trong lúc đang lọc. Bấm Làm mới sau khi lọc xong.'; return; }
    clearTimeout(timer); timer = setTimeout(() => refresh(), 500);
  }
  auto.addEventListener('change', () => { if (auto.checked) scheduleRefresh(); else clearTimeout(timer); });
  // KPI quá hạn phải thay đổi cả khi đồng hồ vượt hạn mà không có sự kiện từ người dùng.
  setInterval(() => { if (auto.checked && !document.hidden) scheduleRefresh(); }, 60000);
  if (window.socket) {
    ['ticket:created', 'ticket:updated', 'ticket:assigned', 'ticket:deadline', 'ticket:deleted', 'connect'].forEach(event => window.socket.on(event, scheduleRefresh));
  }
});
