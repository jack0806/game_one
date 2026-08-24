# -*- coding: utf-8 -*-
import os

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
non_art = [f for f in only_remote if not f.startswith('assets/resources/art/')]
print('远程独有非贴图文件 %d 个:' % len(non_art))
for f in non_art:
    print('  +', f)
print('远程独有贴图相关 %d 个' % (len(only_remote) - len(non_art)))
