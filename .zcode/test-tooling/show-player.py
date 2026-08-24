# -*- coding: utf-8 -*-
import os
T = os.environ['TEMP']
lines = open(os.path.join(T, 'remote_Player.ts'), encoding='utf-8').read().splitlines()
for i in range(40, 115):
    print('%4d %s' % (i + 1, lines[i]))
