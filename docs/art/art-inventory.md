# 现有美术资源清单（assets/resources/art/）

共 49 张 PNG，全部被代码引用且有对应文件（`tests/specs/artmanifest.test.js` 自检通过）。

所有图片加载都走 `core/ArtRemap.ts` 的 `artPath(key)`（拼 `/spriteFrame` 后缀），替换图片只需**覆盖同名文件内容**。

---

## 1. 标题与章节背景（5 张）

| 文件名（key） | 实际内容 | 引用位置 | 规格参考 |
|---|---|---|---|
| `title_screen` | 标题屏整版图（含烧录的 "START GAME" 按钮文字，按钮热区坐标在代码里） | `ScreenManager.ts:81` | 1659×948 |
| `bg_chapter1` | ⚠️ 磁盘内容实为**第4章「混沌位面」**画面 | `WaveData.ts`（bgKey）+ `GameManager.ts` | 1659×948 |
| `bg_chapter2` | 第2章 钢铁工厂 | 同上 | 1659×948 |
| `bg_chapter3` | 第3章 海克斯实验室 | 同上 | 1659×948 |
| `bg_chapter4` | ⚠️ 磁盘内容实为**第1章「废土街道」**画面 | 同上 | 1659×948 |

> ⚠️ **ArtRemap 坑**：`bg_chapter1` 与 `bg_chapter4` 两个文件的内容互为对方章节，代码经 `ART_REMAP` 重映射纠正。**替换背景时**：
> - 想替换"第1章废土街道"的画面 → 生成废土街道图 → 覆盖 `bg_chapter4.png`
> - 想替换"第4章混沌位面"的画面 → 生成混沌位面图 → 覆盖 `bg_chapter1.png`
> - 或者：四张全部按各自文件名的内容重新生成，然后把 `ArtRemap.ts` 里两条映射删掉（更推荐，一步到位消除错位）。

章节主题（生成提示词参考，出自 `WaveData.ts`）：

| 章 | 名称 | 描述 |
|---|---|---|
| 1 | 废土街道 | 废弃的城市废墟，腐肉横行 |
| 2 | 钢铁工厂 | 轰鸣的熔炉，钢铁巨兽苏醒 |
| 3 | 海克斯实验室 | 高能辐射区域，异变体涌现 |
| 4 | 混沌位面 | 现实崩塌，终焉之门大开 |

## 2. 角色立绘（6 张）

选人界面头像（`ScreenManager.ts:130`，按 `char_<id>` 加载，显示 160px）。

| 文件名（key） | 角色 | 主题色（来自 CharacterDB，生成时保持色调一致） |
|---|---|---|
| `char_kai` | 炮击手·凯尔 | `#00ffcc` 青 |
| `char_vivian` | 工程师·薇薇安 | `#00aaff` 蓝 |
| `char_reik` | 狂战士·雷克 | `#ff4444` 红 |
| `char_olia` | 时空行者·奥莉亚 | `#aaddff` 浅蓝 |
| `char_graf` | 混沌傀儡·格雷夫（未解锁角色） | `#cc44ff` 紫 |
| `char_liana` | 冰霜狙击手·利亚娜（未解锁角色） | `#00ccff` 冰蓝 |

规格参考：约 161×191（**当前分辨率偏低**，重生成建议 512×512 以上）。

## 3. 角色游戏内头像 token（6 张）

HUD 界面玩家小头像，按 `char_token_<id>` 加载（`PlayerController.ts:73,81`）。

`char_token_kai` / `char_token_vivian` / `char_token_reik` / `char_token_olia` / `char_token_graf` / `char_token_liana`

## 4. 角色子弹（6 张）

按 `bullet_<id>` 加载（`BulletController.ts`），每种角色一个弹道贴图。

`bullet_kai` / `bullet_vivian` / `bullet_reik` / `bullet_olia` / `bullet_graf` / `bullet_liana`

规格参考：约 30×17（横长条小图，生成时要求干净背景、主体居中）。

