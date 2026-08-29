# 现有美术资源清单（assets/resources/art/）

共 174 张 PNG，全部被代码引用且有对应文件（`tests/specs/artmanifest.test.js` 与 `visualmanifest.test.js` 自检通过）。

所有图片加载都走 `core/ArtRemap.ts` 的 `artPath(key)`（拼 `/spriteFrame` 后缀），替换图片只需**覆盖同名文件内容**。

> **2026-08-18 批量处理**：全部精灵类素材（角色/棋子/子弹/敌人/特效/UI 图标，共 44 张）已由
> `tools/cutout_art.py` 完成"黑底 → 透明通道"抠图（备份在 `temp/art_backup_before_cutout/`），
> 并统一裁剪缩放到合理尺寸（子弹 128、图标 256、棋子 256、敌人 512、boss 768、立绘 640、fx 512）。
> fx 五张另经 `tools/enhance_fx.py` / `tools/enhance_fx2.py` 发光化增强（爆炸加放射光刺、
> hex_ring 加能量核与辉光）。重跑管线：`python tools/cutout_art.py`（可用 `ART_DIR` 环境变量沙盒预览）。

---

## 1. 标题与章节背景（5 张）

| 文件名（key） | 实际内容 | 引用位置 | 规格参考 |
|---|---|---|---|
| `title_screen` | 标题屏环境与标题图（背景无烧录按钮；城市与海克斯纹理自然延续，真实按钮由 `UIStyle` 绘制） | `ScreenManager.ts` | 1672×941 |
| `bg_chapter1` | 第1章 废土街道（低频沥青中心；汽车、瓦砾、红色污染集中在边缘） | `WaveData.ts`（bgKey）+ `GameManager.ts` | 1664×936 |
| `bg_chapter2` | 第2章 钢铁工厂（大块钢板中心；齿轮、管线、熔炉橙光集中在边缘） | 同上 | 1664×936 |
| `bg_chapter3` | 第3章 海克斯实验室（青绿蜂巢电路+容器节点） | 同上 | 2560×1440 |
| `bg_chapter4` | 第4章 混沌位面（紫黑虚空+魔法符文） | 同上 | 2560×1440 |

> ✅ 2026-08-18：四张背景已按语义重新生成并经视觉逐一核实，**文件名与内容一致**。
> 旧版 `bg_chapter1↔bg_chapter4` 互换映射已从 `ArtRemap.ts` 删除（此前它会把第1章
> 显示成混沌位面、第4章显示成废土街道）。`ART_REMAP` 机制保留，将来再有错位素材在此登记。

> ✅ 2026-08-21：第1、2章再次重绘为“中心低频、边缘高信息”的顶视角战斗底图，
> 并完成6角色×4章节实机回归。新图以较小文件体积提供高于设计画布的16:9分辨率，
> 不再用全屏裂纹/细格栅与弹道、金币、护盾争夺视觉焦点。

章节主题（生成提示词参考，出自 `WaveData.ts`）：

| 章 | 名称 | 描述 |
|---|---|---|
| 1 | 废土街道 | 废弃的城市废墟，腐肉横行 |
| 2 | 钢铁工厂 | 轰鸣的熔炉，钢铁巨兽苏醒 |
| 3 | 海克斯实验室 | 高能辐射区域，异变体涌现 |
| 4 | 混沌位面 | 现实崩塌，终焉之门大开 |

## 2. 角色立绘（6 张）

选人界面卡片立绘（`ScreenManager.ts:130`，按 `char_<id>` 加载，**160×160 正方形 CUSTOM 拉伸**——生成需 1:1 半身像构图，见 `docs/prompts/image-prompts.md` 第五节）。

| 文件名（key） | 角色 | 主题色（来自 CharacterDB，生成时保持色调一致） |
|---|---|---|
| `char_kai` | 炮击手·凯尔 | `#00ffcc` 青 |
| `char_vivian` | 工程师·薇薇安 | `#00aaff` 蓝 |
| `char_reik` | 狂战士·雷克 | `#ff4444` 红 |
| `char_olia` | 时空行者·奥莉亚 | `#aaddff` 浅蓝 |
| `char_graf` | 混沌傀儡·格雷夫（未解锁角色） | `#cc44ff` 紫 |
| `char_liana` | 冰霜狙击手·利亚娜（未解锁角色） | `#00ccff` 冰蓝 |

规格参考：抠图后约 640×570（已带透明通道，主体裁剪到包围盒）。生成替换时仍建议 1:1 构图半身像，处理后由管线裁剪。

## 3. 英雄战斗 Sprite char_token（36 张，6 名英雄 × 3 个方向 × 2 个步态帧）

