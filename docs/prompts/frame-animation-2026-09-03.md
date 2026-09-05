# 本批逐帧素材提示词与来源

生成方式：内置imagegen，无Meowa账号/API。所有角色身份以项目同名原始图为参考。下述模板加每批覆写组成生产提示词；没有用整图旋转/缩放替代动作。

## 共用32帧模板

Production hand-painted 2D game animation atlas of the EXACT referenced character. Preserve identity, anatomy, palette and equipment. Four columns by eight rows, thirty-two full-body poses, portrait 1024x2048 canvas. One complete figure per equal square cell, same body scale and consistent ground baseline, generous empty margins, no detached parts. All poses use the specified front/side/back view. Body and weapon ONLY: no muzzle flashes, smoke, particles, projectiles, floor, shadows, text, grid lines or borders. Request true RGBA transparency; if the output bakes a checkerboard, reject it and regenerate with flat solid #FF00FF chroma background.

Rows from top, four sequential poses each: idle ready/inhale/exhale/ready; walk left contact/passing/right contact/opposite passing; run left flight/left support/right flight/right support; jump crouch/takeoff/tucked airborne/landing; attack aim or windup/fire recoil or claw strike/follow-through/recover; hit flinch/stagger/brace/recover; defeated buckle/one knee/fall/fully prone; skill charge/brace/powerful release/recover. Articulate actual shoulders, elbows, hips, knees and ankles. Do not rotate an unchanged figure. Lead legs must exchange in walk/run.

## 凯尔

- 参考：`char_token_kai`、`char_token_kai_side`、`char_token_kai_back`。
- 身份覆写：black-haired male railgun hero, black tactical armor, cyan lights, twin cyan railgun. Side view faces right; front view faces viewer with foreshortened gun; back view faces away with gun toward upper right.
- 正面来源：`exec-b0d4b48f-4f9e-45df-9d80-a347aa62ec78.png`。
- 背面来源：`exec-a70ad7ce-8116-4513-8cae-67ee6ca598d8.png`。
- 侧面新版来源：`exec-1417cde0-d75e-4b77-890c-400d4be47004.png`，替代带跨格枪焰的`exec-bed7f83b-d99c-4f41-a80c-afcb2df097d2.png`。

## 凯尔八帧侧面步行

Eight-frame walk cycle of the exact referenced male railgun hero. Four columns by two rows, landscape1536x768, consistent side view facing right. Left leg nearest camera, right leg behind. Frame1 left foot forward contact, right leg back; frame2 left knee settles, right heel raises; frame3 right knee passes planted left leg; frame4 right shin extends forward, left heel rises; frame5 right foot forward contact, left leg back; frame6 right knee settles, left heel raises; frame7 left knee passes planted right leg; frame8 left shin extends forward, right heel rises, ready to join frame1. Lead leg MUST swap in second half. Keep head, torso, railgun orientation nearly constant, only natural weight shift. Identical body scale, common pelvis horizontal center and foot baseline, entire gun and boots within central78% of each cell. No effects, labels, floor, shadows or duplicate figures.

来源：`exec-0bb4fe33-61a7-4b94-b29d-36c237c32889.png`。此次返回原生RGBA，直接保留透明通道。

## 普通红色小怪

参考`enemy_grunt.png`。身份覆写：red sinewy hunchback creature, glowing round shoulder pustules, bald snarling head, long clawed arms and two legs. Front view all poses. Attack raises right claw, sweeps across front, follows through, recovers. Special draws arms back, roars/rears up, slams both claws forward, recovers. No detached fingers, extra creatures or gore spray.

首稿`exec-2b687551-6259-48ef-bb47-c5b5aa264bd7.png`为RGB烧录棋盘格，拒绝入库。编辑提示词：Replace the entire baked checkerboard with perfectly uniform flat pure magenta #FF00FF. Preserve all32 poses and the4x8 composition. Remove white smoke in top-row cells3/4. Bend elbows in row4cell3 so the extended claws stay inside its cell; bend the crossing arm inward in row5cell1. No new limbs, faces, labels, borders, shadows or effects. Other details unchanged.

修正来源`exec-625ee9a8-b7ae-4b99-b9f7-133f70118ada.png`。

侧面候选`exec-d9a3cb4e-816e-4f12-a56a-a05e32039a12.png`尚未入库。提示词按32帧共用模板，参考修正后的正面图作为身份/风格、原`enemy_grunt_side.png`仅作为侧面解剖参考，明确忽略参考图中的残肢。要求所有32帧朝右、两臂两腿、同一身体质量、中央75%范围、纯洋红背景。结果部分伸爪/倒下帧仍跨规则单元格，需要修正。

所有来源均保存在`C:/Users/Lenovo/.codex/generated_images/01a06637-2a27-7723-841c-8f8312fa94fe/`；项目实际读取的是`assets/resources/art/anim_*.png`，不依赖外部生成目录。

## 后续入库来源（覆盖上方旧候选状态）

- 小怪侧面`exec-d9a3cb4e-816e-4f12-a56a-a05e32039a12.png`现已通过连通分离行入库。背面`exec-e33ac117-51f8-4b5b-92a0-59cd7d7c809c.png`。
- 利亚娜正面`exec-2f9ca517-4a43-4893-82e8-1606038ba30e.png`、侧面`exec-826eaa51-3fbe-4cf4-a8e9-4ae23c00e6bf.png`、背面`exec-b3c68483-c11b-40f9-a4c9-f0a9f84a0704.png`。共用32帧模板，保留白发、冰蓝披风、黑色轻甲、长冰晶狙击枪，要求完整枪管、两臂两腿、无脱落残枪，正面/朝右侧面/背面分别生成。
- 雷克正面首稿`exec-f6f2cb61-5679-4e9b-b468-e1f7248bc52d.png`有烧录网格和受击帧武器缺失；修正稿`exec-b48255f7-231e-466a-b7f3-fac9060be1ce.png`入库。
- 雷克侧面首稿`exec-1ed295ef-d1a6-4b76-bcd9-b4c237a407b0.png`偏正面，未使用。严格侧面稿`exec-b2036995-a1d6-4a42-ae9a-b4912e241c41.png`为主要来源；`exec-11e99924-952e-4395-8537-841aa22505cd.png`仅取第8行第2格恢复双斧，其他格不采用。
- 雷克背面`exec-f8a33ca4-a0de-4192-8d08-83688a0d8cee.png`为主要来源；`exec-29c5644a-d67a-4461-80d3-285b74628c47.png`只取第4行第1/4格蹲伏、第5行第2格下斩。替换格在layout的frameOverrides中登记，零起始索引。
- 雷克身份覆写：muscular black-haired bearded dual-axe berserker, charcoal heavy armor with glowing red cracks, tattered black fur cape, dark red loin cloth, TWO short red axes always held in both hands. Attack: lift axes / powerful downward strike / low crossed follow-through / recover. Skill: brace / chest expands / roar with axes held high / recover. Side must face right in strict profile; back shows cloak and back of head. All body parts and axes inside central72% of cell, uniform magenta background without dividers.
- 特效首稿`exec-46513848-2695-4a10-b626-4828dd74b984.png`因噪点/格子拥挤未入库。武器特效`exec-5137344c-905c-451e-9c6c-9ad048e12aa2.png`与元素特效`exec-11a4f620-78ef-4289-95db-9d644a1b7564.png`各4×4格16帧，直接保留原生RGBA。
- 特效提示词原则：clean hand-painted VFX, exact4x4 equal grid, true transparent alpha, central60–65% occupancy with wide empty margins, no checkerboard/grid/text/noisy stipple/smoke carpet. Each row four DIFFERENT drawn shapes: onset, peak, breakup, disappearance. Weapon rows cyan plasma / orange cannon / explosion / ice sniper; element rows ice impact / three claw cuts / emerald healing / frost field ellipse. Fixed emission point for muzzle, centered origin for radial effects. Pivot after generation calibrated to actual artwork rather than assumed prompt coordinates.


## 薇薇安：逐动作小批次修正与八帧步态

身份：blue-haired female engineer, cyan goggles, blue-white-black armor, flat cyan-screen remote in left hand, TWO permanent twin-barrel drone guns on articulated backpack arms. No hand-held rifle. Both weapon pods must stay present during hit/death. Side gun barrels must point RIGHT beyond nose, never backwards. Fixed camera, uniform magenta #ff00ff, no embedded particles/grid/shadows.

已使用来源：

| 项目图集 | 生成来源 | 取用范围 |
| --- | --- | --- |
| anim_vivian_front | exec-892d9cfe-5a97-405b-a65f-7038892e743f.png | 待机/走跑/跳/攻击；技能只28/30/31格 |
| anim_vivian_front_hit_death | exec-67f3aad9-8920-46e3-b274-f80fbe6140a4.png | 全8格；独立重绘保留双炮 |
| anim_vivian_back | exec-6651ba18-a020-4d1c-9399-bd3e6eb3bffd.png | 待机/走跑/跳/受击/技能 |
| anim_vivian_back_attack_death | exec-4a7cacce-9d23-4e83-b2d3-94885d3e2912.png | 全8格；攻击无烧录枪焰、倒下双炮 |
| anim_vivian_side | exec-4983f340-5caa-486d-8f7e-efc4642f79b1.png | 主稿；攻击/受击8格由exec-f3233c17-b9c4-4579-a47a-74e23f0800f9.png替换 |
| anim_vivian_side_walk8 | exec-7270ce49-2ce1-4a20-baf3-a3ff945ae5f2.png | 全8格，人工骨盆横坐标 |
| anim_vivian_side_run8 | exec-fededd80-303e-4613-b3a3-97e8570028c8.png | 全8格，人工骨盆横坐标 |

侧面规范参考exec-9a097b7c-3e22-496b-9fa6-4995d41a5e9e.png仅用于生成参考，不入库（蓝背景、长身比例）。其关键约束是两门炮在肩上不同高度，长双炮管向右超出面部。最终32帧要求短身比例、全身中央80%、8行动作顺序与共用模板一致。

未采用或仅作参考：最初侧面exec-8512e033-36a3-4bc1-b119-2543155fbdf4.png、编辑稿exec-18d55c3a-33aa-420c-9dfd-a9cce5965b1b.png均炮管朝后；初始背面exec-bdc7638a-7bcd-4f5c-a2d7-91922b7511b1.png动作行错误且装备消失；正面修正exec-88f25302-790d-4bf0-8c13-6c97dad03601.png仍漏双炮；奔跑exec-53db0d6d-c602-4a6b-9a4f-4065b42f4ba6.png漏第二门炮，后续修正保留原腿姿补炮。f3233c17修正稿的技能抬手被误改，因此没有整张替换。

八帧步行提示词：4columns x2rows landscape; left contact / left compression / right passing / right reach / right contact / right compression / left passing / left reach. Grounded at common90% baseline, no flight. Run对应contact / compression / knee drive / flight，第二半周期交换左右腿。每格固定镜头、朝右、完整双炮与遥控器，细致描画肘髋膝踝，保留真实摆动和腾空。固定原图共同缩放，切片后按人工骨盆挂点消除横向排版漂移。8帧不代表循环已经通过质量验收。

## 格雷夫与奥莉亚及新特效来源

生成原稿目录仍为C:/Users/Lenovo/.codex/generated_images/01a06637-2a27-7723-841c-8f8312fa94fe/。下表为实际采用稿，布局和像素检查见animation-qa中的对应JSON；都尚未完成最终视觉验收。

| 图集 | 源图 | 说明 |
| --- | --- | --- |
| anim_graf_front | exec-668cd3b3-df70-4b8c-8aae-600c70d91d88.png | 绿色底，32格 |
| anim_graf_side | exec-e9233960-2fa6-4f80-9cd3-e22f1668a8ce.png | 绿色底，32格 |
| anim_graf_back | exec-c4e42427-b93b-4b43-90f5-84997a6143ce.png | 972×1619，人工行列标定 |
| anim_olia_front | exec-1182be74-e433-4426-9801-46912d3c83ef.png | 仅前7行；攻击另用补图 |
| anim_olia_side | exec-6e39916f-fcdf-4849-b703-9a6efb2fcd06.png | 仅前7行，原第8行不合格 |
| anim_olia_back | exec-09a1d6c7-2d6f-4fb9-9519-17b4fd4e9f1c.png | 仅前7行；攻击另用补图 |
| anim_olia_front_combat | exec-7a10e55b-62de-4388-bd38-0f71481eed2b.png | 远程4格+近战4格 |
| anim_olia_side_melee_skill | exec-8cb92811-87ba-4473-ab83-7567a7b7eb0b.png | 近战4格+举表4格；cellInset10 |
| anim_olia_front_back_skill | exec-7cd35d28-1f60-4969-a590-a770c442568e.png | 正面4格+背面4格举表 |
| anim_olia_back_combat | exec-31224cc6-bbff-4195-a520-f3d22c5f7d8a.png | 远程4格；下行5格选0/2/3/4，320px单格 |
| anim_fx_chrono_chaos | exec-cf761897-6603-4192-9ec4-cb9654446b2e.png | 4×4绿色底，仍有灰晕待修正 |

