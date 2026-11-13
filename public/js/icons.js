// Tạo icon cho các phần tử JS thêm sau khi tải trang (thông báo, nhận việc, lịch sử).
// Sprite cùng nguồn với ứng dụng nên không cần CDN hoặc React trong trình duyệt.
(function () {
  const names = new Set(['bell', 'message-circle', 'menu', 'x', 'users', 'book-text', 'clock',
    'wrench', 'badge-alert', 'plus', 'chart-column-increasing', 'history', 'attach-file',
    'phone', 'clipboard-check', 'monitor-cog', 'arrow-left', 'arrow-right', 'send', 'logout',
    'download', 'check', 'user-check']);
  function create(name) {
    if (!names.has(name)) throw new Error('Unknown icon: ' + name);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ class: 'ui-icon ui-icon--' + name,
      width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '/icons/lucide.svg#' + name);
    svg.appendChild(use);
    return svg;
  }
  function play(svg) {
    if (!svg) return;
    svg.classList.remove('is-animating');
    void svg.getBoundingClientRect();
    svg.classList.add('is-animating');
  }
  document.addEventListener('animationend', event => {
    if (event.target.classList.contains('ui-icon')) event.target.classList.remove('is-animating');
  });
  window.ITIcons = { create, play };
})();
