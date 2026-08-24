# -*- coding: utf-8 -*-
import os
T = os.environ['TEMP']

lines = open(os.path.join(T, 'remote_GM.ts'), encoding='utf-8').read().splitlines()
for i, l in enumerate(lines):
    if '_visualDt' in l:
        print('GM:%4d %s' % (i + 1, l))

print('---')
plines = open(os.path.join(T, 'remote_Player.ts'), encoding='utf-8').read().splitlines()
for i in range(125, 140):
    print('P:%4d %s' % (i + 1, plines[i]))
print('---')
import subprocess
GIT = r'C:\Users\Administrator\AppData\Local\GitHubDesktop\app-3.6.4\resources\app\git\cmd\git.exe'
r = subprocess.run([GIT, 'show', 'HEAD:assets/scripts/core/SpriteUtils.ts'],
                   cwd=os.path.join(T, 'game_one_probe'), capture_output=True, text=True, encoding='utf-8')
for i, l in enumerate(r.stdout.splitlines()):
    if 'preloadArt' in l:
        print('SU:%4d %s' % (i + 1, l))