格雷夫身份约束：purple-black stone golem, glowing violet fractures and chest spiral core, empty open casting hands, no gun. 绿色#00ff00色键以保留紫色主体。背面废弃稿exec-c43513ce-ee75-4a27-b64f-f3b6beba3637.png有噪边及手部越界。

奥莉亚身份约束：silver-haired blue-skinned adult chronomancer, long navy coat and silver armor, exactly ONE pistol in right hand, ONE round pocket watch in left. Side always faces right. Ranged row aim/recoil/recover/ready; melee row raise energy bayonet/strike/follow-through/recover; skill row ready/raise left wrist/watch overhead/recover. No extra pistols, no floating watches, no embedded muzzle flashes. 先小批次生成4×2补图，再按动作覆盖，避免32格编辑误改其他动作。侧面参考单姿势exec-461d0992-7ff7-4cfe-b7b0-f9c289e1855d.png不入库；侧面废稿exec-b67654f8-971f-427e-93be-d0701b1a9f63.png出现双枪，正面战斗初稿exec-166a7e3c-fa0d-4beb-bc64-9b3fe6b3767e.png刀刃朝向错误。

新特效要求：flat green #00ff00, exact4×4, central60% artwork and wide20% margins, no stipple/noise/smoke carpet/grid/text. Row0 violet palm spiral/compact right-facing flash/two wisps/glints; row1 cyan time pistol star/flash/fragments/glints; row2 cyan crescent slash/swept crescent/three splits/fade; row3 violet core/ring with four teeth/broken ring/four fading sparks. 固定发射点最终按生成图校准，不假定提示词坐标已被遵守。初稿exec-f431371d-48e0-41f9-9a61-8d90b6708d44.png因蓝紫噪边和过密细节未采用；绿色底修正稿去色键后仍有灰色晕边，需继续修正。

## 毒射手未入库候选

- 正面32格exec-96c4a030-99c9-48f2-9a84-3aecaa1ab2f1.png：换腿不明确，走/跑多格同脚在前；攻击、死亡等可评估，但不能整张当完整动作通过。
- 正面16格走跑exec-fcfaf995-1ba0-4789-bf38-e902a40c52b8.png：步行上下两行换腿可辨，但中间支撑/经过姿势不足；奔跑后半仍同腿及朝向不一致，不入库。
- 侧面32格exec-de318e20-6816-4785-bfe5-8694dedefeff.png：最右侧待机枪尖被画布截断，部分枪尖跨规则列界。不能等分裁掉或伪造补尖，须重绘/明确取合格格。

身份使用enemy_archer.png：olive ragged hood, green respirator goggles, rusty bronze armor, one green chemical needle rifle in two hands, one green canister backpack and spare dart bundle. 后续把支撑/经过/换腿拆成更小批次明确姿势，再与已确认的接触帧组合；不镜像整个人物来伪造左右腿交换。

已取用的毒射手射击小批次：exec-93f1454c-b52f-458d-a569-2b1ad08296d6.png，4×4原稿只取前三行：front向屏幕下方透视缩短枪管、side枪管朝右、back枪管朝上，每行aim/recoil/recover/ready四姿。第4行步态仍未验收，不进入图集。目标anim_archer_combat，见archer-combat-layout.json和archer-combat-import.json；320px单格，不裁枪尖，source rowCuts=[0,350,615,940]、共同scale=.72、targetBaseline=256。挂点按入库图中的可见枪尖校准。

毒镖/护盾特效：初稿exec-e8f6943e-bbe0-4708-b8c9-ce8c87e18c1b.png为RGB烧录棋盘格，拒绝当透明图。修正稿exec-78f40ebb-eb20-46aa-9089-4db5aa04b853.png采用纯洋红底，入库anim_fx_toxic_shield并显式使用--soft-matte。四行依次lime toxic muzzle、lime needle impact、small green poison puff、cyan shield break；每行动画为onset/peak/breakup/fade。保持清晰彩色边缘，不使用背景纹理，空心雾团内部也必须是色键底。fx-chrono-chaos曾试用soft-matte后出现色块，已恢复原绿色解码模式，不能复用这次失败的处理结果。

## 毒射手补帧与护盾兵（9月4日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_archer_side_walk8 | exec-690ab83f-aac6-4052-a24f-b01541d5b96e.png | 侧面8帧步行；固定脚底与人工骨盆横坐标 |
| anim_archer_side_run8 | exec-001fabd6-4b8b-4346-80a7-565e6713599d.png | 侧面8帧奔跑；腾空和抬膝可辨，循环仍待游戏内联调 |
| anim_archer_front_walk | exec-906be6e7-914d-45dd-854e-17ed557a5803.png | 只取第一行4个换腿关键姿势；后4格腿序未采用 |
| anim_archer_front_body | exec-96c4a030-99c9-48f2-9a84-3aecaa1ab2f1.png | 仅登记待机、跳跃、受击、倒下、装填；旧走跑攻击行不采用 |
| anim_archer_side_body | exec-38a6009f-f660-450e-b983-136131f055de.png | 侧面待机、跳跃、受击、倒下、装填共20帧 |
| anim_archer_back_body | exec-bf8c5dad-b43d-46eb-a673-f71cccdcc448.png | 背面待机、跳跃、受击、倒下、装填共20帧 |
| anim_archer_back_motion | exec-e54b1015-2b12-4697-82ab-2f6b64dec302.png | 背面8帧走+8帧跑；已入制作稿，部分过渡仍偏重复 |
| anim_archer_front_run8 | exec-0e0f56d5-c38a-4e69-b7a2-0cccde2a5ff9.png | 正面8帧跑；接触、压缩、腾空、伸腿顺序制作稿 |
| anim_shield_front | exec-7ca506dd-1c93-4ad4-876a-c90e7cd776c2.png | 护盾兵正面32帧；八类动作，倒下横向轮廓用384画布完整容纳 |
| anim_shield_side | exec-dc55985c-f31f-49d8-8566-ec70f2e69efd.png | 护盾兵侧面32帧；此稿覆盖首版exec-11fde4cc-4979-4502-946d-ce1028977f3c.png |
| anim_shield_side_attack | exec-3535121f-1471-4862-bb29-db144dc8c667.png | 侧面四帧独立盾击，替换原攻击行并清除游离碎片 |
| anim_shield_back | exec-830df90d-2f92-4188-8a14-d4d7d025f9bd.png | 护盾兵背面32帧；盾牌固定在屏幕左侧 |

毒射手的三方向原画裁切参考为`archer-front-reference.png`、`archer-side-reference.png`、`archer-back-reference.png`。`walk-pose-reference-front.svg/png`与`walk-pose-reference-side.svg/png`是本地数学关节示意图，只用于约束支撑脚、经过姿势和换腿顺序，不是游戏素材。

废弃的毒射手步态候选：exec-3f01f81e-d521-4ced-8e5d-7da26b80eff0.png含腿部品红破损；exec-35608b5a-bf82-4c92-8ef6-781c1fed51f1.png只修掉破损但步态仍不成立；exec-6ccf5d59-93e7-41ab-af79-11ea98814976.png错误落地脚仍存在。这些文件均未入库。护盾兵侧面整图编辑稿仍残留脚下碎片，因此最终攻击动作改用独立四帧小图集。

## 爆炸怪（9月4日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_exploder_front | exec-2de713d0-6fb8-4394-b924-e54ce7abc337.png | 模型实际输出7行28帧；待机、走、跑、跳、扑压、爆后塌落、蓄热 |
| anim_exploder_front_hit | exec-7412e20c-1ca2-4a5b-b1bc-4439552ae9de.png | 正面四帧受击挤压与回弹 |
| anim_exploder_side | exec-875c366f-27b6-4856-afc7-99fa1241f14b.png | 侧面7行28帧 |
| anim_exploder_side_hit | exec-c3a2cb42-9940-4bd9-adbd-6e1833b50f1c.png | 侧面四帧受击；显示倍率单独校准为1.65 |
| anim_exploder_back | exec-4d3749a2-c4ac-4527-bdff-abc2ff1bdcf0.png | 背面7行28帧 |
| anim_exploder_back_hit | exec-92506147-7a4c-44a4-a861-6f616020858d.png | 背面四帧受击 |

爆炸怪身份约束：huge round molten-orange explosive sac, yellow fissures, dark jagged rock belt, translucent bubbles, four squat clawed legs; no face, arm or weapon. 主图明确采用4×7，把塌落定义为爆炸后的泄气残骸，把蓄热定义为自爆警告。首张正面提示要求4×8但模型只生成7行，不能把塌落行误登记为受击，因此三方向受击均另做4×1小图集。

## 石像鬼（9月4日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_golem_front | exec-ed41e797-074d-4831-bb94-07c69385128c.png | 正面主稿实际7行，依次为待机、重步、冲锋跑、重跳、重拳砸地、受击、符文蓄能；28帧全部采用 |
| anim_golem_front_defeated | exec-3090b163-d365-482f-b0c9-b8f7d2ae64fc.png | 正面专用4帧碎裂倒下，替代主稿缺失的死亡行 |
| anim_golem_side | exec-1b3a9f22-b753-4d72-a605-78d8cbc7a734.png | 严格右侧面4×8，32帧全部采用；胸口只露符文侧缘 |
| anim_golem_back | exec-d46f4326-37c2-4b2a-abc4-56adea146a14.png | 严格背面4×8，32帧全部采用；背部无符文，技能只让石缝透光 |

石像鬼身份约束：hulking squat gray stone body, enormous blocky forearms and fists, short thick legs, moss patches, cyan eyes, front oval cyan chest rune; no weapon or clothing。动作按重型近战设计，不套用双足轻步态。主图按行保持共同基线，攻击第三格才是拳面接地。由于拳头、能量弧和碎石会跨越等宽源格，四份布局均启用`isolatedRows`，只做连通主体归属与固定画布装箱，不生成缺失像素。

## 精英腐肉（9月4日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_elite_front | exec-8c2463a4-dee8-4073-afad-34716eb3d25e.png | 正面4×8，32帧全部采用；绿色色键保留洋红晶核与斩光 |
| anim_elite_side | exec-30cf4b58-e035-4cee-9278-ab6d5f136cd8.png | 严格右侧4×8，32帧全部采用 |
| anim_elite_back | exec-ba85f633-dc25-4c40-815a-c4cf68b73bf9.png | 背面只采用前7行28帧；第8行错误背部晶核被拒绝 |
| anim_elite_back_skill | exec-4ed5c513-32bc-4d78-87be-7228cfec6108.png | 独立背面技能4帧，只保留脊柱骨甲缝和双爪能量 |

精英腐肉身份约束：enormous hunched dark crimson muscular body, ivory bone armor and spikes, black iron straps and chains, three horned skull-like heads, huge asymmetric scythe-claw forearms, front-only faceted magenta chest crystal。全批使用`00FF00`色键；长爪、斩光和尸体横向轮廓通过`isolatedRows`归属到各自姿势。第三格交叉斩/挥落才登记`strike`。背面禁止晶核、脸或发光实体徽记，独立技能稿仅允许装甲缝与爪刃能量。

## 锈齿扑兵（9月4日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_rust_biter_front | exec-ecded546-6ee1-4cfb-9d85-4ab5a5237ee6.png | 正面4×8，32帧全部采用；长颚咬击第三帧为命中 |
| anim_rust_biter_side | exec-71a2cc5e-d919-4dde-acf6-395c5b402b15.png | 严格右侧4×8，32帧全部采用；四足步态、扑跃和低矮尸体可辨 |
| anim_rust_biter_back | exec-6c7bcf0f-da13-486f-a556-646e4ebe4e9a.png | 背面只采用前7行28帧；原第8行错误反应炉被拒绝 |
| anim_rust_biter_back_skill | exec-a7ecc0b1-b03a-4fe5-b99b-f2ec0984290b.png | 独立背面技能4帧；背甲漏光、电弧、速度线和烟，不画反应炉球体 |

