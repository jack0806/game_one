# -*- coding: utf-8 -*-
import os
p = os.path.join(os.environ['TEMP'], 'remote_EnemyBase.ts')
lines = open(p, encoding='utf-8').read().splitlines()
def show(a, b):
    for i in range(a - 1, min(b, len(lines))):
        print('%4d %s' % (i + 1, lines[i]))
    print('---')
show(28, 52)
show(88, 100)
show(160, 175)
