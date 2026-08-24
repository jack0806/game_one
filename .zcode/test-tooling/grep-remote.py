# -*- coding: utf-8 -*-
import os
T = os.environ['TEMP']

def grep(fn, pats):
    lines = open(os.path.join(T, fn), encoding='utf-8').read().splitlines()
    for i, l in enumerate(lines):
        if any(p in l for p in pats):
            print('%s:%4d %s' % (fn, i + 1, l))

print('===== PlayerController 接入 =====')
grep('remote_Player.ts', ['Locomotion', 'DirectionalFacing', 'locomotion', 'directionalFacing', 'preloadArt'])
print('===== BossController 接入 =====')
grep('remote_Boss.ts', ['Locomotion', 'DirectionalFacing', 'locomotion', 'directionalFacing', 'moveSpriteKey'])
print('===== GameManager 接入 =====')
grep('remote_GM.ts', ['Locomotion', 'DirectionalFacing', 'locomotion', 'directionalFacing', 'moveSpriteKey', 'directionalArt', 'preloadArt'])
