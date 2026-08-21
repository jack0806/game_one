# Hexblast 专业化美术实施审计（2026-08-20）

本表把用户明确要求拆成可验证项。历史完整游玩证据见 `art-audit-2026-08-18.md`；本轮方案见 `visual-overhaul-plan-2026-08-20.md`。临时截图不作为仓库长期依赖，提交前统一清理。

## 当前完成度矩阵

| 要求 | 当前实现 | 权威证据 | 状态 |
|---|---|---|---|
| 所有关卡 | 第 1～4 章各 10 波、10/20/30/40 Boss 均完成过实机通关；自动化逐波重新建立 1～40 和无尽 41 | `art-audit-2026-08-18.md`；`wavemanager.test.js` | 历史实机与最新逐波回归均已覆盖 |
| 所有模式/状态 | normal→endless、内部 nightmare/chaos 路径，以及 menu/charSelect/playing/augSelect/shop/chapterClear/pause/gameover 均有历史实机覆盖；三模式第 41 波倍率重新回归 | 两份历史 audit；`wavemanager.test.js` | 全模式、全状态均已覆盖 |
| 怪物攻击清晰 | 接触攻击前摇环/目标线/斩击，Boss 技能脉冲/冲锋走廊，敌弹拖尾+亮核+白描边 | `EnemyBase.ts`、`BossController.ts`、`GameManager.ts`；四章 Boss 截图 | 已实现 |
| 首页点击一致、按钮专业化 | 背景旧按钮区由深色操作台覆盖；所有真实按钮使用斜切金属四态组件 | `core/UIStyle.ts`、`ui/ScreenManager.ts` | 已在最新 Cocos 预览确认可见轮廓、hover/pressed 与点击热区一致 |
| 角色移动不抖 | 世界坐标像素取整；移动时禁止缩放摆动；震屏使用确定性阻尼且封顶 | `GameManager.ts`、`EffectSystem.ts`、`effectsystem.test.js` | 已实现 |
| 背景淡化 | 四章分别乘色、全屏暗层、三层中央羽化；背景固定 `CUSTOM` 1280×720，避免原图尺寸过度裁切 | `GameManager._applyBackgroundTone()`；四图 16:9 自动检查 | 已实现 |
| 金币不是圆点 | 六边形厚边金币 Sprite，25～34px、翻面/悬浮、拾取粒子/飘字/声音 | `ui_gold_coin.png`、`GameManager.ts`、`Economy.ts` | 已实现并有像素门禁 |
| 英雄战斗形象 | 六名英雄统一为 512×512、3/4 俯视全身战斗 Sprite；清除残留白底 | `char_token_*.png`；`visualmanifest.test.js` | 已实现并有像素门禁 |
| 英雄白色底框 | 六张源图重新归一到 512×512；外沿至少 8px 全透明；导入开启 Alpha 边缘修复 | `char_token_*.png/.meta`；`visualmanifest.test.js` | 已实现并有逐像素门禁 |
| 子弹圆点化 | 六职业改为 256×128 定向弹体；玩家、分身、炮台统一用 Sprite，保持原色并按速度旋转 | `bullet_*.png`、`BulletController.ts`；`bulletcontroller.test.js` | 已实现并有尺寸/透明/渲染门禁 |
| E 技能名重复 | Q/E 名称只由 `PlayerController` 统一显示；数据层只产生效果；薇薇安唯一标准名为“网络连接” | `CharacterDB.ts`、`PlayerController.ts`；`characterfeedback.test.js` | 已实现并有重复路径门禁 |
| 敌人/Boss 常驻圆框 | 移除常驻圆形底盘和描边，仅保留低矮接触阴影；危险圈只在攻击前摇显示 | `GameManager.ts` | 已实现 |
| 薇薇安炮台圆点化 | 炮台增加六角钢底座、双炮管、能源舱和实时朝向；轨道炮台使用独立强调色 | `GameManager.ts` | 已实现 |
| 治疗及其他特效 | 治疗、爆炸、寒冰、海克斯、毒素重制；正常治疗三反馈，吸血降级为小绿字防遮挡 | `fx_*.png`、`PlayerController.heal()`；`visualmanifest.test.js` | 已实现；透明边缘、敌方前摇和高密度可读性已复验 |
| 跨页面反馈清理 | 清场时同步清空飘字，避免死亡前最后一条伤害数字冻结在主菜单/角色页 | `FloatingText.clear()`、`GameManager._clearRunEntities()`；`effectsystem.test.js` | 2026-08-21 实机发现并修复 |
| 音乐音效 | 7 首 BGM、17 个 SFX 接入页面、章节、Boss、商店和主要战斗事件；缓存、限流、防叠播 | `AudioManager.ts`、`audio.test.js`、`audio-integration-2026-08-20.md` | 接线完成；最终混音听感待预览 |
| 具体优化方案 | 风格、按钮、角色、VFX、背景、UI、音频、阶段和验收标准均已文档化 | `visual-overhaul-plan-2026-08-20.md` | 已完成 |

