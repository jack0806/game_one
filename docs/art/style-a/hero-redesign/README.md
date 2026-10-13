# 八英雄 A 风格换装与动作资源

本批次覆盖当前 `CharacterDB` 的凯尔、薇薇安、雷克、奥莉亚、格雷夫、莉安娜、薇娅、莫提斯八人。身份母稿在 `masters/`，走跑与普攻关键姿势在 `action-masters/`，Q/E/R 关键姿势在 `skill-masters/`。`tools/bake_hero_style_a.py` 从母稿烘焙选人页立绘、战斗 token、前侧背三视图动作图集，以及薇薇安飞炮。`tools/review_hero_style_a.py` 生成 `roster-qa.png`、`views-qa.png`、`actions-qa.png` 和 `icons-qa.png` 目检图。

## 身份约束

| 英雄 | 设计锚点 |
| --- | --- |
| 凯尔 | 黑色乱发、蓝黑分层装甲、右臂青色炮管；保留动画比例并增加肩、胸、腿板细节。 |
| 薇薇安 | 蓝短发、护目镜、蓝色工程装甲、手持遥控器；Q 部署飞炮。 |
| 雷克 | 成年胡须、黑红重甲、双赤斧。 |
| 奥莉亚 | 白色长发、动画风面部、藏蓝时序战衣、青色时间刃与钟表核心。 |
| 格雷夫 | 紫黑石甲、胸前漩涡核心、巨拳。 |
| 莉安娜 | 白色兜帽、蓝白冰晶装甲、长管狙击枪。 |
| 薇娅 | **女性**；深蓝长发、黑金外衣、蓝色短刃、金色星纹。以旧 `char_via` 为身份参考，绝不改成短发男性。 |
| 莫提斯 | 白发、骨饰黑袍、绿晶法杖。 |

## 生成提示词与处理

所有母稿均用内置 ImageGen 生成透明 PNG，参考 `docs/art/style-a/references/reference-a.png` 的粗细分明墨线、卡通形体和装甲层次，并参考 `reference-b-lighting.png` 的亮度。身份母稿提示词统一要求：`three full-body views: front three-quarter, right side, back three-quarter; same character, same scale; compact detailed 2D cel-shaded cartoon; bold dark outline; broad animated face; no painterly skin, no photorealism; transparent background; no text`，逐人加入上表锚点。凯尔与奥莉亚经第二轮重画，分别补足装甲细节、简化过写实面部。薇娅以旧立绘、旧头像、旧 token 重新生成女性版本，并沿用同一身份制作所有动作。

基础动作母稿提示词为 `4 columns x 3 rows, rows front/side/back, columns left walk step, right walk step, attack windup, attack release; same costume and weapon; full-body distinct silhouettes`。技能母稿提示词为 `3 columns x 3 rows, rows front/side/back, columns Q/E/R release; distinct readable poses; preserve identity and weapon`，每人分别指定技能语义。薇薇安飞炮图标提示词要求三格均为同一蓝色三推进器底座与单门青色炮管，猎杀/支援海克斯仅在机身上叠加红色瞄准与绿色治疗标识。

烘焙脚本只做透明轮廓提取、画格切分、等比缩放、帧间位移与倒地旋转，沿用原有 PNG 文件名及 Cocos UUID。前侧背图集各含待机、走、跑、跳跃稿、普攻、受击、倒地、Q、E、R、近战攻击 11 行，每行 4 帧；游戏不注册英雄跳跃动作。英雄技能特效和既有独立技能图标保留已经完成的 A 风格版本，薇薇安 Q 与海克斯 13/14 图标改为同一飞炮设计。

## 复核

运行 `python tools/bake_hero_style_a.py`、`python tools/review_hero_style_a.py`、`python tools/generate_animation_bounds.py`，随后执行 `npm test` 与 `npm run typecheck`。图集由 `ActorAnimationDB.ts` 接入，枪口和施法事件与统一动画时钟对齐；`AnimationBoundsDB.ts` 从最终透明像素生成血条顶边。原始图片与烘焙方法保留在本目录，便于调整设计后整批重建。

2026-10-13 在 Cocos Creator 3.8.8 本地预览的战斗测试房间实测英雄切换与 Q 部署：`runtime-hero-picker.png` 包含全部八人，`runtime-via.png` 显示薇娅的女性形象与 HUD 头像，`runtime-vivian-q.png` 显示新版蓝色飞炮已在战场召出。
