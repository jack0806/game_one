# -*- coding: utf-8 -*-
# 临时修复脚本：testroom.test.js 第 105 行 PILLAR_SPOTS 断言正则多了一个右括号
import io

p = r'D:\yx\tests\specs\testroom.test.js'
s = open(p, encoding='utf-8').read()

bad = r'\]\],\s*\];'   # 当前：双右括号（错误）
good = r'\],\s*\];'    # 目标：单右括号 + ,\s*];

count = s.count(bad)
print('bad 出现次数:', count)
if count >= 1:
    s = s.replace(bad, good, 1)
    open(p, 'w', encoding='utf-8').write(s)
    print('已替换')
else:
    print('未找到 bad 串，检查文件当前内容')
    for line in s.splitlines():
        if 'PILLAR_SPOTS' in line and 'const' in line:
            print(repr(line))