身份约束：low dark scratched gunmetal cybernetic quadruped, orange hazard markings, exposed red muscle/cables, long crocodile-like armored jaw, one red eye, dorsal metal spikes, four mechanical claw legs, front under-jaw orange reactor。侧面必须始终朝右；背面只显示背甲、脊刺、尾部和四足外缘，反应炉、眼、口和脸必须被身体遮挡。动作按四足机械猎兽制作，不套用双足人物骨架。

八行顺序固定为idle/walk/run/jump/attack/hit/defeated/skill，每行四个时间姿势。攻击第三格是长颚闭合与橙色短斩光；技能第三格是锁向突扑。背面技能主稿违反器官遮挡规则，因此只取前7行并用4×1小批次修正，避免编辑整张时连带破坏已经验收的动作。所有布局和导入边界报告见`animation-qa/rust-biter-*-layout.json`与`rust-biter-*-import.json`。

## 断针射手（9月4日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_needle_gunner_front | exec-226853d2-18ff-4740-bd55-943d4046dcf0.png | 只采用前7行28帧；原第8行长束触底被拒绝 |
| anim_needle_gunner_front_skill | exec-89852017-0379-4d27-929d-39a066738feb.png | 正面独立4帧高功率技能；第三帧短束完整留边 |
| anim_needle_gunner_side | exec-ba0d2ba0-dddc-4d15-b792-c1a405a8bc5c.png | 严格右侧4×8，32帧全部采用；第二帧开火闪光位于真实针尖 |
| anim_needle_gunner_back | exec-19eb6b46-11bf-4a44-9e79-67437fa1489e.png | 严格背面4×8，32帧全部采用；炮口朝屏幕上方远端 |

身份约束：compact blue worn-steel mechanical walker, exactly three articulated pointed legs, yellow hazard armor panels, huge integrated rail/needle cannon, bright yellow glass energy tubes, small dark sensor assembly。不是人物、坦克或四足/多足蜘蛛。侧面炮管始终朝右；背面炮管透视缩短并朝屏幕上方，不能出现朝观众的枪口。

动作行固定为idle/walk/run/jump/attack/hit/defeated/skill。攻击四帧是aim-charge / FIRE-recoil / vent / recover，只有第二格有紧凑枪口闪光；三发逻辑弹都复用这个开火姿势和逐帧针尖挂点。技能第三格为更强放电，但束只保留起始段并留出透明边界。废弃背面稿`exec-e429d526-d038-4e40-816f-79e038aa832c.png`错误生成5列，不能通过选择四列伪装成合格4×8稿，因此整张未入库。

## 酸囊投手（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_acid_sac_front | exec-e521900b-d13f-4ac8-8f9d-767463f95e21.png | 正面4×8，32帧全部采用；第三帧酸球离开右侧机械爪 |
| anim_acid_sac_side | exec-5d78380c-11c2-405c-8b53-eeb324a13147.png | 严格右侧4×8，32帧全部采用；长臂、爪口及酸液释放完整留边 |
| anim_acid_sac_back | exec-23b0d80b-3a04-4d96-8384-47e9e9b30753.png | 严格背面4×7；采用待机、走、跑、跳、攻击和技能，原第6行不作受击 |
| anim_acid_sac_back_hit | exec-a919a1b4-20c6-4e84-a031-fb79624d1891.png | 背面独立4帧受击、后仰、回弹、恢复，无塌落和正脸 |
| anim_acid_sac_back_defeated | exec-995aeb69-a498-4d32-8651-238a425411d8.png | 背面独立4帧泄压塌落，最终低矮残骸无正脸 |

身份约束：mutated industrial acid carrier, enormous translucent lime-green dorsal acid sac with bubbles, dark worn metal bands and pump valve, two long articulated mechanical throwing arms, four squat clawed support legs, small front mouth only visible from front。侧面始终朝右；背面禁止眼、嘴、面部和朝观众的口器，只显示酸囊、泵阀、束带和肢体背侧。

动作行固定为idle/walk/run/jump/attack/hit/defeated/skill，每行四个时间姿势。攻击第三格为机械爪释放酸球；技能第三格为酸液喷流峰值。背面采用4×7主稿加独立受击/死亡小批次，避免把塌落末帧冒充可恢复的受击。第一版背面`exec-b57cf399-2b51-41e9-ae0f-b45db5d302ef.png`因露出正面绿色口器整张拒绝。所有布局与导入报告见`animation-qa/acid-sac-*-layout.json`和`animation-qa/acid-sac-*-import.json`。

## 铆甲兽（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_rivet_beast_front_motion | exec-3b624283-5b9c-4d22-bf44-c3910760a6b4.png | 首稿实际6行，只采用前4行待机、走、跑、跳 |
| anim_rivet_beast_front_combat | exec-533a193d-2960-4f31-836a-fb203766c069.png | 正面顶撞、受击、倒下、冲锋16帧 |
| anim_rivet_beast_side_motion | exec-5cf456f4-a9ce-4295-b9fa-2ecb18d3241c.png | 严格朝右侧视运动16帧；由朝左首稿定向修正 |
| anim_rivet_beast_side_combat | exec-be92e51e-39c6-4fb7-8d68-a50fcaff1ae3.png | 严格朝右顶撞、受击、倒下、冲锋16帧 |
| anim_rivet_beast_back_motion | exec-99cf4173-fd2c-42d2-9cbe-38706e60a243.png | 严格背视运动16帧；宽圆后壳朝观众 |
| anim_rivet_beast_back_combat | exec-316941c9-9208-43a0-a1ba-b06f2e1b4e1d.png | 背视战斗16帧；接触在远端，冲锋向屏幕上方 |

身份约束：low wide six-legged biomechanical pack beast, dark raw red muscle and cables, massive scratched gunmetal riveted trapezoid armor wall at its front, layered dorsal plates, pale cyan-white worn rim highlights。不是人物、坦克或四足生物。侧面头部和顶撞端必须朝右；背面宽圆后壳与后足朝观众，正面护板在屏幕上方远端透视缩短，禁止脸、眼、嘴或正面撞板朝观众。

运动与战斗分成两个4×4小批次，统一448单格、固定逻辑脚底和显示尺度。顶撞与冲锋第三格为接触/爆发峰值。侧面首稿`exec-3760e47d-4012-4cf6-9b9d-82c2dffcb6ce.png`朝左，未入库；背面首稿`exec-ba68ec82-b388-4130-a843-302b89e00f93.png`仍显示正面梯形撞板，未入库。各方向通过`isolatedRows`只分配已生成像素到最近姿势，不补画或拉伸肢体。

## 掠金虫（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_gold_scavenger_front_motion | exec-677b9e94-52d8-4224-af96-2f255ed15eec.png | 原生透明稿只采用前2行待机、走路；跑/跳同列重叠部分不采用 |
| anim_gold_scavenger_front_run | exec-2ccea769-8f6b-43c5-b0be-7210ec0c4bcf.png | 独立正面4帧六足快跑，替换重叠的原第3行 |
| anim_gold_scavenger_front_jump | exec-22210558-6940-4262-8838-daeede8ca2b6.png | 独立正面4帧蹲伏、起跳、腾空、落地，保留真实高度差 |
| anim_gold_scavenger_front_combat | exec-d3207953-fd39-403d-a14a-af2a4ea28170.png | 正面无伤害拾取、受击、倒下、逃逸16帧 |
| anim_gold_scavenger_side_motion | exec-b2a60e84-260e-4805-8250-999e85980f3b.png | 严格朝右侧视运动16帧 |
| anim_gold_scavenger_side_combat | exec-2c93afc1-33a0-4c67-922a-ecb5427704cb.png | 严格朝右战斗16帧；逃逸尾迹向左 |
| anim_gold_scavenger_back_motion | exec-da3586c0-fabe-4d76-82cc-c8451add495c.png | 严格背视运动16帧；透明金币袋保留，正面传感器不可见 |
| anim_gold_scavenger_back_combat | exec-7aa49a91-5680-4722-bd3f-8822c3a2c1f4.png | 背视战斗16帧；逃逸向上、尾迹向下 |

身份约束：small six-legged dark-copper mechanical insect, transparent glass sack full of glowing hexagonal gold coins, gold energy feet, black cel-shaded outlines。侧面头部必须朝右、金币袋在左后方；背面面向屏幕上方，禁止眼、嘴和朝观众的前传感器。攻击行只是拾取/警觉手势，不得出现弹体、挥击或伤害接触。

正面战斗首稿`exec-909282e5-f24f-4f72-836a-1f1a83eff448.png`为烧录棋盘格RGB，整张拒绝。修正版改为纯洋红底后技术解码。正面运动原稿的跑与跳在第三列发生纵向重叠；最终不裁肢体、不擦像素，改用两个独立4×1源稿。布局和透明边界报告见`animation-qa/gold-scavenger-*-layout.json`与对应`*-import.json`。

## 熔爆蜱（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_blast_tick_front | exec-19205185-566f-40de-a523-aa02a36aacb7.png | 正面4×8，32帧全部采用；爆后为空壳，过热第三帧为临界 |
| anim_blast_tick_side | exec-f5fb137b-5b54-44bd-a672-c20e46f4d5be.png | 严格朝右4×8修正版，移除所有烧录地面投影 |
| anim_blast_tick_back | exec-3c06f6ca-4ff2-47f8-9f68-511df4e1cd54.png | 只采用前7行28帧；原第8行错误正脸过热不入库 |
| anim_blast_tick_back_skill | exec-ee73e495-556f-4f2d-82d0-ccdde0d06d5e.png | 独立严格背面4帧过热，三排气口与空白后机盖朝观众 |

身份约束：low round six-legged dark gunmetal/scorched-orange mechanical tick, huge cracked molten-orange spherical abdomen, three short exhaust vents, compact front sensor head with two orange lights and mandibles, articulated blade legs。侧面头部必须朝右、球腹在左；背面只显示球腹后壳、三排气口、空白后机盖和六足，禁止眼、嘴、口器和朝观众的头部。

动作行固定为idle/walk/run/jump/attack/hit/defeated/skill。`attack`只是无伤害接近警觉；`skill`四帧逐步升温，第三帧登记临界表现事件；真实爆炸继续由计时逻辑结算。废弃侧面稿`exec-f695e4c1-7bd9-475f-9a25-a545b3c6c136.png`带黑色接触影，不入库。废弃背面首稿`exec-eae03201-a4bb-45fb-a013-38e1e95bfd46.png`全图露出正面眼口，不入库。严格后壳单姿势参考为`exec-b23a29cf-9e0c-498f-979e-c616ed1b083e.png`。布局与导入报告见`animation-qa/blast-tick-*-layout.json`和对应`*-import.json`。

## 烬火侍从（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_ember_acolyte_front_motion | exec-674904aa-9809-4bc5-ad20-63d4f79e2b49.png | 正面待机、走、跑、跳16帧 |
| anim_ember_acolyte_front_combat | exec-f4d3853a-4e23-4670-841e-490ce9c44f1d.png | 正面施法、受击、倒下、过载16帧；第三帧火焰接在法杖喷口 |
| anim_ember_acolyte_side_motion | exec-e95ed9d9-9652-4a63-9e86-09283c4c4662.png | 严格朝右侧视运动16帧 |
| anim_ember_acolyte_side_combat | exec-332cb3bd-5045-46ec-b309-775bc34cb600.png | 严格朝右战斗16帧；施法短焰从右侧喷口发出 |
| anim_ember_acolyte_back_motion | exec-68211e1e-553a-482a-9f27-1539e15ea54a.png | 透明底严格背视运动16帧；只显示后机盖与排气罐 |
| anim_ember_acolyte_back_combat | exec-7600eaa6-0a4f-40b5-a8e6-292b5761f0e2.png | 背视战斗16帧；法杖朝屏幕上方远端施法 |

身份约束：squat bipedal industrial fire acolyte, hovering hexagonal furnace-orb head with front-only molten window, blackened gunmetal/copper armor, thick braided cable mantle, scorched cloth tails, heavy boots, exactly one long fire-casting staff/cannon。侧面始终朝右；背面炉窗、脸、眼与嘴完全被后机盖遮挡，法杖透视缩短并指向屏幕上方。

