# 英雄选择页与图鉴专用展示原画

2026-10-23：新增八张 `assets/resources/art/ui_hero_display_<id>.png`，均为 1254×1254 高清卡通半身原画。通过内置 image_gen 分别生成，参考 `../hero-redesign/masters/<id>.png` 的已定稿身份、装备和动画比例，并以凯尔首张展示原画统一后续七人的笔触与构图。原有战斗图、动画图集和 HUD 图像继续作为独立资源保留。

## 设计与接入

- 凯尔：黑色乱发、蓝黑分层装甲、青色右臂炮。
- 薇薇安：蓝短发、护目镜、蓝色工程装甲、遥控器。
- 雷克：成年胡须、黑红重甲、赤色双斧。
- 奥莉亚：白长发、简洁动画脸、藏蓝时序战衣、钟表装置。
- 格雷夫：紫黑石甲、晶体肩甲、胸前漩涡核心。
- 利亚娜：白色雪花兜帽、冰晶护甲、长管狙击枪。
- 薇娅：女性、深蓝长发、黑金星纹战衣、蓝色短刃。
- 莫提斯：白短发、骨饰黑袍、绿晶法杖。

选英雄主卡与英雄介绍弹窗显示完整正方形构图；名单小卡与图鉴英雄卡显示顶端对齐的头肩区域。`PortraitArt.ts` 以 `SpriteFrame.rect` 的有效图像区域计算等比尺寸，配合圆角 Mask 裁切。所有图片通过 `loadArtSprite` → `artPath` 加载。敌方单位保留完整本体，并排除导入器记录的透明留白，使用同一视口的 contain 模式；低分辨率本体最多以原尺寸显示，避免强行放大模糊，禁止横竖独立拉伸。

## 生成提示词

完整提示词、每张引用图与输出位置见 [prompts.json](prompts.json)。

通用提示词：

```text
Use case: stylized-concept. Asset type: finished high-resolution SQUARE hero-selection and codex portrait illustration for Hexblast. Reference 1 locks the ONE character's approved identity and costume; reference 2 gives the game's bold 2D cartoon art direction. Create ONE centered waist-up portrait, NOT a model sheet and NOT a full-body sprite. Clean confident three-quarter view facing slightly toward screen-right, broad animated facial features, natural undistorted proportions, strong dark contour, crisp controlled two/three-tone cel shading, detailed layered armor but no painterly or realistic skin. Framing: square 1024x1024 or higher; complete hair/head with generous 8% top clearance, face centered around x50% y28%, both shoulders comfortably inside 7% side margins, upper chest fills lower half, waist exits deliberately at bottom. Face must remain clearly readable when displayed at 120px wide. Dark blue steel studio vignette background with a restrained accent-color glow and faint industrial shapes; no ground, no UI border, no text, no labels, no watermarks, no tiny full figure, no duplicate views. Preserve character identity, gender, hairstyle, armor colors and signature equipment. This image must be newly illustrated for a premium character display card, not a crop or stretch of the reference sheet.
```

每次追加上述角色身份约束。凯尔参考游戏参考图 A；后续以凯尔本批原画作为第二张风格参考。雷克与奥莉亚的第二参考说明明确写为 `reference 2 is the matching Kai portrait, match its crisp bold 2D cartoon portrait style and framing`。奥莉亚补充 `NO photorealistic face, no delicate rendered skin`；薇娅补充 `adult FEMALE, preserve long hair, NO male face, NO short black male hair`。

## 验收要求

逐个切换八名英雄，检查主卡和底部缩略图；图鉴遍历英雄两页与三类敌方单位；验证原图比例、头部完整、清晰度、卡框遮罩和连续切换时异步加载不串图。几何回归覆盖横图、竖图、方图的等比缩放以及顶端对齐裁切；资源检查验证八张高清 PNG 的尺寸与 meta 一致。

## 本批实机结果

在 Cocos Creator 3.8.8 Web Desktop 构建中逐个切换八人，检查 1280×720 的主卡、小卡与图鉴；另以 1762×983 检查雷克页面。下面均为真实运行截图。

| 英雄 | 主卡与全部小卡 |
| --- | --- |
| 凯尔 | [实机截图](qa/select-kai.png) |
| 薇薇安 | [实机截图](qa/select-vivian.png) |
| 雷克 | [实机截图](qa/select-reik.png) |
| 奥莉亚 | [实机截图](qa/select-olia.png) |
| 格雷夫 | [实机截图](qa/select-graf.png) |
| 利亚娜 | [实机截图](qa/select-liana.png) |
| 薇娅 | [实机截图](qa/select-via.png) |
| 莫提斯 | [实机截图](qa/select-mortis.png) |

补充证据：[大窗口选英雄](qa/select-reik-large.png)、[英雄介绍弹窗](qa/select-reik-detail.png)、[图鉴英雄第一页](qa/final-codex-heroes.png)、[图鉴英雄第二页](qa/codex-via.png)、[首领](qa/final-codex-boss-1.png)、[小首领](qa/final-codex-miniboss-1.png)、[小兵](qa/final-codex-grunt-3.png)。三类敌方单位共七页已遍历，图片完整落在视口内。

验证：TypeScript 检查通过，Cocos Web Desktop 构建成功。提交前已恢复本地测试桩并按 package-lock 安装依赖，项目命令 `npm test`（688/688）与 `npm run typecheck` 均通过。
