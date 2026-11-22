# Ghép các file nguồn thành index.html (một file duy nhất) và chép icon/manifest/sw ra thư mục gốc.
import os, shutil
src = os.path.dirname(os.path.abspath(__file__)); dist = os.path.dirname(src)
rd = lambda f: open(os.path.join(src, f), encoding='utf-8').read()
html = rd('template.html')
for key, f in (('/*__CORE__*/', 'xq.js'), ('/*__PUZZLES__*/', 'puzzles.json'), ('/*__OPENINGS__*/', 'openings.json'), ('/*__APP__*/', 'app.js')):
    html = html.replace(key, rd(f))
open(os.path.join(dist, 'index.html'), 'w', encoding='utf-8').write(html)
for f in os.listdir(os.path.join(src, 'assets')):
    shutil.copy(os.path.join(src, 'assets', f), os.path.join(dist, f))
print('Đã tạo index.html', len(html) // 1024, 'KB')