运动与战斗拆成两张4×4小批次，行序分别为idle/walk/run/jump与attack/hit/defeated/skill。攻击第三帧登记`cast`，真实0.85秒地面预警、1.5秒余烬、5点直伤和单层灼烧仍由原地面机制结算；身体只表现喷口施法，不生成飞行火球。六张稿使用整图连通主体分离，把跨横纵等分线的法杖、短焰、火星与缆线归回最近完整主体，保留原像素后统一装箱。首张正面32格稿`exec-3ab8ee0a-2393-4be4-833b-0bfbfa5e9788.png`把火焰画到肩后；侧面32格稿`exec-f0bddb49-daab-4334-9466-f0f716dc3b4b.png`只有7行且串行动作；棕色渐变侧面运动稿`exec-315a6758-3cb4-431a-b131-c5e9556ad1bd.png`无法可靠解码透明；棋盘格背面战斗稿`exec-895f7dc7-004d-4cec-88d4-3889078d7191.png`为烧录背景。四份均未入库。

## 冰棱侍从（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_frost_acolyte_front_motion | exec-a5af5de4-ad4c-4769-9abc-2824c43e6aa8.png | 正面悬浮待机、漂移、快移、升降16帧 |
| anim_frost_acolyte_front_combat | exec-0cac085c-81b3-4f0d-bfb2-76aa6a2b8bf1.png | 采用齐射、受击、倒下12帧；原技能行多出冰晶，不登记 |
| anim_frost_acolyte_front_skill | exec-bb6bc950-446a-41dd-95f8-237d4c72e207.png | 独立正面4帧环核充能，保持三个主冰晶 |
| anim_frost_acolyte_side_motion | exec-4e0bd959-6785-4671-94bc-daedd963f081.png | 严格朝右侧视运动16帧 |
| anim_frost_acolyte_side_combat | exec-7ee2e1a4-5d73-4937-a517-efa851bcba41.png | 只采用受击、倒下8帧；原攻击漏晶、技能多晶，不登记 |
| anim_frost_acolyte_side_attack_skill | exec-1684e2a2-1f9b-450a-8b29-4bec06b6bfad.png | 严格朝右齐射和环核充能8帧，每帧恰有三个主冰晶 |
| anim_frost_acolyte_back_motion | exec-31704bb8-bbb7-4f74-914c-9e1d49912dd2.png | 严格背视运动16帧，中央为封闭后盖 |
| anim_frost_acolyte_back_combat | exec-986c0dd4-65af-4950-b487-475b78f5afdf.png | 背视齐射、受击、倒下、充能16帧 |

身份约束：three-bladed hovering frost acolyte, exactly three large cyan ice crystals on three mechanical arms, dark gunmetal joints, central cyan energy ring。正面看见开口能量环；侧面主体朝右且三枚冰晶仍可辨；背面只显示封闭后盖，禁止把正面空心环画到后侧。不得增加第四枚晶体、游离冰柱、脸、眼或地面投影。

运动与战斗按4×4小批次生成，问题动作再用4×1或4×2补图替换。攻击和技能第三帧为`cast`峰值，发射挂点位于中央能量环；身体只表现三枚既有冰晶围绕环核蓄能，不把弹体画进角色轮廓。首张正面战斗候选`exec-709941f1-ea86-473c-849f-417eb28abdc0.png`带大面积青色雾毯且倒下终帧缺第三晶，拒绝；蓝灰渐变侧面稿`exec-c068f8cc-f953-41b8-9400-6f5d61d65eb9.png`和背面稿`exec-841466a0-7850-4daf-9d94-8f38cee5cfff.png`无法可靠解码透明，拒绝。八张最终稿使用`isolatedGrid`保存跨格冰晶尖端与能量弧的原始像素，再按固定逻辑中心统一装箱。

## 闪弧寄生体（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_arc_leech_front_motion | exec-12191d86-cc25-4e3e-973d-c3dc5ae5f487.png | 正面悬浮待机、漂移、快移、升降16帧；每帧两条电缆完整 |
| anim_arc_leech_front_combat | exec-54354630-eb1b-421a-9f7b-fc97d39f0201.png | 正面电眼放电、受击、断电倒下、端夹供能16帧 |
| anim_arc_leech_side_motion | exec-bdda4805-f87d-4d96-94cb-c53c4ed02691.png | 严格朝右侧视运动16帧，电缆向左拖曳 |
| anim_arc_leech_side_combat | exec-666fcdf0-bd5f-4265-999e-2cff6d2654cb.png | 严格朝右战斗16帧，第三帧从右端侧镜放电 |
| anim_arc_leech_back_motion | exec-fea229c6-0e89-4782-9852-b1e4ce17abe3.png | 严格背视运动16帧，封闭后盖和窄电源缝朝观众 |
| anim_arc_leech_back_combat | exec-0d9bb5bc-1e76-4f58-b03e-c6ca0b725c55.png | 背视战斗16帧，放电朝屏幕上方且不露正面电眼 |

身份约束：hovering flat diamond-shaped parasitic machine, battered dark gunmetal triangular armor, copper braces, one cyan-white electric eye on the FRONT only, EXACTLY TWO long flexible conductive cable tentacles ending in energized clamp bulbs。侧面尖端和侧镜必须朝右、两条电缆向左拖曳；背面必须由封闭后盖遮住正面电眼，只保留窄青色后部电源缝。禁止额外电缆、断肢、友军、地面投影、烧录连接线或脱离身体的弹体。

运动和战斗各用4×4小批次。战斗行序为attack/hit/defeated/skill：攻击第三帧只有连接发射器的短闪，不画飞行电球；技能第三帧只增强两个既有端夹，真实的两条友军连线继续由程序根据220像素内最近目标绘制。六张稿均采用纯洋红底技术解码和`isolatedGrid`装箱，保留跨格软电缆、速度残影与短电弧的原始像素。侧面运动源为1536×1024非方图，按4×4真实单格标定并统一缩放，没有横向拉伸机体。

## 深海鱿鱼（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_squid_front_motion | exec-4d23aac5-fc4f-4679-956f-6cadaf93510f.png | 正面待机、游走、突进、跃迁16帧 |
| anim_squid_side_motion | exec-d8840643-52b4-4f8d-8114-c3066b7ea1c5.png | 严格朝右侧视运动16帧 |
| anim_squid_back_motion | exec-be599d9f-ab86-4a80-82bb-a5aa48515972.png | 严格背视运动16帧，不露眼与喙 |
| anim_squid_front_combat | exec-0aa8c881-39f6-421c-8a6f-88b1bd56f7fe.png | 正面触手抽击、受击、倒下、深水炸弹16帧 |
| anim_squid_side_combat | exec-5cd80bff-760a-4318-899b-ce196638f2d6.png | 右侧战斗16帧，水弹在喙前成形 |
| anim_squid_back_combat | exec-3c6bbd9f-c383-4141-b83f-45cd098bb340.png | 背面战斗16帧，第4帧顶缘小光点释放水弹 |
| anim_squid_front_skills | exec-fbff8450-459c-4fac-9ddc-9fd16a04b267.png | 正面分裂水刺与缠绕8帧 |
| anim_squid_side_skills | exec-3dc0b8c1-7b4e-4ceb-a2b1-404ac3110648.png | 右侧水刺与前伸缠绕8帧 |
| anim_squid_back_skills | exec-44bb6aec-edef-4b17-bf94-581dc7df8646.png | 背面远向水刺与包围缠绕8帧 |

身份约束：armored abyssal squid miniboss，暗海军蓝/紫色软体、青色吸盘、铜黑甲片、六条连贯主触手。正面可以看见眼和喙；侧面必须始终朝右；背面必须完全遮住眼、喙和其他面部结构。所有触手和技能亮光必须与身体连续，禁止游离触手卷、额外肢体、漂浮水球、地面投影、文字或场景。

运动与战斗按4×4生成，补充技能按4×2生成。主战斗行序为attack/hit/defeated/deep-water-bomb；补充技能行序为split-water-spikes/entangling-grab。正面与侧面水弹在第三帧到达释放峰值，背面稿的实际顶缘亮点在第四帧，因此运行时按方向分别绑定事件。水刺第三帧形成三枚清晰尖端，缠绕第三帧达到最大包围范围。九张最终稿使用纯洋红底解码和`isolatedGrid`保留跨格长触手，再按各行动作最低点建立共同基线。

被拒绝的背面战斗候选`exec-5294d9c7-6cb2-4ee5-a5f4-819b428822c9.png`在攻击行出现脱离身体的左侧触手卷，水弹行又把完整球体悬浮在身体上方，违反连接约束。最终背面重绘只在甲壳远端画逐帧上行能量和贴住顶缘的小光点；浏览器挂点复核后按导入图的实际蓝光位置再次校准。

## 盾龟（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_turtle_front_motion | exec-15200534-ad3d-440f-94df-792ebb477a7b.png | 正面待机、爬行、疾行、缩壳跃起16帧；头朝屏幕下方 |
| anim_turtle_side_motion | exec-4d19c4da-2e26-4ee2-af9b-c6e4f7b8c829.png | 严格朝右侧视运动16帧 |
| anim_turtle_back_motion | exec-0e65bb58-ac23-44b7-98e9-64e02d2bb537.png | 严格背视运动16帧，分节尾部朝屏幕下方且头部隐藏 |
| anim_turtle_front_combat | exec-8a441aa6-d200-426c-b14c-fdefc3fa72fd.png | 正面砸击、受击、倒下、贴壳护盾16帧 |
| anim_turtle_side_combat | exec-8e561b41-8f06-4cb9-a76a-0715e5fbb72f.png | 右侧战斗16帧，前肢向右撞击 |
| anim_turtle_back_combat | exec-dd6f67d8-2d13-40de-aac5-a78acfeeab5b.png | 背视战斗16帧，尾部与后壳关系保持一致 |
| anim_turtle_charge | exec-40364a09-dc2e-4266-ad09-81846d7c9b11.png | 正/侧/背三行独立高速碰撞，共12帧 |

身份约束：low broad cybernetic shield turtle miniboss，深绿与旧青铜六角龟甲、两枚青色圆形反应炉、四只粗短机械足、短头与分节尾。正面头部朝屏幕下方；侧面全程朝右；背面必须隐藏头部并让尾部朝屏幕下方。禁止哺乳动物脸、额外肢体、游离护盾球、烧录地面投影或场景。

运动和战斗各用4×4小批次，行序分别为idle/walk/run/jump与attack/hit/defeated/shell-shield。冲撞另用4×3，三行分别为front/right-side/back。砸击、护盾和冲撞均在第三帧达到事件峰值；护盾必须沿龟甲表面闭合，冲撞必须表现缩足、前倾与贴壳速度弧。七张最终稿使用纯洋红底技术解码和`isolatedGrid`，按每行动作最低点统一基线。

第一张侧面运动候选`exec-faf9024e-cbbf-42b7-886d-5e83c7ecb281.png`带烧录黑底，拒绝；第一张背面运动候选`exec-44611f30-ea57-4d36-8b26-431ab9b37a63.png`仍是头部朝下的正面器官关系，拒绝。最终背面稿改为清晰分节尾部朝下且正面头部不可见。

## 锯齿剑虾（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_shrimp_front_motion | exec-8a79cd03-30f6-4018-8c5a-0dc9cf498575.png | 只登记前3行待机、快爬、闪避疾行12帧；原跳跃行解剖漂移 |
| anim_shrimp_front_jump | exec-07196429-efb7-492a-b993-5a55f413acfe.png | 独立正面跃起4帧，保持长躯体、双螯与尾扇 |
| anim_shrimp_side_motion | exec-521b3e3b-8b04-4c3e-ae44-a3fa254eb654.png | 严格朝右运动16帧 |
| anim_shrimp_back_motion | exec-7990fe97-cbe8-437f-a280-1eebe7746678.png | 透明背视运动16帧，尾扇朝屏幕下方 |
| anim_shrimp_front_combat | exec-f3724111-d85b-4ee0-93aa-8e619407b3ca.png | 正面钳击、受击、倒下、背刺发射16帧 |
| anim_shrimp_side_combat | exec-fac4a7a8-0cda-4967-b3c0-e28f345d9a39.png | 严格朝右战斗16帧 |
| anim_shrimp_back_combat | exec-39bd125b-1fdc-4525-902c-833bf4c82ca5.png | 背视战斗16帧，远端背刺朝屏幕上方 |
| anim_shrimp_tail_whip | exec-dfbac9b7-ca32-4ee4-88f5-047421aea9eb.png | 正/侧/背三行甩尾眩晕，共12帧 |

身份约束：cybernetic saw-claw mantis shrimp miniboss，熔橙与黑铁分节甲壳、宽尾扇、恰好两只巨型锯齿前螯、六只小足、两根触须和蓝黑复眼。正面头与螯朝屏幕下方；侧面严格朝右；背面尾扇朝屏幕下方且头与复眼被胸甲遮挡。禁止额外螯、缺足、游离背刺、烧录地面投影或场景。