**战场上的玩家本体**（`PlayerController.ts`），82×82 正方形 CUSTOM 显示、不染色。每位英雄都有前、右侧、背三套静止/动作帧；右侧帧仅在朝左时镜像，前后帧不镜像，避免武器换手。视觉朝向和方向技能统一使用最后一次移动输入，左右反向时立即翻面，再完成短促轮廓收窄恢复；过对角线时带滞回，避免身体与移动方向相反或频繁抖动。凯尔/薇薇安/利亚娜使用灵活双足，雷克/格雷夫使用重步，奥莉亚使用悬浮节奏。动作帧按实际位移交替，停住立即回对应方向的静止帧。

`char_token_kai` / `char_token_vivian` / `char_token_reik` / `char_token_olia` / `char_token_graf` / `char_token_liana`

`char_token_kai_move` / `char_token_vivian_move` / `char_token_reik_move` / `char_token_olia_move` / `char_token_graf_move` / `char_token_liana_move`

各基础 key 另有 `_side` / `_side_move` / `_back` / `_back_move` 四张方向帧。

## 4. 角色子弹（6 张）

玩家、分身和薇薇安炮台的子弹贴图，按 `bullet_<id>` 加载（`BulletController.spawn`）。敌方子弹由危险判定轮廓和 `fx_enemy_*` 材质图叠加：轮廓只负责碰撞边界、阵营色和方向判读，技能本体不再是圆、矩形或长线。六张玩家素材统一为 256×128 真透明横向弹体，枪口朝右：运行时保持 2:1 以上显示比例、使用素材原色并随速度方向旋转。六名角色分别是轨道枪栓、微型导弹、冲击斧刃、时空针、混沌长矛与冰晶狙击弹，不再使用各向同性圆球。

`bullet_kai` / `bullet_vivian` / `bullet_reik` / `bullet_olia` / `bullet_graf` / `bullet_liana`

## 5. 敌人（82 张：54 张方向步态帧 + 28 张独立俯视资源）

正方形 CUSTOM 显示，显示直径=碰撞半径×2×视觉缩放（普通怪约 44–62px，Boss 180px）。grunt、shield、exploder、golem、旧通用 boss 与四章正式 Boss 共 9 个美术族保留三方向双帧矩阵。精英、射手、暗影猎手、旧六类小 Boss、测试房机械/深渊 Boss 已全部换成独立原色俯视资源；连锁猎犬、棱镜蜗牛、三相祭司、磁轨屠夫、群钟吞噬者、胡蜂之巢、熔炉之城、多相集合等原有专属图继续使用。运行时不再给专属资源强行套旧白模线条附件。

移动表现由 `core/Locomotion.ts` 按实际位移驱动静止帧/`_move` 帧切换：grunt/精英/毒射手蹒跚前冲，shield 盾墙重步，exploder 六足爬行，golem 石像重踏，miniboss 四足斜跨；第1章 Boss 肉山重踏，第2章机械活塞步，第3章晶体尾流推进，第4章触手牵引。每个美术族另有 `_side` / `_side_move` / `_back` / `_back_move`。普通怪正对英雄，射手后撤时仍盯住英雄，攻击前摇朝锁定点；Boss 普通接近在接触距离稳定停步，冲锋时沿真实速度转向。Boss 使用专用低频大轮廓步态，避免冲锋时高频硬切造成闪烁。步态和朝向不修改碰撞半径或基础移动速度，静止时不会原地踏步。

| 文件名（key） | 敌人类型 | 引用位置 |
|---|---|---|
| `enemy_grunt` | 腐肉行者（杂兵主力） | `EnemyBase.ts` |
| `enemy_shield` | 护盾兵 | `EnemyBase.ts:88` |
| `enemy_exploder` | 自爆怪 | `EnemyBase.ts:94` |
| `enemy_golem` | 石像鬼（重甲坦克） | `EnemyBase.ts:100` |
| `enemy_boss` | miniboss 通用浅色素体（染紫复用） | `EnemyBase.ts` |
| `enemy_boss_ch1` | 第1章废土领主·腐肉（骨甲巨爪/毒囊） | `BossController._setupForChapter` |
| `enemy_boss_ch2` | 第2章钢铁之王·熔炉（熔炉重装） | 同上 |
| `enemy_boss_ch3` | 第3章海克斯异变体·无限核（悬浮晶核） | 同上 |
| `enemy_boss_ch4` | 第4章混沌深渊·终焉之门（深渊门环） | 同上 |
| `enemy_boss_mech` / `enemy_boss_abyss` | 测试房机械巨像 / 深渊首领 | `BossDB.ts` |
| `enemy_squid` / `enemy_turtle` / `enemy_shrimp` / `enemy_jelly` | 旧资料小 Boss 四种生物体 | `BossDB.ts`、`EnemyBase.ts` |
| `enemy_drone_attack` / `enemy_drone_support` | 攻击 / 支援无人机 | 同上 |
| `enemy_elite` / `enemy_archer` / `enemy_shadow_hunter` | 精英腐肉、针刺射手、暗影猎手 | `EnemyBase.ts` |
| 其余 `enemy_*` 独立资源 | 第五章文档敌人、资料 Boss 与特殊杂兵 | `EnemyBase.ts`、`BossDB.ts` |

