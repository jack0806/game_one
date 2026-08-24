# -*- coding: utf-8 -*-
# 对比远程仓库(game_one)与本地项目(D:\yx)的文件差异
import os, collections

TEMP = os.environ.get('TEMP', r'C:\Users\Administrator\AppData\Local\Temp')
REMOTE = os.path.join(TEMP, 'game_one_probe')
LOCAL = r'D:\yx'

# 远程文件清单（git ls-files 输出）
with open(os.path.join(TEMP, 'remote_files.txt'), encoding='utf-8') as f:
    remote_files = [l.strip().replace('\\', '/') for l in f if l.strip()]
print('远程文件总数:', len(remote_files))
dirs = collections.Counter(l.split('/')[0] for l in remote_files)
for d, c in dirs.most_common():
    print('  %s: %d' % (d, c))

# 本地文件清单（排除 gitignore 目录）
IGNORE_DIRS = {'.git', 'library', 'temp', 'local', 'build', 'node_modules', 'tests/dist', '.zcode', 'profiles', 'native'}
local_files = []
for root, dirs2, files in os.walk(LOCAL):
    rel = os.path.relpath(root, LOCAL).replace('\\', '/')
    if rel == '.': rel = ''
    parts = rel.split('/') if rel else []
    if any(p in IGNORE_DIRS for p in parts):
        continue
    for fn in files:
        if fn == '.DS_Store': continue
        p = (rel + '/' + fn) if rel else fn
        local_files.append(p)
print('本地文件总数:', len(local_files))

rs = set(remote_files)
ls = set(local_files)
only_remote = sorted(rs - ls)
only_local = sorted(ls - rs)
both = sorted(rs & ls)
print('\n远程有/本地没有(新增): %d' % len(only_remote))
for f in only_remote[:60]:
    print('  +', f)
if len(only_remote) > 60: print('  ... 等 %d 个' % len(only_remote))
print('\n本地有/远程没有(本地独有): %d' % len(only_local))
for f in only_local[:60]:
    print('  -', f)
if len(only_local) > 60: print('  ... 等 %d 个' % len(only_local))
print('\n两边都有: %d' % len(both))

# 两边都有但内容不同的文本文件
import hashlib
def md5(p):
    try:
        return hashlib.md5(open(p, 'rb').read()).hexdigest()
    except Exception:
        return None

TEXT_EXT = {'.ts', '.js', '.json', '.md', '.txt', '.meta', '.scene', '.yml', '.yaml', '.html', '.css'}
changed = []
for f in both:
    rp = os.path.join(REMOTE, f.replace('/', os.sep))
    lp = os.path.join(LOCAL, f.replace('/', os.sep))
    if not os.path.isfile(rp) or not os.path.isfile(lp):
        changed.append((f, 'one-side-missing')); continue
    if md5(rp) != md5(lp):
        changed.append((f, 'content-diff'))
print('\n两边都有但内容不同: %d' % len(changed))
for f, why in changed:
    print('  ~', f)