运动与战斗各用4×4，正面跳跃因原稿第四行姿势漂移单独用4×1替换。战斗行序为claw-sweep/hit/defeated/dorsal-spike-launch；甩尾另用4×3，三行对应front/right-side/back。钳击、背刺和甩尾均在第三帧达到事件峰值；背刺发射帧只保留与甲壳相连的刺和小型插槽闪光，不画飞行弹体。最终八张图使用洋红色键或真实Alpha解码，再以整图连通主体分离保留跨格触须、双螯和尾扇亮弧。

拒绝项：`exec-3ce373e7-d473-43a2-9eb7-aff771c74984.png`与`exec-5771826d-2c8a-4fc3-b663-0cd36c28fd73.png`均带棕色渐变底；`exec-791d2d1d-c5ae-4c2a-b807-e562ca6a0ae7.png`烧录白灰棋盘格。三份均不入库。`exec-fac4a7a8-0cda-4967-b3c0-e28f345d9a39.png`是使用ImageGen把棋盘背景重制为纯洋红后的合格侧面战斗稿。

## 毒花水母（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_jelly_front_motion | exec-6c8d6ee5-0cb4-432f-bd5e-1530ee3a1f21.png | 正面悬浮待机、漂移、疾行、升降16帧；由棋盘修订稿重制为纯洋红底 |
| anim_jelly_side_motion | exec-756e15bd-4ac3-453e-839c-231aeea48bc5.png | 严格朝右侧视运动16帧；长触腕和六枚毒囊保持连续 |
| anim_jelly_back_motion | exec-eb3764fe-ca04-4bbc-afbc-ec22a536742d.png | 严格背视运动16帧；封闭膜遮住正面毒核 |
| anim_jelly_front_combat | exec-1d31a519-e092-4169-8ea4-f6988e67e416.png | 原生透明正面触腕攻击、受击、倒下、隐身16帧 |
| anim_jelly_side_combat | exec-f1972a20-4a27-40f4-ac62-a4384922b151.png | 原生透明右侧战斗16帧；隐身行逐步淡出 |
| anim_jelly_back_combat | exec-c79ad189-002f-40be-a3f1-495d301ab49f.png | 背视战斗16帧；倒下行的游离碎屑在入库时按行剔除 |
| anim_jelly_venom_sting | exec-d00ec9e8-009c-4c16-9173-411f57d00205.png | 正/侧/背三行毒刺发射12帧；第三帧针尖发光且不包含飞行弹体 |

身份约束：translucent lavender flower-bell jellyfish miniboss，正面中央只有一个洋红毒核，外围恰好六枚青铜三角甲片，恰好六条长紫色触腕以洋红毒囊和弯钩收尾。侧面必须始终朝右；背面以封闭膜和甲片遮住正面毒核。禁止额外毒核、游离触腕、脱离针尖的发光弹体、地面投影、文字或场景。

运动与战斗分别按4×4生成，行序为idle/walk/run/jump与attack/hit/defeated/invisibility。毒刺另用4×3，三行对应front/right-side/back；第三帧将一条既有触腕收束为发射针尖，只画与针尖相接的小型毒光。最终洋红稿使用边缘连通色键，只删除从画布边界可达的洋红背景，保留封闭在身体轮廓内的洋红毒核与毒囊；`isolatedGrid`和指定行碎片清理负责保全跨格长触腕并移除不属于主体的源稿小点。

重制链：正面运动由`exec-e61c8ac7-def7-4279-9e00-3901f0b5727e.png`棋盘候选重制，原始候选为`exec-43b4f675-c567-46e8-96a3-82a58c984a1a.png`；侧面运动由`exec-bd36c092-2de6-4b3c-9836-86ba0a166b9f.png`重制，原始候选为`exec-c1ec5f72-4549-4023-931f-3cbbd8b93690.png`；背面运动由`exec-c8d4e5fd-b95d-4428-afd2-6e01c1463bb5.png`重制，原始候选为`exec-7f52833e-7393-44c9-b620-19cd7ce3720d.png`。背面战斗由`exec-db1f2701-27df-4b68-b424-81ec7698de51.png`重制，原稿为`exec-b33758c7-e101-4dec-ba8b-c0e4586bcfea.png`；毒刺由`exec-2414067e-5e97-424b-adac-7b06b51e5a07.png`重制，原稿为`exec-3e91ff74-23bd-4041-958e-78bf36ecfcfb.png`。这些棋盘或错误Alpha中间稿只用于ImageGen重制，没有直接入库。

## 攻击无人机（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_drone_attack_front_motion | exec-8878ed49-ef1d-4a90-990f-44ec9a83ee9f.png | 朝屏幕下方的悬浮待机、巡航、推进与收翼闪避16帧 |
| anim_drone_attack_side_motion | exec-7e179709-18b9-4d76-825d-78511003b254.png | 严格朝右运动16帧；修正第4行误转朝上的首稿 |
| anim_drone_attack_back_motion | exec-ab240260-7804-4704-9320-9d15b0d3c287.png | 严格朝屏幕上方运动16帧；推进焰向下拖尾 |
| anim_drone_attack_front_combat | exec-00b4c491-1853-4e2d-b23e-ba4415edae25.png | 朝下声波、受击、断电倒下与锁定光束16帧 |
| anim_drone_attack_side_combat | exec-5d38dbf7-ea68-49d4-985d-3f2b894e9e1a.png | 严格朝右战斗16帧；声波弧和光束从右侧炮口发出 |
| anim_drone_attack_back_combat | exec-241d1b71-94dc-486b-be32-fa26e24ccd2e.png | 朝上战斗16帧；声波与短光束指向屏幕上方 |

身份约束：orthographic top-down attack drone，磨损暗枪铁圆形机身、中央红色火控镜、恰好四枚带旧红条纹的后掠装甲翼、恰好四根短炮管并组成左右两组。禁止驾驶员、脸、腿、额外翼、额外炮、缺件、地面投影、游离零件或方向中途旋转。正面朝屏幕下方，侧面严格朝右，背面朝屏幕上方。

运动行序为idle/patrol/boost/dodge-ascent；战斗行序为sonic-shield-break/hit/defeated/homing-beam-lock。声波和光束均在第三帧达到峰值，只画与炮口相接的短声波弧或短束，不把飞行弹体、目标或光束终点烧录进身体图。倒下行让四翼折叠、中央镜熄灭并压成紧凑残骸，所有零件保持连接。

第一张朝右运动稿`exec-807b9aaa-e6fe-494a-86bc-d72ab5bea3e7.png`的第4行突然转为朝上；第一张朝上稿`exec-12f4bbdd-6108-4314-87d4-c597a159af90.png`的第2/3行斜向右。两张都未入库，分别定点重制为最终源。六张最终稿使用纯洋红背景、边缘连通色键与整图主体分离，既保留红紫机内发光线，又避免推进焰和声波弧混入相邻动作。

## 支援无人机（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_drone_support_front_motion | exec-1fc34beb-d72d-470e-9c85-84eee8b1fe58.png | 朝屏幕下方的悬浮待机、巡航、推进与升降闪避16帧 |
| anim_drone_support_side_motion | exec-9f6c6b9d-22ca-499c-a78e-a5a4479adb73.png | 严格朝右运动16帧；推进绿焰向左连接机尾 |
| anim_drone_support_back_motion | exec-32bdd1c0-d109-4dd7-a9b3-73e1aad0d455.png | 严格朝屏幕上方运动16帧；封闭后壳遮住治疗镜 |
| anim_drone_support_front_combat | exec-1d706be5-e37a-4554-b6eb-a35edbee302f.png | 正面治疗、受击、断电倒下与护盾部署16帧 |
| anim_drone_support_side_combat | exec-9e310a96-38d7-4018-bf69-68f2704dac0a.png | 朝右战斗16帧；治疗脉冲和护盾弧均连接右侧投射器 |
| anim_drone_support_back_combat | exec-4d30890b-6ca2-4f86-a618-bc7ae830f6d5.png | 朝上战斗16帧；护盾弧沿机身远端闭合 |
| anim_drone_support_summon | exec-1ab2a4ae-8d39-4218-98cf-6a95ad9b935b.png | 正/侧/背三行呼叫增援12帧；不把五架召唤物烧进身体帧 |

身份约束：orthographic top-down support drone，磨损暗枪铁圆形机身、旧金色包边、正面祖母绿治疗反应炉、恰好四枚宽椭圆飞行舱、两组带青色六角屏的侧向护盾投射臂和两只绿色维修机械手。侧面严格朝右；背面用封闭黑铁后壳遮住正面圆形治疗镜，只留窄绿色电源缝。禁止驾驶员、脸、腿、额外飞行舱、缺件、游离护盾、友军或召唤物。

运动行序为idle/patrol/boost/dodge-ascent；战斗行序为heal-support/hit/defeated/energy-shield；呼叫增援另用4×3，三行对应front/right-side/back。治疗、护盾与呼叫均在第三帧达到`cast`峰值。治疗光只连接反应炉或维修手，护盾弧只连接既有侧投射器，呼叫信号只连接顶部天线；真实友军目标和五架攻击无人机继续由程序生成。最终七张稿使用纯洋红边缘连通色键，六张整图主体分离；侧面运动采用固定格线装箱以保留横向推进尾迹。七份报告均为零边界像素。

## 铆链猎犬（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_chain_hound_front_motion | exec-ed55609d-e337-48e2-9b8b-dbb151880605.png | 只登记正面待机、行走、奔跑12帧；原第4行第三格丢失长尾，不登记 |
| anim_chain_hound_front_jump | exec-5f2ef263-8f3c-416a-bf83-bd3d59b5c2c8.png | 独立正面跃起4帧，四格均保留完整链尾和夹口 |
| anim_chain_hound_side_motion | exec-a11b9aad-5e85-4b0b-9ea4-78eab16d9ef7.png | 严格朝右运动16帧，链尾向左拖曳 |
| anim_chain_hound_back_motion | exec-78e97fa4-1c1c-4f6f-bd60-a9c5883f5d87.png | 严格背视运动16帧，楔形头朝屏幕上方 |
| anim_chain_hound_front_combat | exec-cf14c2a5-f1bb-401d-a789-311caf1fd80b.png | 正面咬击、受击、断电倒下与尾夹部署16帧 |
| anim_chain_hound_side_combat | exec-0b653e74-5516-402d-8fc6-22a6a4439723.png | 朝右战斗16帧，第三帧尾夹沿链甩向前方 |
| anim_chain_hound_back_combat | exec-f79c66d3-0256-4d4b-98a2-68986f7f19e0.png | 背视战斗16帧，尾夹从后部卷向远端 |
| anim_chain_hound_charge | exec-e7343541-1508-4c2c-8a09-43f4a25e26c4.png | 正/侧/背三行链钉冲猎12帧，第三帧为高速接触峰值 |

身份约束：long low rusted dark-gunmetal mechanical hound，楔形装甲犬首、恰好四只关节利爪腿、一条连续红热链条脊柱，以及一条柔性长链尾；链尾末端只有一个大型捕兽夹口并始终与身体相连。侧面犬首严格朝右、链尾拖向左；背面犬首朝屏幕上方且面部被背甲遮挡。禁止额外头尾、缺腿、复制夹口、游离捕兽夹或脱落零件。

运动行序为idle/walk/run/jump，正面错误跳跃行由独立4×1重制替换；战斗行序为bite/hit/defeated/retrieval-trap，冲锋另用4×3三方向图。咬击第三帧登记`strike`，冲锋和尾夹第三帧登记`cast`。捕兽夹地面危险区继续由程序在玩家瞄准线法向两侧生成，身体帧只表现原有链尾甩动，不复制地面夹。侧面运动和三张战斗稿使用`isolatedGrid`保留跨格长链；倒下行明确剔除游离碎片。八份输出报告均为零边界像素。

## 棱壳巡灯兽（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_prism_snail_front_motion | exec-45d7f7d0-1b41-4103-a8aa-e444738462ed.png | 朝屏幕下方的待机、爬行、疾行和负壳跃起16帧 |
| anim_prism_snail_side_motion | exec-481db2e3-e0b3-4c41-8c34-085161b4cf62.png | 严格朝右运动16帧，疾行短线保持在壳体后方 |
| anim_prism_snail_back_motion | exec-c096725b-fd04-4252-8d96-a6f129c3c123.png | 严格背视运动16帧，后框遮住主要镜片 |
| anim_prism_snail_front_combat | exec-f62d01f3-64d3-4970-84d3-a5c64011c119.png | 正面壳击、受击、低伏倒下与短棱镜光刃16帧 |
| anim_prism_snail_side_combat | exec-97a3e7db-dec9-48fc-9511-878f87bf50ba.png | 朝右战斗16帧，光刃与单枚侧镜相连 |
| anim_prism_snail_back_combat | exec-02ef8a9b-0f3c-4b4b-8d5e-d76c04043923.png | 背视战斗16帧，扫射只露远端短刃 |
| anim_prism_snail_shell | exec-d76dc787-4cf0-4caa-aa6c-e5a735fe04f1.png | 正/侧/背三行闭壳护盾12帧，第三帧为完全闭合峰值 |

