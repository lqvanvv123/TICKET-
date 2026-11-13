"""Tải SVG từ Lucide Animated và ghép sprite dùng cho EJS (chạy lại khi muốn cập nhật icon)."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import re
from urllib.request import Request, urlopen
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '4662fff2b60fdcf4751b32013606756caf7c4c26'
BASE = f'https://raw.githubusercontent.com/pqoqubbw/icons/{COMMIT}/'
NAMES = ['bell', 'message-circle', 'menu', 'x', 'users', 'book-text', 'clock',
         'wrench', 'badge-alert', 'plus', 'chart-column-increasing', 'history',
         'attach-file', 'phone', 'clipboard-check', 'monitor-cog',
         'arrow-left', 'arrow-right', 'send', 'logout', 'download', 'check', 'user-check']

def fetch(file):
    with urlopen(Request(BASE + file, headers={'User-Agent': 'IT-Support-icons'}), timeout=30) as response:
        return response.read().decode('utf-8')

def build(name):
    try:
        source = fetch(f'icons/{name}.tsx')
    except Exception as error:
        raise ValueError(f'{name}: {error}') from error
    shapes = []
    # Chỉ giữ hình SVG và thuộc tính tĩnh, bỏ React/Motion và mọi handler từ nguồn TSX.
    for tag, attrs in re.findall(r'<(?:motion\.)?(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*?)/>', source, re.S):
        values = re.findall(r'([\w-]+)=(?:"([^"]*)"|\{([\d.]+)\})', attrs)
        allowed = {'d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'fill'}
        kept = [(key, string or number) for key, string, number in values if key in allowed]
        if tag == 'path' and not any(key == 'd' for key, _ in kept):
            raise ValueError(f'{name}: đường vẽ động cần chuyển đổi thủ công')
        shapes.append('<' + tag + ' ' + ' '.join(f'{key}="{escape(value)}"' for key, value in kept) + '/>')
    # Đường bay của Send chỉ xuất hiện trong animation React; bỏ khỏi hình tĩnh ban đầu.
    if name == 'send':
        shapes = shapes[:2]
    if not shapes:
        raise ValueError(f'{name}: không tìm thấy hình SVG')
    return f'<symbol id="{name}" viewBox="0 0 24 24">' + ''.join(shapes) + '</symbol>'

if __name__ == '__main__':
    from concurrent.futures import as_completed
    symbols = []
    errors = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for future in as_completed([pool.submit(build, name) for name in NAMES]):
            try:
                symbols.append(future.result())
            except Exception as error:
                errors.append(str(error))
    if errors:
        raise SystemExit('\n'.join(errors))
    symbols.sort()
    target = ROOT / 'public/icons'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'lucide.svg').write_text(
        '<!-- SVG adapted from lucide-animated; see LICENSE-lucide-animated.txt -->\n'
        '<svg xmlns="http://www.w3.org/2000/svg">\n' + '\n'.join(symbols) + '\n</svg>\n', encoding='utf-8')
    (target / 'LICENSE-lucide-animated.txt').write_text(fetch('LICENSE'), encoding='utf-8')
    (target / 'source.json').write_text(json.dumps({'source': 'https://lucide-animated.com/',
        'repository': 'https://github.com/pqoqubbw/icons', 'commit': COMMIT,
        'adaptation': 'Static SVG geometry with local CSS animation for EJS', 'icons': NAMES}, indent=2), encoding='utf-8')
    print(f'Created {len(symbols)} local SVG icons')