## 自动化门禁

- `artmanifest.test.js`：所有代码引用的 art key 均存在并经过 `ArtRemap`。
- `visualmanifest.test.js`：五张 VFX、六名英雄和六张定向弹体的尺寸与透明边缘；金币正式贴图；四章背景的 16:9 和最低分辨率。
- `characterfeedback.test.js`：六名英雄 Q/E 效果层不再额外绘制技能名；薇薇安 E 的唯一标准名为“网络连接”。
- `audio.test.js`：7 首 BGM、17 个 SFX 文件存在，headless 状态与静音行为正确。
- `wavemanager.test.js`：逐波建立主线 1～40、无尽第 41 波，并覆盖 nightmare/chaos 第 41 波倍率。
- 全量 Node 测试与 Cocos TypeScript 类型检查必须同时通过。

## 最新构建实机确认状态（2026-08-21）

合并同事提交后的最新 Cocos Creator 3.8.8 预览已通过内置浏览器直接访问 `http://localhost:7456/`，控制台没有 warning/error。此次复验不是替代历史全流程通关，而是针对本轮改动做最终视觉冒烟，并与历史全关卡证据、逐波自动化门禁交叉确认。

1. 首页：深色操作台完整覆盖背景烧录旧按钮；主按钮和三个禁用按钮使用统一斜切金属皮肤，hover/pressed 状态与可见轮廓一致，中文文本不换行。
2. 角色选择：六张卡片使用统一构图；已解锁角色技能、被动说明和同事新增中文文案完整保留；锁定卡片保持明确低亮层级。
3. 薇薇安实战：英雄透明边缘正常，无白底框；两座跟随炮台呈双炮管/能源核心机械轮廓，不再是蓝色圆圈；定向弹体、六边金币和背景压暗同时可读。
4. 敌方攻击：普通怪平时只有接触阴影，近身前摇才出现红色闭合危险圈；爆炸怪前摇使用橙色闭合圈，敌我信息能通过颜色和形状双重区分。
5. 强化与死亡：海克斯强化页、游戏结束页和返回主菜单链路均完成实机检查。复验中发现战斗伤害飘字会冻结到主菜单，已新增 `FloatingText.clear()` 并在统一清场路径调用，且补充自动化回归。
6. 资源与音频：角色、弹体、VFX、金币、四章背景通过像素门禁；BGM/SFX 路由、缓存、限流与静音行为通过 headless 测试，浏览器运行期间无资源加载告警。

最终发布判定仍以三类证据共同成立为准：历史 1～40 波/无尽实机记录、最新 Cocos 画面冒烟、以及 normal/nightmare/chaos 的逐波自动化回归。这样既覆盖完整内容，也避免只凭单次截图判断动态系统。
