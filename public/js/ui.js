// Phản hồi thao tác dùng chung: toast, nút đang chạy và lỗi ngay cạnh ô nhập.
(function () {
  let sequence = 0;
  const pending = new WeakMap();
  function toast(message, type = 'success') {
    let region = document.getElementById('toastRegion');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toastRegion'; region.className = 'toast-region';
      region.setAttribute('aria-label', 'Thông báo thao tác'); document.body.appendChild(region);
    }
    // Không xếp chồng cùng một lỗi nếu người dùng bấm gửi nhiều lần.
    if ([...region.children].some(item => item.dataset.message === message && item.dataset.type === type)) return;
    const item = document.createElement('div');
    item.dataset.message = message; item.dataset.type = type;
    item.className = 'toast toast--' + type;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const text = document.createElement('span'); text.textContent = message;
    const close = document.createElement('button'); close.type = 'button';
    close.setAttribute('aria-label', 'Đóng thông báo'); close.textContent = '×';
    close.addEventListener('click', () => item.remove());
    item.append(text, close); region.appendChild(item);
    // Lỗi giữ lại để người dùng đọc; thông báo thành công tự đóng sau 6 giây.
    if (type !== 'error') setTimeout(() => item.remove(), 6000);
    while (region.children.length > 4) region.firstElementChild.remove();
  }
  function busy(control, label = 'Đang lưu…') {
    if (!control || pending.has(control)) return () => {};
    const original = { disabled: control.disabled, nodes: [...control.childNodes] };
    pending.set(control, original);
    control.disabled = true; control.setAttribute('aria-busy', 'true');
    if (control.tagName === 'BUTTON') {
      const spinner = document.createElement('span'); spinner.className = 'ui-spinner';
      spinner.setAttribute('aria-hidden', 'true'); control.replaceChildren(spinner, document.createTextNode(label));
    }
    return () => {
      if (!pending.has(control)) return;
      pending.delete(control); control.disabled = original.disabled; control.removeAttribute('aria-busy');
      if (control.tagName === 'BUTTON') control.replaceChildren(...original.nodes);
    };
  }
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (response.redirected || response.status === 401) {
        throw new Error('Phiên đăng nhập có thể đã hết hạn. Vui lòng tải lại trang và đăng nhập.');
      }
      if (!(response.headers.get('content-type') || '').includes('application/json')) {
        throw new Error(response.status === 403 ? 'Bạn không có quyền thực hiện thao tác này.' : 'Máy chủ chưa trả được kết quả. Vui lòng tải lại trang để kiểm tra.');
      }
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || 'Không thể thực hiện thao tác. Vui lòng thử lại.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Chờ phản hồi quá lâu. Hãy tải lại để kiểm tra kết quả trước khi thử lại.');
      if (error instanceof TypeError) throw new Error('Mất kết nối. Hãy kiểm tra mạng và thử lại.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function flash(message) {
    try { sessionStorage.setItem('uiFlash', message); } catch { toast(message); }
  }
  function fieldError(control, message) {
    if (!control.id) control.id = 'ui-field-' + (++sequence);
    let error = control.form.querySelector('[data-field-error="' + control.name + '"]');
    if (!error) {
      error = document.createElement('p'); error.className = 'field-error';
      error.dataset.fieldError = control.name; error.id = control.id + '-error';
      control.insertAdjacentElement('afterend', error);
    }
    error.textContent = message; error.hidden = !message;
    if (message) {
      control.setAttribute('aria-invalid', 'true');
      const ids = new Set((control.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
      ids.add(error.id); control.setAttribute('aria-describedby', [...ids].join(' '));
    } else {
      control.removeAttribute('aria-invalid');
      const ids = (control.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== error.id);
      if (ids.length) control.setAttribute('aria-describedby', ids.join(' ')); else control.removeAttribute('aria-describedby');
    }
  }
  function validationMessage(control) {
    if (control.disabled || !control.name || control.type === 'hidden') return '';
    const label = control.labels?.[0]?.textContent.trim() || control.placeholder || 'Nội dung';
    const value = control.value || '';
    if (control.required && !value.trim()) return 'Vui lòng nhập ' + label.toLowerCase() + '.';
    if (value && control.minLength > 0 && value.length < control.minLength) return 'Cần ít nhất ' + control.minLength + ' ký tự.';
    if (control.maxLength > 0 && value.length > control.maxLength) return 'Tối đa ' + control.maxLength + ' ký tự.';
    if (control.name === 'confirmPassword' && value !== control.form.elements.password?.value) return 'Mật khẩu nhập lại chưa khớp.';
    if (control.type === 'file') {
      const files = [...control.files];
      if (files.length > 5) return 'Chỉ chọn tối đa 5 file đính kèm.';
      if (files.some(file => file.size > 5 * 1024 * 1024)) return 'Mỗi file phải có dung lượng không quá 5 MB.';
      if (files.some(file => !/\.(png|jpe?g|webp|gif|pdf|docx?|txt)$/i.test(file.name))) return 'Chỉ chấp nhận ảnh PNG/JPEG/WebP/GIF, PDF, Word hoặc TXT.';
    }
    if (control.validity.typeMismatch) return 'Vui lòng nhập đúng định dạng.';
    return '';
  }
  function validate(form) {
    let first;
    for (const control of form.querySelectorAll('input, textarea, select')) {
      if (!control.name || control.disabled || control.type === 'hidden') continue;
      const message = validationMessage(control); fieldError(control, message);
      if (message && !first) first = control;
    }
    if (first) {
      const details = first.closest('details'); if (details) details.open = true;
      first.focus(); toast('Vui lòng kiểm tra các ô được đánh dấu.', 'error');
    }
    return !first;
  }
  window.ITUI = { toast, busy, request, flash, fieldError, validate };
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-server-flash]').forEach(item => { toast(item.textContent.trim()); item.hidden = true; });
    try {
      const message = sessionStorage.getItem('uiFlash');
      if (message) { sessionStorage.removeItem('uiFlash'); toast(message); }
    } catch { /* Thông báo vẫn hoạt động nếu trình duyệt chặn sessionStorage. */ }
    for (const form of document.forms) {
      // Bỏ popup kiểm tra mặc định để dùng lỗi tiếng Việt ngay cạnh từng ô.
      if (form.method.toLowerCase() === 'post' || form.matches('#chatForm, #chatDetailForm')) form.noValidate = true;
      for (const error of form.querySelectorAll('[data-field-error]')) {
        const control = form.elements.namedItem(error.dataset.fieldError);
        if (control && error.textContent.trim()) fieldError(control, error.textContent.trim());
      }
    }
    const firstError = document.querySelector('[aria-invalid="true"]');
    if (firstError) { const details = firstError.closest('details'); if (details) details.open = true; firstError.focus(); }
  });
  // Capture chạy trước các handler gửi fetch. Form lỗi bị chặn trước khi gửi lên server.
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.method.toLowerCase() !== 'post' && !form.matches('#chatForm, #chatDetailForm')) return;
    if (form.dataset.submitting === 'true') { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (!validate(form)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    // Form AJAX đã gọi preventDefault sẽ tự quản lý trạng thái nút trong handler riêng.
    setTimeout(() => {
      if (event.defaultPrevented) return;
      form.dataset.submitting = 'true'; form.setAttribute('aria-busy', 'true');
      const button = event.submitter || form.querySelector('button[type="submit"]');
      if (button) busy(button, form.dataset.loadingText || 'Đang gửi…');
    }, 0);
  }, true);
  document.addEventListener('input', event => {
    const control = event.target;
    if (control.form && control.getAttribute('aria-invalid') === 'true') fieldError(control, validationMessage(control));
  });
  // Quay lại bằng nút Back không được giữ trạng thái nút đang tải từ trang cũ.
  window.addEventListener('pageshow', () => {
    document.querySelectorAll('[data-submitting]').forEach(form => { delete form.dataset.submitting; form.removeAttribute('aria-busy'); });
    document.querySelectorAll('[aria-busy="true"]').forEach(control => {
      const original = pending.get(control); if (!original) return;
      pending.delete(control); control.disabled = original.disabled; control.removeAttribute('aria-busy');
      if (control.tagName === 'BUTTON') control.replaceChildren(...original.nodes);
    });
  });
})();
