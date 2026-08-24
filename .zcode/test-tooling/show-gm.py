# -*- coding: utf-8 -*-
import os
T = os.environ['TEMP']
lines = open(os.path.join(T, 'remote_GM.ts'), encoding='utf-8').read().splitlines()
def show(a, b):
    for i in range(a - 1, min(b, len(lines))):
        print('%4d %s' % (i + 1, lines[i]))
    print('---')
show(596, 615)   # 贴图应用辅助
show(725, 790)   # 敌人渲染
show(940, 1000)  # 玩家渲染
show(1255, 1275) # spawnEnemy 预热
