# 战斗 HUD 对照与实机核验（2026-10-09）

主造型为 [参考 A](style-a/references/reference-a.png)，[参考 B](style-a/references/reference-b-lighting.png) 只用于明度、对比与可读性。附件 image-5 是旧画面问题截图。仓库 `style-a/` 中没有额外的正式 HUD 设计图。

| 区域 | A 图对照与实现 | 真实数据 / 兼容处理 |
|---|---|---|
| 左上头像 | 82×74 头肩窗口，左上/右下切角，黑色装甲外沿、青蓝边与内沿装饰；与读数底座相连 | `CharDef.id/name`，通过 `loadArtSprite` → `artPath` 加载现有 `char_<id>`，只裁切展示，不修改 PNG/UUID |
| 生命 / 护盾 | 220×18 青绿生命槽、100×8 蓝色护盾槽、单侧斜尾、独立护盾徽记；生命数字居槽中央 | 玩家 `hp/maxHp/shield/maxShield`；生命低于40%变黄、低于20%变红；无护盾时显示空槽与「—」 |
| 顶部章节 | 居中宽横梁、两侧短斜边与中央下沉段，独立标题 Label | 当前章节与实际波次；另保留小字 `X/15 · 难度`。测试房显示「战斗测试房」 |
| Boss | 独立名称置于槽上方，414×12 红色能量槽，双层切角装甲边；移除原来的十段格线 | 当前首领 `name/hp/maxHp`；槽中央保留小字号实际血量；无首领/血量归零时隐藏 |
| 金币 | 六边金色徽记、暗色窄背衬，标题和数字留独立间距 | `Economy.gold`，数值 Label 每帧更新并保留大数缩字能力 |
| 暂停 / 属性 | 右上圆整小方框与双竖杠；属性键移到下方 | 继续原暂停/属性回调；触控使用76×64热区，PC为38×32 |
| Q / E / R | 同排短切角装甲方框、细蓝灰边、暗色内盘、下方快捷键凸耳；进度圆环收进框内 | 各英雄原技能图标与技能状态；Q/E显示冷却秒数、R显示真实充能百分比；PC与触控共用 `drawCombatSkill` |
| 左下移动提示 | A 图的 W 在上、A/S/D 同排圆整小键框 | PC只显示键位提示，触屏仍使用原有动态摇杆；测试房上移避开工具条 |
| 普通 / 精英 / 小首领 | 常驻紧凑红槽，黑底与亮上沿；精英/小首领保留金色身份边，护盾另加细蓝槽 | 真实 `hp/maxHp`；24–76宽、3高，跟随动画可见像素顶边，隐身/飞空时隐藏；正式Boss使用顶部大槽 |
| 宽屏 / 测试房 | 头像贴左缘，金币/按钮/技能贴右缘，标题与Boss居中 | 1280→1600→1280动态重排；测试房技能上移，避开底部工具条；触控接管技能输入，PC展示节点隐藏 |

## 实机与验证

- `npm test`：550/550通过；`npm run typecheck`：通过。
- Cocos Creator 3.8.8 Web Desktop实际构建；构建输出放在工作区外，日志记录 `Finished`。
- 1280×720：普通波与Boss波、暂停按钮/继续游戏真实点击、属性打开/返回、低生命、护盾读数、Q/E冷却与R充能。
- 六章普通战斗与六章首领分别截图；八名现有英雄切换后头像与姓名均核验。
- 1600×720：运行时断言头像x=-786、金币x=594、R框x=732；恢复1280后再次核验。
- 960×432真实触屏浏览器上下文：触控Q出手并产生冷却、暂停/继续、Boss与测试房均核验，PC技能节点被正确隐藏。
- 普通/Boss截图使用游戏实际组件和真实实体；通过运行时设置波次、生成单位与无敌状态加速覆盖，未逐场通关15波。
- 当前 `via/mortis` 头像是项目已有纯色占位图，保留原内容；这两名英雄缺少若干战斗方向素材的既有警告仍存在，本次未扩展英雄美术范围。

## 文件与截图

代码：`HUD.ts`、`TouchControls.ts`、`UIStyle.ts`、`GameManager.ts`、`EntityVisual.ts`。相关旧尺寸/旧圆环的测试断言已同步为A图布局及隐藏态要求。

截图、构建与测试日志目录：

`C:/Users/Lenovo/.codex/visualizations/2026/10/09/01a11ead-b032-7821-9ac0-99abac596cbd/`

主要截图（`output/playwright/`）：`final-hud-comparison.png`、`final-normal-1280.png`、`final-boss-1280.png`、`final-chapters-contact.png`、`final-heroes-contact.png`、`final-wide-1600.png`、`final-touch-normal.png`、`final-touch-boss.png`、`final-touch-testroom.png`、`final-low-hp-cooldown.png`。六章首领原图为 `final-boss-chapter-1.png` 至 `final-boss-chapter-6.png`。

对照图只拼接参考原图和实机截图用于核验，不是运行时背景。全部控件文字、数值、遮罩与点击热区均为真实Label/Graphics/节点。英雄/敌人/Boss美术、场地障碍和其他页面没有在本次任务中改造。未执行commit/push，原有AGENTS.md改动保留。