身份约束：heavy prism snail miniboss，暖琥珀半透明六角穹壳、黑色枪铁六角框架与线缆、壳体前右侧恰好一枚青色六角棱镜镜片、深青色光泽软体和恰好四只粗短爬行叶足。无脸、眼、触角或人形腿；侧面严格朝右；背面以壳后框遮住镜片，只允许侧缘青光。禁止复制镜片、游离光束、独立护盾泡、地面投影、目标或脱落碎片。

运动和战斗各使用4×4，行序分别为idle/walk/run/jump与shell-bash/hit/defeated/prism-sweep。闭壳另用4×3，三行依次为front/right-side/back；每行由收足、闭板、完全闭壳和保持/微开组成。壳击、扫射与闭壳均在第三帧达到事件峰值。扫射帧只画与唯一镜片连接的短青白光刃，900像素长光带由程序生成；闭壳青光只沿既有框架闭合。七张最终稿用纯洋红边缘连通色键与`isolatedGrid`装箱，固定共同基线，全部报告为零边界像素。

## 三相祭司（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_triune_priest_front_motion | exec-756ad021-168a-4898-8767-b620379fd4ae.png | 正面悬浮待机、巡移、疾行和升降16帧 |
| anim_triune_priest_side_motion | exec-a93734ec-0348-49ab-976e-7cbaac036648.png | 严格90度朝右运动16帧；替换偏正面的首稿 |
| anim_triune_priest_back_motion | exec-cee7b839-52a4-4274-98ff-34a42ab547eb.png | 背视运动16帧，三层封闭后盖与线缆脊 |
| anim_triune_priest_front_combat | exec-1b7bde2c-77fd-4f9e-b6b1-cc832946348e.png | 正面攻击、受击、倒下、焚相16帧；由白格线候选重制 |
| anim_triune_priest_side_combat | exec-a66aec3e-580b-406b-92fd-cd3202efdb5c.png | 朝右战斗16帧，扩大格间安全区的第二版 |
| anim_triune_priest_back_combat | exec-7b815c42-95e9-4a73-a0a4-b0cfb8afdb2d.png | 背视战斗16帧，正面核心只留侧缘光 |
| anim_triune_priest_ice | exec-e1c4e01c-48ba-47a8-bbf6-2aab401a294f.png | 正/侧/背三行冻相12帧，中央冰晶释放短晶簇 |
| anim_triune_priest_arc | exec-22203e1b-493b-47fe-8e41-fd5223ccef9b.png | 正/侧/背三行雷相12帧，下层电核释放短三角电符 |

身份约束：tall hovering cybernetic ritual priest，由上火、中冰、下雷恰好三个纵向六角反应模块组成，黑色枪铁与旧象牙色框架、柔性线缆、两片肩后折翼、恰好两只机械臂；左臂为双齿爪，右手只握一根顶端为青色晶矛的长杖。禁止脸、眼、腿脚、额外手臂、复制法杖、缺失模块或游离器官。侧面必须是90度朝右的窄纵向轮廓；背面用三层封闭后板遮住正面核心，只留侧缘能量缝。

运动与战斗各用4×4，行序为idle/walk/run/jump与staff-strike/hit/defeated/fire-phase。冻相、雷相各用4×3三方向表。三种技能均在第三帧达到`cast`峰值：焚相只点亮上层橙核并画相连短火符，冻相只点亮中央冰晶并画相连短晶簇，雷相只点亮下层电核并画相连短三角电符。移动烙印、晶墙、三角导体都由程序生成，不烧录目标或场地机制。

拒绝记录：侧面运动首稿`exec-de9ae09d-d4fc-485b-a461-c2829fd7440b.png`仍近正视；正面战斗首稿`exec-b95b04b2-29a4-4d27-af6a-7fc046b300b7.png`带白色格线；首张侧面战斗`exec-10ad4c9b-d838-4532-9781-54396435ac20.png`的横向动作跨格并串入相邻帧。三张均未直接入库。最终八张图使用纯洋红边缘连通色键；跨格结构使用`isolatedGrid`，第二版侧面战斗只对指定行清理游离碎光，保留倒地法杖。

## 磁轨屠夫（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_rail_butcher_front_motion | exec-f51119ee-1963-405d-ae6d-9dbe88251441.png | 正面重装待机、踏步、冲跑与跃起16帧 |
| anim_rail_butcher_side_motion | exec-5fe28779-2c50-46f5-924e-4ab89d3e0cbd.png | 严格朝右侧视运动16帧 |
| anim_rail_butcher_back_motion | exec-9c33fefb-fb76-4abc-855f-28d2ceb844a7.png | 背视运动16帧，后装甲与压缩罐遮住正面面罩 |
| anim_rail_butcher_front_combat | exec-130e6fa6-b403-40de-8ebb-d0f2426581a9.png | 正面锯击、受击、倒下与磁轨开火16帧 |
| anim_rail_butcher_side_combat | exec-341961af-61c2-4840-8584-9e91248d8150.png | 朝右战斗16帧；由棕色渐变候选定点重制背景 |
| anim_rail_butcher_back_combat | exec-0f7b265d-4718-4d59-b8b8-06e5dfd66e82.png | 背视战斗16帧，炮口朝屏幕上方远端 |
| anim_rail_butcher_saw | exec-5f455b4f-998c-42c4-9fdf-a171257798e7.png | 正/侧/背三行回转锯动作12帧 |
| anim_rail_butcher_drag | exec-305f6bbd-4880-408a-bafd-fae802e2c9df.png | 正/侧/背三行磁极拖拽12帧；缩小重排修正版 |

身份约束：massive squat bipedal industrial rail butcher mech，磨损暗枪铁装甲、橙色警示板、洋红能量管、低矮面罩和两条重腿；右臂只有一门长磁轨炮，左臂只有一把巨大橙色圆锯。侧面严格朝右；背面显示压缩罐、线缆脊和武器背侧并完全遮住正面面罩。禁止额外手臂、复制或缺失武器、游离锯片、地面投影、目标和场景。

运动与战斗各用4×4，行序分别为idle/walk/run/jump与saw-strike/hit/defeated/zero-range-rail-shot。回转废锯和磁极拖拽各用4×3三方向表。所有攻击/技能第三帧为事件峰值；磁轨动作只保留炮口相连的短闪，场地双锯、980速度贯穿弹和拖拽箭头继续由程序生成。侧面战斗初稿`exec-ab94b7c0-aada-4e35-be22-a4b26316be33.png`带棕色渐变，未直接入库；磁力拖拽首稿`exec-a63b5bdc-951a-4ef2-bd4d-5c3b5507a9da.png`的相邻电弧相连，导入器拒绝后由ImageGen缩小并增加安全格距。最终八份报告均为零边界像素。

## 葬钟吞噬者（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_bell_devourer_front_motion | exec-7ce376a5-b072-4c56-adb7-87587005a6e6.png | 正面悬浮待机、缓行、疾进与升降16帧 |
| anim_bell_devourer_side_motion | exec-e7c9d530-ce92-4f84-9842-1cf751ca5cc8.png | 严格朝右运动16帧 |
| anim_bell_devourer_back_motion | exec-35e32bac-33b7-4a76-9324-28d2ceb844a7.png | 背视运动16帧，封闭背甲遮住正面钟腔 |
| anim_bell_devourer_front_combat | exec-83d67fa1-b8e8-4ee8-ac66-4cf27e8e4d3b.png | 正面钟锤攻击、受击、倒下与六连钟响16帧 |
| anim_bell_devourer_side_combat | exec-dbc12238-9aa5-465c-939b-41d13d055f99.png | 朝右战斗16帧；替换偏正面的首稿 |
| anim_bell_devourer_back_combat | exec-3df71c7e-9581-4cc5-a217-01860872ceea.png | 背视战斗16帧，钟响能量从远端开口释放 |
| anim_bell_devourer_echo | exec-9736b31d-035d-41bf-86d5-d7b25d586a72.png | 正/侧/背三行回声记录与倒放12帧 |
| anim_bell_devourer_silence | exec-8b301f6c-2dd8-4559-b595-8472078f87d2.png | 正/侧/背三行静默闭钟12帧 |
| anim_bell_devourer_counter | exec-9b44f304-278e-458f-bee5-929d890797dc.png | 正/侧/背三行吞音蓄积与反震12帧 |

身份约束：heavy hovering bell devourer miniboss，由黑曜石和旧金色构成的活体葬钟甲壳、中央钟腔、单枚悬挂钟锤、两只镰形机械臂和底部紫色能量缝组成。侧面严格朝右；背面以封闭脊甲遮住正面钟腔，只留边缘能量缝。禁止人脸、人腿、额外手臂、复制钟锤、游离钟环、地面投影、玩家轨迹或目标。

运动与战斗各用4×4，行序分别为idle/walk/run/jump与bell-strike/hit/defeated/six-rings。回声、静默和反震各用4×3三方向表，第三帧为`cast`峰值。六连钟响只画与钟腔相连的短金色振动，真实六圈声波由程序分相生成；回声只画体内紫色逆流，真实玩家轨迹由程序记录和倒放；静默只闭合钟甲，165像素罩体由程序绘制；反震只表现钟腔由吸音暗化到金色爆发，1至3圈反震继续按吸收量由程序生成。

侧面战斗首稿`exec-5817aad1-76d9-42cf-8924-138023bfed59.png`偏正视，未入库；回声首稿`exec-a3a9ce30-07de-404f-bc91-23431949bcdc.png`有错误黑底和紫色拖抹，定点重制后才入库。九张最终稿均使用纯洋红边缘连通色键和`isolatedGrid`，共132个物理帧，九份报告的总边界像素和单格最大边界像素均为0。

## 废土领主·腐肉（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_boss_ch1_front_motion | exec-8d15c306-29af-41f2-8c69-8fc73c557e09.png | 正面待机、重步、暴走与跃起16帧 |
| anim_boss_ch1_side_motion | exec-df45f61f-7520-4ab4-b296-49c751ebcdaf.png | 严格朝右运动16帧 |
| anim_boss_ch1_back_motion | exec-ef0108e1-d4f4-43ca-ba95-37b4e44145c6.png | 背视运动16帧，伤疤背脊与药罐遮住胸核 |
| anim_boss_ch1_front_combat | exec-8ea56df0-a91a-4112-986c-cb2f6dc25ee3.png | 正面毒爪近击、受击、倒下与毒球蓄发16帧 |
| anim_boss_ch1_side_combat | exec-29e1416e-1edc-45b8-9101-1a95616e6c8c.png | 朝右战斗16帧；毒液改为与巨爪相连的短喷口 |
| anim_boss_ch1_back_combat | exec-b56f98a7-1953-4f21-ba0a-e6b620f6aa30.png | 背视战斗16帧；由异常透明画布候选重制 |
| anim_boss_ch1_charge | exec-5980348d-4e59-4950-a644-970c3efa3e05.png | 正/侧/背三行重装冲锋12帧 |
| anim_boss_ch1_summon | exec-e4f6c556-4ebb-4ff4-95dd-27ef951c23fc.png | 正/侧/背三行废土召集12帧；缩小重排修正版 |
| anim_boss_ch1_phase | exec-0a901ad8-d449-48ae-b158-9dc983e3a093.png | 正/侧/背三行药罐加压与阶段暴怒12帧 |

身份约束：asymmetric wasteland mutant warlord，左侧只有一只巨大骨甲三趾毒爪并长有绿色脓囊，右侧是较小的正常拳臂与锈铁护腕；鹿角骷髅面、红眼、胸口橙色熔核、破旧棕色腰布、两条粗腿、背部化学药罐和单侧带刺铁肩甲。侧面严格朝右；背面用缝合伤疤背脊、交叉皮带、药罐和后摆遮住面孔与胸核。禁止左右互换、复制巨爪、多肢、游离毒球、召唤小兵、地面判定圈或碎肢。