规格参考：抠图后约 512×500（白/银素体，透明背景）。

## 6. 拾取物（1 张）

| 文件名（key） | 用途 |
|---|---|
| `ui_gold_coin` | 透明六边形厚边金币；战斗中以 25–34px 翻面/悬浮显示 |

## 7. 特效 FX（20 张）

一次性播放的特效贴图，由 `ParticleManager` 驱动、`GameManager.ts` 渲染（三段式弹出/膨胀/淡出动画）。
**2026-08-20 已全部重新生成**为俯视战斗一次性 VFX：512×512 RGBA、四角 Alpha=0，治疗/毒素分色，爆炸/寒冰强调方向冲击，六角环使用双层错位能量结构。`tests/specs/visualmanifest.test.js` 会阻止黑底或尺寸错误资源重新入库。

| 文件名（key） | 用途 |
|---|---|
| `fx_explosion` | 爆炸（死亡爆破/大爆炸等） |
| `fx_hex_ring` | 海克斯激活光环 |
| `fx_poison` | 中毒 |
| `fx_heal` | 治疗 |
| `fx_cold_arrow` | 寒冰箭 |
| `fx_reik_cleave` / `fx_reik_death_will` / `fx_reik_warcry` | 雷克劈砍、死战、战吼 |
| `fx_enemy_needle` | 针刺、剑虾尖刺与高速实体弹 |
| `fx_enemy_frost` | 冰流、水刺的冰蓝晶体材质 |
| `fx_enemy_toxic` | 毒镖、毒球、酸囊与毒池材质 |
| `fx_enemy_water_bomb` | 深水炸弹与海洋能量弹 |
| `fx_enemy_saw` | 齿轮、锯刃与机械危险物 |
| `fx_enemy_void_blade` | 混沌刃、虚空弹与深渊攻击 |
| `fx_enemy_bell_wave` | 声波、钟罩吸收与反震波 |
| `fx_enemy_ember_brand` | 熔火印记、自爆倒计时与火池 |
| `fx_enemy_claw_slash` | 近战爪击、冲撞命中与重劈 |
| `fx_enemy_web` | 蛛网、减速区与束缚材质 |
| `fx_enemy_arc` | 电弧、追踪电荷与能量束 |
| `fx_enemy_rail` | 磁轨弹、激光束与高能直线攻击 |

> ✅ 2026-08-29 敌方视觉专项：新增 11 张独立敌人本体和 12 张敌方技能材质。
> 实机逐一回归 16 种小兵、11 种小 Boss、9 种首领及其全部攻击阶段；危险判定几何仍保留低透明度边界，
> 但所有关键弹体、近战、陷阱、护盾和反震都由材质图表达。160 枚同屏压力场景下仍能按轮廓与色相区分技能。

## 8. 薇薇安战场炮台（2 张）

炮台拆成独立透明组件，代码以同一世界坐标叠放：固定底座不旋转、不浮动，只有炮筒围绕机械枢轴朝目标旋转。跟随炮台与海克斯科技炮台使用正常尺寸；6座轨道炮台使用较小尺寸与浅青染色区分层级。

| 文件名（key） | 用途 |
|---|---|
| `turret_base_vivian` | 90°正俯视六角机械固定底座 |
| `turret_barrel_vivian` | 横向双炮筒，锚点设在源图宽度36%的枢轴位置 |

## 9. UI 图标（16 张）

两处复用（`HUD.ts`）：词条槽 **30×30 叠在程序绘制的稀有度色块+边框上**（`HUD.ts:229`）；技能环 **28×28 嵌在 CD 进度圆环内、未就绪时染灰**（`HUD.ts:248`）。因此图标必须**无底板无徽章**、纯发光符号——生成模板见 `docs/prompts/image-prompts.md` 第十节。

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
| `ui_icon_summon` | 召唤 | 透明底青蓝机械炮台纯符号，仅用于UI；词条：海克斯炮台/暗影分身/炮台军团；技能：vivian-Q/R |
| `ui_icon_ice` | 冰 | 词条：冻结磁场/绝对零度；技能：olia-R、liana-E/R |
| `ui_icon_chaos` | 混沌 | 词条：黑洞引擎/混沌协议/海克斯漩涡/宇宙法则/混沌神明/全力豪赌；技能：graf-Q/E/R |

规格参考：1254×1254 正方形。稀有度配色（`Constants.ts`）：蓝 `#4488ff`、紫 `#aa44ff`、橙 `#ff8800`、金 `#ffd700`——稀有度由程序画的槽位边框/色块表达，图标本身按各符号语义上色即可（亮度中高，保证染灰后仍可见）。
