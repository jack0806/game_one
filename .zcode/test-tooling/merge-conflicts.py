# -*- coding: utf-8 -*-
# 处理 14 个"两边都有但内容不同"的文件
import os, shutil

TEMP = os.environ.get('TEMP', r'C:\Users\Administrator\AppData\Local\Temp')
REMOTE = os.path.join(TEMP, 'game_one_probe')
LOCAL = r'D:\yx'

# 用远程版本覆盖（本地未改过这些文件，远程是更新的）
USE_REMOTE = [
    'docs/art/art-inventory.md',
    'settings/v2/packages/cocos-service.json',
    'settings/v2/packages/engine.json',
    'settings/v2/packages/information.json',
    'tests/specs/visualmanifest.test.js',
    'tests/specs/visualui.test.js',
]
for f in USE_REMOTE:
    rp = os.path.join(REMOTE, f.replace('/', os.sep))
    lp = os.path.join(LOCAL, f.replace('/', os.sep))
    shutil.copy2(rp, lp)
    print('用远程版本:', f)

# tsconfig.test.json 取并集：本地 BossDB + 远程 Locomotion/DirectionalFacing
import json
with open(os.path.join(LOCAL, 'tsconfig.test.json'), encoding='utf-8') as f:
    local_cfg = json.load(f)
with open(os.path.join(REMOTE, 'tsconfig.test.json'), encoding='utf-8') as f:
    remote_cfg = json.load(f)
merged = sorted(set(local_cfg['include']) | set(remote_cfg['include']))
local_cfg['include'] = merged
with open(os.path.join(LOCAL, 'tsconfig.test.json'), 'w', encoding='utf-8') as f:
    json.dump(local_cfg, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('tsconfig.test.json 并集 (%d 项):' % len(merged))
for i in merged:
    print('  ', i)