运动与战斗各用4×4，行序分别为idle/walk/run/jump与claw-strike/hit/defeated/poison-volley。冲锋、召唤和阶段变化各用4×3三方向表，第三帧为`cast`峰值。毒球身体帧只保留巨爪与药罐相连的短绿光，三发220速度毒球由程序生成；召唤只表现握拳与胸核/药罐脉冲，1至3名小兵继续由程序生成；冲锋只表现压身和爆发步，真实速度与撞墙反弹沿逻辑向量计算；阶段变化只强化既有器官发光。

侧面战斗首稿`exec-c131497c-cb61-4f30-8dc8-497c2dddf03a.png`在毒球峰值画出长射流和独立弹体；背面战斗首稿`exec-b5cb3916-0435-4c83-bc6d-b0657ca08982.png`尺寸异常且透明底不规则，两张均经ImageGen定点重制。召唤首稿`exec-410119f9-927e-45d8-b869-aaec63bd27cb.png`的主体跨越行界并被普通切片截断，未入库；最终稿缩小20%并把每格完整主体重新隔离。九张成品共132个物理帧，全部导入报告边界像素为0。

## 钢铁之王·熔炉（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_boss_ch2_front_motion | exec-c919bd68-8789-4902-a2bd-978dff0d5ada.png | 正面待机、重步、冲跑与跃起16帧；由过大候选缩小重排 |
| anim_boss_ch2_side_motion | exec-205fbbe6-f2f4-4062-be0b-1f5ca7047cad.png | 严格朝右运动16帧；使用1402×1122非方形网格单独标定 |
| anim_boss_ch2_back_motion | exec-8b85aa35-3686-4a17-ab9f-9daaae6369b5.png | 背视运动16帧；封闭炉背与四根烟囱遮住胸炉 |
| anim_boss_ch2_front_combat | exec-0f99d392-c290-4039-b1c4-525a0bedd7dc.png | 正面锤拳、受击、熄炉倒下与齿轮齐射16帧 |
| anim_boss_ch2_side_combat | exec-c8e09eea-a12b-45be-9def-6b195fa0fc88.png | 朝右战斗16帧，拳击和短齿轮火花保持贴合拳套 |
| anim_boss_ch2_back_combat | exec-0b29a010-412b-4bd9-9c41-8ad594ca772a.png | 背视战斗16帧，技能只强化背部炉排和拳套 |
| anim_boss_ch2_charge | exec-0bc15a7e-ca22-4bc4-8cd1-c06572579020.png | 正/侧/背三行熔炉冲锋12帧；缩小修复背面脚部裁切 |
| anim_boss_ch2_summon | exec-7d319433-bfaf-4ad9-bc05-116fb73eb198.png | 正/侧/背三行锻造召集12帧；去除游离齿轮图标 |
| anim_boss_ch2_phase | exec-bb30499c-ea85-47e3-84a7-654bf1a3f7df.png | 正/侧/背三行炉心过载12帧；缩小修复底行裁切 |

身份约束：massive symmetrical blackened iron humanoid furnace golem，胸口是明亮橙色六角炉心，头部只有窄橙色视窗，恰好两只巨大矩形锤拳、两条块状重腿和背后四根燃烧烟囱，并带磨损金铜包边。侧面严格朝右；背面以封闭炉背、铆接脊板和四根烟囱遮住胸炉。禁止多臂、手持武器、游离齿轮、召唤小兵、地面判定圈或场景物件。

运动与战斗各用4×4，行序分别为idle/walk/run/jump与hammer-strike/hit/defeated/radial-gear-volley。冲锋、召唤和阶段过载各用4×3三方向表，第三帧为事件峰值。身体帧只表现拳套、炉心和烟囱的机械动作；真正的放射齿轮弹、冲锋位移、召唤单位与阶段数值继续由程序生成。最初三张运动稿主体过大，冲锋与阶段稿底行脚部触边，召唤稿有游离齿轮；均经ImageGen缩小、重排和去除游离物后再导入。最终九张稿共132帧，所有画布边缘透明度为0。

## 海克斯异变体·无限核（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_boss_ch3_front_motion | exec-ec9eda1d-a4de-49b9-9a51-e88ac92b8383.png | 正面悬浮待机、巡移、追击与升降16帧 |
| anim_boss_ch3_side_motion | exec-d34d92ac-2696-4eb5-9fa3-994d79148177.png | 严格朝右的悬浮运动16帧 |
| anim_boss_ch3_back_motion | exec-a3041dec-2764-4f45-b10b-572733c60305.png | 背视运动16帧，闭合晶甲遮住胸部无限核 |
| anim_boss_ch3_front_combat | exec-a93df9d0-e19a-4904-be4e-ddfaefe1651d.png | 正面双爪接触、受击、蜷缩倒下与追踪核蓄发16帧 |
| anim_boss_ch3_side_combat | exec-310eb8c2-5d18-4989-bef9-70d9d6856dcb.png | 朝右战斗16帧，短释放闪光连接前端手核 |
| anim_boss_ch3_back_combat | exec-a1e11e5e-9197-4a50-aa3f-c5b472b32e0a.png | 背视战斗16帧；以黑底候选定点重制纯洋红背景 |
| anim_boss_ch3_charge | exec-abe35124-6d57-49a4-8ed7-ca76134840f0.png | 正/侧/背三行晶核冲锋12帧 |
| anim_boss_ch3_summon | exec-ca2be403-fc94-4de5-a2de-9c8586dd3b20.png | 正/侧/背三行核脉召唤12帧，不画召唤物 |
| anim_boss_ch3_phase | exec-7bea6346-e9aa-4002-ae1f-f421915900de.png | 正/侧/背三行无限核过载12帧 |

身份约束：colossal hovering Hex Mutant Infinite Core，无脸青色晶甲兜帽、旧金支架、胸口青色六角核与洋红递归内核、恰好两只通过能量肌腱连接的长爪臂；正面左爪嵌一枚洋红球，右臂嵌一枚青色球，底部只有分节螺旋悬浮尾，不长腿。侧面严格朝右；背面以闭合晶甲遮住正面胸核。禁止额外手臂、游离晶片、独立飞弹、长光束、地面效果或目标。

运动与战斗各用4×4，行序分别为idle/walk/run/jump与claw-strike/hit/defeated/homing-core-shot。冲锋、召唤和阶段过载各用4×3三方向表，第三帧为事件峰值。身体帧只画与手核相连的短释放闪光，单发300速度追踪弹、冲锋位移、召唤单位和阶段数值由程序生成。背面战斗首稿为黑底且尺寸异常，使用ImageGen保留动作结构并重制背景；最终九张稿共132帧，所有输出边缘像素为0。

## 混沌深渊·终焉之门（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_boss_ch4_front_motion | exec-5cb06c13-8d06-4300-9d96-3b98995314c7.png | 正面门环待机、浮行、追击与升降16帧 |
| anim_boss_ch4_side_motion | exec-811fd7cf-890e-45d0-b3dc-b9a1a74a6245.png | 朝右运动16帧；由黑底候选定点重制背景 |
| anim_boss_ch4_back_motion | exec-a2d4c90e-a5fd-4392-b4c1-9ce883e5c9d7.png | 背视运动16帧，中央只露紫色螺旋 |
| anim_boss_ch4_front_combat | exec-bde13c26-f84c-498a-94fd-766bd4dfce36.png | 正面触腕近击、受击、闭门倒下与混沌蓄能16帧 |
| anim_boss_ch4_side_combat | exec-6304c859-7977-48c4-be7e-657be8c7f23f.png | 朝右战斗16帧；使用实际侧向轮廓候选并修正黑底 |
| anim_boss_ch4_back_combat | exec-e1888929-b24b-4d33-af45-adf684b07a53.png | 背视战斗16帧；保留紫色旋涡并修正黑底 |
| anim_boss_ch4_charge | exec-0eb52013-6fb6-4351-8d1d-df00e61d409c.png | 正/侧/背三行门环冲锋12帧 |
| anim_boss_ch4_summon | exec-3d2565e9-5a7c-4bdc-b219-63099c626071.png | 正/侧/背三行终焉召唤12帧，不画召唤物 |
| anim_boss_ch4_phase | exec-94680ede-723a-4a1c-91c8-3a3e5fed6990.png | 正/侧/背三行深渊过载12帧 |

身份约束：floating circular obsidian-and-antique-gold final gate，正面中央黑紫虚空只有一道竖直橙眼，恰好四条粗壮装甲触腕以金色弯爪收尾，上方只有一枚贴近主体的浮动角冠；无腿、无人体头颅。侧面为椭圆门环并朝右；背面只显示紫色旋涡，不露正面橙眼。浮冠是固有身体组件，必须与主体一起装箱。禁止额外触腕、独立弹体、长光束、召唤物、地面法阵或场景。

运动与战斗各用4×4，行序分别为idle/walk/run/jump与tentacle-strike/hit/defeated/chaos-volley。冲锋、召唤和阶段变化各用4×3三方向表，第三帧为事件峰值。十二发随机混沌弹、冲锋位移、召唤单位和阶段数值仍由程序生成。侧向移动、正面战斗和背面战斗初稿出现黑底；全部用ImageGen定点重制为纯洋红背景。最终九张稿共132帧，所有输出边缘像素为0。

## 机械高达 X 剑士（9月5日续）

| 目标图集 | ImageGen源文件 | 使用情况 |
|---|---|---|
| anim_boss_mech_front_motion | exec-46be2f0c-fe9f-4fc9-b0e7-86622d5ad0b4.png | 正面待机、重步、推进与升降16帧；缩小重排修正版 |
| anim_boss_mech_side_motion | exec-8eb0d1a9-bb55-4ed2-a08c-3a1264d0ff2d.png | 严格朝右运动16帧；缩小重排修正版 |
| anim_boss_mech_back_motion | exec-b137e789-36c7-4db6-be0d-7d366a80b3fb.png | 背视运动16帧，两枚橙色推进器清晰可见 |
| anim_boss_mech_front_combat | exec-f7f21f86-d517-4ddd-ab35-68deb00dbe4d.png | 正面双刃接触、受击、断电倒下与横劈16帧 |
| anim_boss_mech_side_combat | exec-2a5db049-40d7-47ff-940d-c05c7f60d3aa.png | 朝右战斗16帧，横劈短弧连接前臂光刃 |
| anim_boss_mech_back_combat | exec-bf3d15b9-db35-4747-a9ef-bff532595573.png | 背视战斗16帧，正面胸部反应堆不可见 |
| anim_boss_mech_front_skills | exec-130a3ee3-cd98-4a53-9eb5-6673bb17d727.png | 正面刀刃风暴、光剑强化、空降落地12帧 |
| anim_boss_mech_side_skills | exec-38fbc931-ce9f-4fb1-b569-e42cde7f7a05.png | 朝右三技能12帧 |
| anim_boss_mech_back_skills | exec-cda965ae-bd3c-4f1e-b848-c98c84ab53ad.png | 背视三技能12帧 |

身份约束：massive white-and-dark-gunmetal bipedal combat mech，钴蓝饰条、两侧宽肩上的蓝色十字、背后恰好两枚橙色圆柱推进器、正面单枚橙色圆形胸部反应堆、恰好两臂两腿和两把连接前臂的青色能量刃。侧面严格朝右；背面显示双推进器并遮住胸核。禁止多肢、第三把武器、游离刀刃、独立弹丸、地面判定圈或额外角色。

运动与战斗各用4×4，行序分别为idle/walk/run/jump与double-blade strike/hit/defeated/horizontal slash。每个方向的技能表用4×3，三行分别为blade storm/lightsaber buff/sky-dive landing，第三帧为`cast`峰值。风暴弹体、横劈扇形和空降伤害圈继续由程序生成；身体帧只保留与光刃、推进器或落地点相连的短能量反馈。黑底且主体过大的首批正面、侧面运动稿未入库，使用ImageGen缩小并重制纯洋红背景后才装箱。九张成品共144帧，所有报告的边界像素为0。

## 深海恐惧（9月5日续）

最终入库源文件：运动正/侧/背依次为`exec-c8ea45f5-20ff-4700-8c4d-f4be0508fad7.png`、`exec-955f5119-edb7-41a0-afd8-956bd8d40e66.png`、`exec-3649f4de-9c5e-4e1f-acd1-672b0a05f25f.png`；战斗为`exec-20cd4ea2-4907-42f0-9ccf-dd74fcdda7f1.png`、`exec-f16fa249-370e-4536-a60f-763145e02a21.png`、`exec-d8b239e3-bf68-4cde-aeec-4934550ec07f.png`；高级技能为`exec-cf874ea1-71ba-4dd7-b1ba-f71082823d9f.png`、`exec-595f22e5-ed79-4235-ad7f-218fca7952d2.png`、`exec-c1bb8d0f-83a7-4504-b551-d5a1f29da59e.png`。