## 5. 敌人（5 张）

| 文件名（key） | 敌人类型 | 引用位置 |
|---|---|---|
| `enemy_grunt` | 普通小怪 | `EnemyBase.ts:83` |
| `enemy_shield` | 持盾兵 | `EnemyBase.ts:88` |
| `enemy_exploder` | 自爆怪 | `EnemyBase.ts:94` |
| `enemy_golem` | 魔像（重甲） | `EnemyBase.ts:100` |
| `enemy_boss` | Boss（各章共用） | `BossController.ts:51` |

规格参考：约 87×121（**当前分辨率偏低**，建议重生成 256 高以上）。

## 6. 特效 FX（5 张）

一次性播放的特效贴图，由 `ParticleManager` 驱动、`GameManager.ts:641` 渲染（三段式弹出/膨胀/淡出动画）。

| 文件名（key） | 用途 |
|---|---|
| `fx_explosion` | 爆炸（死亡爆破/大爆炸等） |
| `fx_hex_ring` | 海克斯激活光环 |
| `fx_poison` | 中毒 |
| `fx_heal` | 治疗 |
| `fx_cold_arrow` | 寒冰箭 |

规格参考：约 1100×1100，要求透明背景 PNG。

## 7. UI 图标（16 张）

两处使用：词条图标 `ui_icon_<aug.icon>`（`HUD.ts:229`）与技能图标 `ui_icon_<skillIcon>`（`HUD.ts:248`）。

| 文件名（key） | 语义 | 被哪些内容引用 |
|---|---|---|
| `ui_icon_pierce` | 穿透 | 词条：穿透炮弹/双重射击/弹幕之心/弹幕宇宙/弹幕宇宙；技能：kai-Q、liana-Q |
| `ui_icon_lightning` | 闪电 | 词条：连锁闪电/储能核心/超载海克斯/无限弹链/永恒机器；技能：vivian-E |
| `ui_icon_explosion` | 爆炸 | 词条：爆炸弹头/死亡爆破/引爆连锁/死亡域/大爆炸理论；技能：kai-R |
| `ui_icon_fire` | 火焰 | 词条：燃烧弹/狂暴化/血战觉醒；技能：reik-E |
| `ui_icon_poison` | 毒 | 词条：毒液涂层 |
| `ui_icon_crit` | 暴击 | 词条：精准射击/暴击强化/精英猎手/死亡笔记 |
| `ui_icon_speed` | 急速 | 词条：急速装填/高速装弹/相位跳跃/时间碎裂；技能：reik-Q、olia-E |
| `ui_icon_lifesteal` | 吸血 | 词条：吸血子弹 |
| `ui_icon_bounce` | 反弹 | 词条：反弹弹道；技能：kai-E |
| `ui_icon_heart` | 生命 | 词条：钢铁意志/急救套件/波次预备/时间悖论；技能：olia-Q |
| `ui_icon_shield` | 护盾 | 词条：厚甲/能量护盾/核心溢出；技能：reik-R |
| `ui_icon_combo` | 连击 | 词条：连击倍率 |
| `ui_icon_gold` | 金币 | 词条：金币磁铁/六角特权/六芒永恒 |
| `ui_icon_summon` | 召唤 | 词条：海克斯炮台/暗影分身/炮台军团；技能：vivian-Q/R |
| `ui_icon_ice` | 冰 | 词条：冻结磁场/绝对零度；技能：olia-R、liana-E/R |
| `ui_icon_chaos` | 混沌 | 词条：黑洞引擎/混沌协议/海克斯漩涡/宇宙法则/混沌神明/全力豪赌；技能：graf-Q/E/R |

规格参考：1254×1254 正方形。稀有度配色（`Constants.ts`）：蓝 `#4488ff`、紫 `#aa44ff`、橙 `#ff8800`、金 `#ffd700`——图标主体建议中性色，稀有度由 UI 边框渲染。
