# -*- coding: utf-8 -*-
# 复制远程独有文件到本地（排除垃圾 md 与 .git）
import os, shutil

TEMP = os.environ.get('TEMP', r'C:\Users\Administrator\AppData\Local\Temp')
REMOTE = os.path.join(TEMP, 'game_one_probe')
LOCAL = r'D:\yx'

with open(os.path.join(TEMP, 'remote_files.txt'), encoding='utf-8') as f:
    remote_files = [l.strip().replace('\\', '/') for l in f if l.strip()]

IGNORE = {'.git', 'library', 'temp', 'local', 'build', 'node_modules', 'tests/dist', '.zcode', 'profiles', 'native'}
local_files = []
for root, dirs, files in os.walk(LOCAL):
    rel = os.path.relpath(root, LOCAL).replace('\\', '/')
    if rel == '.': rel = ''
    parts = rel.split('/') if rel else []
    if any(p in IGNORE for p in parts): continue
    for fn in files:
        p = (rel + '/' + fn) if rel else fn
        local_files.append(p)

only_remote = sorted(set(remote_files) - set(local_files))
# 排除垃圾文件：数字编码乱码名 md（含 // 的 docs 路径）
copied, skipped = 0, []
for f in only_remote:
    if f.startswith('"docs//') or '//' in f:
        skipped.append(f)
        continue
    rp = os.path.join(REMOTE, f.replace('/', os.sep))
    lp = os.path.join(LOCAL, f.replace('/', os.sep))
    if not os.path.isfile(rp):
        skipped.append(f + ' (远程缺失)')
        continue
    os.makedirs(os.path.dirname(lp), exist_ok=True)
    shutil.copy2(rp, lp)
    copied += 1
print('已复制 %d 个文件' % copied)
print('跳过 %d 个:' % len(skipped))
for s in skipped: print('  -', s)