身份约束：无腿深海利维坦，深海蓝紫甲壳、分叉角冠、无脸青色头焰、正面单枚青色胸核、恰好六条带青色吸盘的粗装甲触腕；侧面严格朝右，背面以闭合脊甲遮住面孔与胸核。运动/战斗/高级技能均为4×4；高级四行依次为水柱风暴、冻结区域、水分身、召唤鱿鱼。禁止人体四肢、额外触腕、独立水刺、远端水柱、地面冻结圈、第二具分身或实际鱿鱼。九张成品共144帧，边界像素为0。

## 疫晶跳蛛·维斯帕（9月5日续）

九张最终源稿：正面`exec-6169f223-0d52-47de-976f-be878e994353`、`exec-ab79fabb-27fa-4d2a-9f2c-02a6bd5e730d`、`exec-a58ce594-bd22-4fa3-98a4-65de14f97e71`；侧面`exec-d8599202-942f-4e91-b5dd-72fe3c059131`、`exec-c5b0a664-baa1-4a90-9a73-2c7037c4993f`、`exec-5eda29f6-fb05-4898-86a2-8222bf76a553`；背面`exec-9c3647fb-9fdd-4ed4-8fa3-0f7e7f264e0a`、`exec-3b2f95da-219b-47fa-a732-ee1574c0e27b`、`exec-54f8746b-4a0f-4f13-8595-d79050795c90`。身份固定为八腿机械蛛：四条青晶刃腿、四条蓝簧钢腿、绿色六角母囊、低伏头部七枚洋红复眼和双绿螯。技能行依次为三段弹跳猎杀、母囊毒雨、活卵债务、蜕晶假死；战斗第四行为六角蛛网。禁止额外腿、远端网、毒雨滴、卵或幼蛛。共144帧，边界像素为0。

## 磁潮坩埚城兽（9月5日续）

九张最终源稿：正面运动、战斗、技能依次为`exec-5783a0cd-134e-46a8-893c-ecbe074a2036`、`exec-588a9335-8929-49b1-a864-e9baaee6f549`、`exec-0dce993f-c699-4a28-be2a-961993cef785`；侧面为`exec-0c9d4a9f-77fe-484c-a67d-5195d5de57b0`、`exec-d5765a32-acee-4d3e-bba4-b533d1e16b32`、`exec-3ea26ba9-7db5-4cf4-984b-82409d074386`；背面为`exec-24042c2e-6872-41f4-ae06-00d7df499e6d`、`exec-52a58e2d-95c0-418f-a726-782b939490f0`、`exec-36195681-e7c4-4c62-8aff-85d5b3497729`。正面战斗初稿底行足部触边，定点缩小重排后才入库。

身份固定为低矮六角黑铁/焦铜移动熔炉：正面单枚开放橙色熔融六角炉芯、恰好四条三趾承重腿、恰好三条顶部铸造机械臂和数根短烟囱，无人体头部。侧面严格朝右，背面用封闭炉板遮住开放炉芯。运动/战斗/高级技能均为4×4；战斗第四行为双色磁极，高级四行依次为三臂活塞锤击、废料回收、钢坯成形、核心回流。禁止额外足、额外机械臂、远端炮弹、独立废料或地面判定圈。白色分格线通过只删除贯穿画布的连通白网格处理，主体内部炉火高光保持不变。共144帧，边界像素为0。

## 折界裁缝·万相（9月5日续）

九张最终源稿：正面运动、战斗、技能依次为`exec-879bf537-b5ec-438f-8061-da05b6f0ca11`、`exec-711009f5-10ca-42b0-8c1d-a76e307dfe04`、`exec-560e9248-7997-48a2-a7c3-4dfaf70e551c`；侧面为`exec-86b3cf5d-56ca-4b2c-929c-8e842ff2e212`、`exec-46d0f0b7-9adb-4d35-bfe0-97a3387bbb0b`、`exec-87451caf-1119-4fd3-b7cf-a8b8c298bbef`；背面为`exec-4e3e647d-cd41-4f2c-976d-a92a0e2b30d7`、`exec-462e6079-4e81-4854-a670-636f7bd3447c`、`exec-7b0be2fb-3389-42a6-8c45-fe65286f4407`。侧面高级技能首稿正视漂移，改用合格侧面运动/战斗稿共同约束后重制。

身份固定为无头悬浮黑曜线轴：深紫空间丝、旧金关节、正面单枚金色纵瞳、恰好六条镜片状缝界针肢。侧面严格朝右且纵瞳只露右缘；背面为封闭轴壳，不露纵瞳。运动/战斗/高级技能均为4×4；战斗第四行为对岸缝线，高级四行依次为折面迁跃、借影裁片、六面缺口、边界收针。禁止额外针肢、人体头脸、远端飞针、独立剪影、地面扇区或边界锚点。场地机制只由程序生成。共144帧，边界像素为0。

## 薇薇安炮台开火（9月5日续）

最终入库源稿为`exec-a5f446b7-bfab-4c4c-ab0e-89fa4202b397.png`。以现有`turret_barrel_vivian.png`为严格模型参考，生成4×4纯洋红底图集；每行重复同一四帧动作：待机、双管充能、双枪口峰值与复位余辉。固定暗枪铁/银色圆形枢轴、双水平炮管与青色灯带，枢轴始终位于单格宽度约36%、高度50%。禁止独立弹体、额外炮管、地面、投影、文字或分格线。成品只登记首行4帧，其余三行保留为同动作生成样本；枪口火焰必须连接双管末端，机械主体不得变形。

## 凯尔专属E/R（9月5日续）

- 弹幕模式E：`exec-24622fcc-898e-47c1-b281-1b5e796056cb.png`，入库为`anim_kai_skill2`。
- 核心过载R：`exec-43d55639-77fc-400d-b212-2a62798ce5e3.png`，入库为`anim_kai_skill3`。

两张均为4列×3行，行序固定正面、严格朝右侧面、背面，列序为准备、蓄能、`cast`峰值、复位。身份约束为短黑发青年、暗枪铁战术重甲、银色护板、青色灯和唯一一门青色双管义肢炮；必须恰好两臂两腿，不得新增枪械。E只表现架炮与通风环增亮，不画弹体；R只允许能量连接胸甲、护甲风口和炮管，30枚追踪弹不烧录进身体图。两张成品共24帧，边界像素为0。

## 薇薇安专属E/R（9月5日续）

- 超频指令E：`exec-68cbaf10-173c-4860-b116-fd95b8de35d0.png`，入库为`anim_vivian_skill2`。
- 炮台风暴R修正版：`exec-87d830dc-3e38-4e1c-be9e-73fc0aec518e.png`，入库为`anim_vivian_skill3`。
- 未入库R候选：`exec-adbdbccf-e4f4-43f8-8fb0-1eeed541c6c4.png`，头顶六边形环跨入相邻动作行。

两张成品均为4列×3行，行序为正面、严格朝右侧面、背面，列序为准备、输入、`cast`峰值、复位。身份约束为蓝色高马尾女工程师、深蓝/枪铁轻甲、粉青灯带、手持遥控器和恰好两架白蓝肩侧无人机；必须恰好两臂两腿。E只表现遥控器与无人机超频亮起；R只允许胸前、手臂和无人机之间出现紧凑六边形指令能量，不画实际炮台、轨道炮、弹体、地面法阵或跨格部件。两张成品共24帧，边界像素为0。

## 雷克专属Q/R（9月5日续）

- 怒冲Q最终稿：`exec-fde1efde-b0ad-459e-a40e-f7e307efd376.png`，入库为`anim_reik_skill`。
- 死亡意志R最终稿：`exec-013a5291-648d-4036-9241-3b5ff8385848.png`，入库为`anim_reik_skill3`。
- 未验收候选：Q初稿`exec-ebc3bf97-f651-4141-aa5f-8ecec48a667f.png`斧光跨列；R初稿`exec-a58c569e-8dcc-4f5d-bde8-57d38adf9a53.png`背面第二帧露出正脸；背面修正版`exec-b5e14043-f7f5-409d-a395-08583618005c.png`的爆发双斧跨行。

两张成品均为4列×3行，行序为正面、严格朝右侧面、背面，列序为准备、爆发前摇、`cast`峰值、复位。身份固定为黑短发黑胡须壮硕男性、黑/枪铁重甲、发红光的甲缝、长暗红棕色毛皮披风及恰好两把连接手臂的双头战斧。Q只允许连接斧刃的短红色拖痕；R只通过姿势和贴身红光表现血契增益。禁止独立弹体、远端冲击波、地面圈、敌人、额外武器或跨格部件。最终稿整体缩小约18%以保留格间安全区，共24帧，边界像素为0。

## 奥莉亚专属Q/E（9月5日续）

- 时空切割Q最终稿：`exec-fb0cd7ef-c5d0-4a0f-8b53-11f80dab308b.png`，入库为`anim_olia_skill`。
- 切换形态E：`exec-a6d82b78-58bd-4418-905b-6ecf927ae7ee.png`，入库为`anim_olia_skill2`。
- 未验收Q候选：`exec-7b5d5e1a-2018-4fa6-94d1-07e47624f04e.png`，第三帧腕刃跨列并在复位格留下残片。

两张成品均为4列×3行，行序为正面、严格朝右侧面、背面。身份固定为冰白长发女性、海军蓝长开衩外套、银黑贴身甲、青色发光滚边和双腕紧凑时核装置，恰好两臂两腿，不持手枪。Q列序为准备、压缩残影、右腕单刃斩击和返回；E列序为远程姿势、双腕汇能、右腕单刃成形和近战姿势。能量刃必须连接右腕且不得跨格；禁止第二把刃、独立弹体、远端传送门、地面圈、敌人或场景。R继续使用既有腕部时核上举稿，不重复生成同义动作。两张新稿共24帧，边界像素为0。

## 格雷夫专属E/R（9月6日续）

- 词条重组E：`exec-087a7bfb-9615-47b7-8766-716dd7832318.png`，入库为`anim_graf_skill2`。
- 混沌爆发R：`exec-1ee778a2-f942-40cb-911a-a5fb50a87749.png`，入库为`anim_graf_skill3`。

身份固定为黑色多面石甲混沌傀儡、紫色甲缝、两枚竖直晶角、两臂两腿和正面单枚螺旋胸核。E符面必须以短能量线连接胸核与双掌；R只让甲缝、胸核和双角过载。背面不露正面胸核，禁止词条卡片、文字、远端符文、额外肢体或场景。

## 莉安娜专属E/R（9月6日续）

- 冰场领域E最终稿：`exec-cf561791-7c70-4764-a4a6-e1124164e6e1.png`，入库为`anim_liana_skill2`。
- 绝对零度R最终稿：`exec-47ccc6c9-282c-43b8-be77-1d7ecbad6de5.png`，入库为`anim_liana_skill3`。
- 未验收初稿：E为`exec-d15df79f-64d7-4a67-a576-3ab033cbcc93.png`，R为`exec-e2d7f8a5-3d1e-4c00-8a8b-960b2c1f6793.png`；长枪或定位晶体跨格。

身份固定为白色兜帽与长白发/围巾、黑蓝贴身甲、青色冰晶肩饰以及唯一一把连接双手的蓝色长狙击枪。E只画与枪口相连的小型定位晶体；R只画贴附长枪与身体的寒霜。禁止独立弹体、远端冰区、全屏冰浪、额外枪械、敌人或场景。最终两张新稿共24帧，边界像素为0。

## 残留静态特效四帧化（9月6日续）

- 法阵/雷克特效源：`exec-89eb2e0e-c021-4da8-97a9-58eaba36296c.png`，入库为`anim_fx_runic_reik`。四行依次为六角激活、双斧熔岩斩、钢铁战吼冲击环、死亡意志血怒场；每行从弱前摇、展开、峰值到消散。
- 敌方/通用特效源：`exec-f183aad7-05fa-4b46-968c-72447432577b.png`，入库为`anim_fx_enemy_impacts`。四行依次为葬钟声波、余烬烙印、通用命中爆点、点燃火焰。

两张源图均为1254×1254透明RGBA、4×4等分网格，按整张等比缩放为1024×1024运行时图集，不逐格裁边或重心居中。每格保持同一中心锚点和充足透明边距；最终32格边界像素为0。禁止角色、场景、UI、文字、数字、棋盘格或不透明底色。
