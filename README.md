# Hexblast — 海克斯幸存者

Cocos Creator 3.8.8 顶视角射击 roguelite（TypeScript）。6 名角色 × 50 个海克斯词条 × 4 章节波次 + Boss，单场景 `assets/scenes/Game.scene`，画布 1280×720，所有 UI/实体节点由代码程序化构建。本项目为外部 `hexblast-py` 的 TS 重制版。

## 运行

1. 用 **Cocos Creator 3.8.8** 打开本仓库根目录（首次打开会生成 `library/`/`temp/`，已被 gitignore）。
2. 打开 `assets/scenes/Game.scene`，点击预览运行。

无需额外服务端；`npm install` 只装开发依赖（TypeScript + cc 测试桩）。

```bash
npm run typecheck  # 全量 TS 类型检查（需先用编辑器打开过一次项目）
npm test           # 编译到 tests/dist 并跑 node --test 全量回归（headless，不开编辑器）
```

Web Desktop 发布请使用 `tools/build-web-desktop.json` 作为 Cocos CLI
`configPath`；它同时锁定设计画布和发布外壳为 1280×720，避免默认
1280×960 产生上下留黑。

## 操作

| 输入 | 行为 |
|------|------|
| WASD / 方向键 | 移动 |
| 鼠标 | 瞄准（无鼠标指向时自动索敌最近目标） |
| Shift / Space | 冲刺（3s CD；「相位跳跃」词条下变为传送） |
| Q / E | 技能（4s / 10s CD） |
| R | 终极技能（充能满释放）；「宇宙法则」词条下独立触发 |
| M | 角色属性、技能与当前强化详情 |
| Esc | 暂停 / 菜单 |

## 核心系统

- **角色（6）**：`assets/scripts/data/CharacterDB.ts` — 近战狂战士雷克、弹幕凯、炮台薇薇安等，各自带被动/Q/E/R 与初始面板。
- **海克斯词条（50）**：`assets/scripts/data/AugmentDB.ts` — 蓝/紫/橙/金四档稀有度，三选一获取，最高 6 格（六角特权可到 10）。词条按稀有度随波次加权投放；带 `attackType` 标记的纯弹道词条不会刷给近战角色。
  - **代价设计**：部分强力词条带负面代价（如「精准射击」暴击率+20% 但移速-5%、「暴击强化」暴伤+60% 但最大HP-8%），升级时收益与代价按同比例追加。
- **商店**：波次间隙用金币购买属性/词条。
- **波次与章节**：`WaveData.ts` — 4 章节 × 10 波，每 10 波一个 Boss（毒球/齿轮/追踪/混沌四种弹幕形态），无尽模式叠加变异词条。
- **经济**：金币固定掉落在敌人死亡位置（纯二维平面，无重力下落）。

## 战斗区与坐标

逻辑坐标 1280×720、左上原点、Y 向下。底部 72px 为 HUD 保留区，统一边界常量 `PLAYFIELD_BOTTOM = 648`（`core/Constants.ts`）：玩家/敌人/Boss/子弹/金币/刷怪点全部以战斗区为界，不再沉入 HUD 区。

## 近期功能（2026-08）

- 狂战士 5% 攻击吸血（按实际扣血结算：护盾/护甲减免后的真实伤害）
- 近战剑气特效：玩家 / 怪物 / Boss 三级强度，狂战士 Q 冲锋斩出路径长刃
- Boss 四章敌弹可辨识化：毒球绿雾 / 齿轮旋转辐条 / 追踪锁定环 / 混沌脉冲圈（尾迹 + 轮廓双重视觉）
- 词条攻击方式适配过滤 + 部分词条负面代价
- HUD 海克斯格图标居中修复、格子 8→10
- 六名英雄战斗立绘、治疗/爆炸/冰箭/海克斯/毒素特效完成统一美术升级
- 六边形金属按钮交互皮肤与 7 首无缝循环 BGM、19 个独立 SFX 已接入主要界面和战斗事件

## 目录结构

```
assets/scripts/
├── core/      GameManager（组合根/主循环）、Constants、MathUtils、SpriteUtils…
├── data/      CharacterDB、AugmentDB、WaveData（纯静态数据）
├── systems/   AugmentManager、Economy、WaveManager、ParticleManager…
├── entities/  PlayerController、EnemyBase、BossController、BulletController
└── ui/        HUD、AugSelectUI、ShopUI、ScreenManager
docs/          美术/音频资源清单与生成提示词（见 docs/README.md）
tests/         node:test 回归（specs + dist桩），headless 可脱离编辑器运行
```

开发工作区详细约定（分层规则、美术 ArtRemap 机制、测试体系注意事项）见 [AGENTS.md](AGENTS.md)；资源清单见 [docs/README.md](docs/README.md)。

## 已知限制

- 「宇宙法则」的"敌人互攻"仅实现变色 + 5s 后全体爆炸（沿用 Python 原版半成品行为）。
- 角色目前仍为单帧战斗 Sprite；若进入商业化精修，下一阶段建议为 6 人各补待机/移动/攻击/受击序列帧。
