# -*- coding: utf-8 -*-
# 对"两边都有但内容不同"的文件输出 diff 统计
import os, subprocess

TEMP = os.environ.get('TEMP', r'C:\Users\Administrator\AppData\Local\Temp')
REMOTE = os.path.join(TEMP, 'game_one_probe')
LOCAL = r'D:\yx'
GIT = r'C:\Users\Administrator\AppData\Local\GitHubDesktop\app-3.6.4\resources\app\git\cmd\git.exe'

CHANGED = [
    'assets/scripts/core/GameManager.ts',
    'assets/scripts/entities/BossController.ts',
    'assets/scripts/entities/BulletController.ts',
    'assets/scripts/entities/EnemyBase.ts',
    'assets/scripts/entities/PlayerController.ts',
    'assets/scripts/ui/ScreenManager.ts',
    'docs/art/art-inventory.md',
    'settings/v2/packages/cocos-service.json',
    'settings/v2/packages/engine.json',
    'settings/v2/packages/information.json',
    'tests/specs/bulletcontroller.test.js',
    'tests/specs/visualmanifest.test.js',
    'tests/specs/visualui.test.js',
    'tsconfig.test.json',
]

for f in CHANGED:
    rp = os.path.join(REMOTE, f.replace('/', os.sep))
    lp = os.path.join(LOCAL, f.replace('/', os.sep))
    # 用 git diff --no-index 统计（--stat 需要两个路径）
    r = subprocess.run([GIT, 'diff', '--no-index', '--stat', lp, rp],
                       capture_output=True, text=True, errors='replace')
    stat_line = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else '(无输出)'
    print('%-55s %s' % (f, stat_line))
