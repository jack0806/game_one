# Hexblast 画风重构方案：A 的造型与画面，B 的亮度

日期：2026-09-30。状态：待实施。

视觉方向：**A 的角色造型、地图和 UI，B 的亮度与可读性**。动画采用分层素材、本地关节与代码动作，特殊动作补少量姿势帧。资源命名、加载、分层、测试和 Git 规则按项目约定执行。

## 1. 最终目标与执行路线

将首页、大厅、任务、图鉴、选人、战斗、商店和结算统一为 **A 的科幻动作卡通风**：圆整而结实的英雄和敌人、清楚的粗轮廓、简化的材质、适度夸张的动作与 A 的界面造型。用 B 作为**亮度和可读性参照**，使战斗场地、单位、警示、技能和文字在实际画面中更易分辨。

制作路线：**风格基准 → 单位设计基准 → 可绑定的分层素材 → 本地动作调试 → 凯尔侧面动作验证 → 第一章完整样机 → 按完整单位与章节扩展 → 全页面和全动作验收**。

GPT 图像生成负责角色设计、分层部件、地图、图标与必要的特殊姿势；文字与代码能力负责清单、拆图规范、关节数据、动作曲线、组件实现、导入和核验。重复动作在本地制作与复用；帧播放器用于特殊姿势和适合烘焙的群怪。

范围覆盖游戏中的角色、敌人、地图、页面、特效和短动画。制作顺序不改变最终覆盖范围。

### 1.1 两张参考的分工与优先级

**A：主风格参考。** 用于角色头身比例、圆整轮廓、装备简化程度、敌人设计、地图和 UI 的整体造型。

![A 主风格参考](style-a/references/reference-a.png)

**B：亮度参考。** 用于明暗层次、主体与背景分离、文字和技能的辨识程度。

![B 亮度参考](style-a/references/reference-b-lighting.png)

制作判定顺序：**造型与布局看 A → 明度与可读性看 B → 以真实游戏尺寸和密集战斗画面验收**。当角色、敌人或警示不清楚时，调整局部亮面和背景分离度并在实机确认。

两图用于视觉校准。正式素材按角色、地图、UI 和特效分别制作；示例中的路面文字、按键占位、怪物数量和血条数值不作为游戏内容要求。

### 1.2 当前项目基线

- 引擎：Cocos Creator 3.8.8；设计画布：1280×720；UI 与实体使用程序化节点。
- `assets/resources/art/` 当前有 466 张 PNG，其中 292 张为动画图集。文件数不等于角色数或制作调用数。
- 角色：6 名英雄。
- `BossDB.ts` 目录：16 种小兵、11 种小 Boss、10 种首领，共 37 种敌方单位；加英雄共 43 种单位。
- 炮台、分身、孵化体等召唤物另列。复用本体的分身可以共享素材；具备独立外形的召唤物需要独立验收。
- 地图：6 章，目前仅 4 张底图，第 5、6 章复用第 4 章。
- 已有 `ActorAnimation`、`ActorAnimationDB`、`EffectAnimationDB`、`SpriteUtils`、动画预览与导入工具，可继续使用。当前身体采用单条全身帧动作；上、下身独立播放需要后续新增表现层支持，不能仅靠换图片实现。

## 2. A 主风格与 B 亮度规则

| 维度 | 制作规则 |
| --- | --- |
| 镜头 | 场地沿用当前顶视战斗坐标；单位使用统一的高位三分之四视角，并提供前、侧、背方向；道具与单位透视一致 |
| 人物比例 | 沿 A 的偏短、结实人形，以约 3–4 头身为设计起点；凯尔等不能变成 B 的细长体态，也避免幼态大头；雷克、格雷夫保持各自重量感，最终按实机尺寸校准 |
| 描线 | 沿 A 的连续、稍粗外轮廓；内部结构线少而清楚；小尺寸不堆零碎装饰或尖锐细刺 |
| 明暗 | 沿 A 的简化块面，采用 B 的可读性目标：抬高中间调与关键主体的亮面，让暗部仍保留结构；统一左上主光，不能把整张图简单加曝光 |
| 装备 | A 式圆整、大块、结实的炮/甲/关节；保留功能性形状，削减高密度铆钉、刀片、尖刺和细纹 |
| 材质 | 平滑哑光装甲、简化布料、清楚的骨甲与晶体块面；少量局部纹理，避免照片感和过度锋利的漫画线 |
| 能量 | 核心、枪口和释放峰值发光；持续光效不吞没身体轮廓 |
| 场景 | 沿 A 的圆整、易辨认设施与地形；中央低纹理、中间调清楚，边缘物件表达章节主题；接触阴影与环境光统一 |
| 特效 | 枪口、弹体、命中、范围边界分层；每个特效有明确起点、峰值和结束 |
| UI | 沿 A 的紧凑科幻控件与较柔和的切角；面板、输入状态和文字达到 B 的清楚程度；少量青色强调，统一字体与间距 |

### 2.1 亮度不是全局提亮

提升角色亮面、敌人识别点、可互动元素与关键 UI 的亮度和分离度；按密集战斗画面校准场地中间调。地图中心保持低纹理，危险红区与青色弹体始终明显。

使用同样英雄、Boss、群怪密度和 1280×720 的截图验收，并检查普通笔记本显示。保留形体阴影，控制特效遮挡；不对整张底图统一加曝光。

基础建议色板（待第一章样机校准）：

| 用途 | 颜色 |
| --- | --- |
| 深背景/边缘阴影 | `#142235` |
| 面板 | `#1B3046` |
| 场地中间调起点 | `#35475D` |
| 钢灰 | `#67798F` |
| 正文 | `#EEF4FA` |
| 次要文字 | `#BBC9D7` |
| 交互/友方基础强调 | `#23D7E8` |
| 危险边界 | `#F56754` |
| 奖励 | `#FFC85C` |
| 治疗 | `#62D39C` |
| 毒素 | `#9BD65E` |

这些是美术起点和局部角色色，场地中间调也不是让背景每个像素都填同一灰蓝。它们不直接覆盖 `CharacterDB` 的身份色或战斗逻辑。六英雄保留各自识别色。敌方冰、毒、电等技能保留元素色，同时使用统一危险边界/形状提示阵营；治疗与毒素通过符号和运动方式区分。

## 3. GPT 的任务分工

| 工作 | 使用方式 | 产物 |
| --- | --- | --- |
| 制作规划 | 文字能力根据当前代码与资源清单整理 | 清单、任务卡、提示词、检查记录 |
| 角色与地图 | 内置图像生成，携带明确参考图 | 设计图、立绘、分层部件、必要特殊姿势、底图与道具 |
| 图标与特效 | 图像生成制作主要形状，本地组合与调参 | 透明 PNG、粒子纹理、必要的独立特效序列 |
| UI 设计 | 先出组件示意或页面参考，再用代码实现 | `UIStyle` 组件与真实节点布局 |
| 字体与数值 | 真实字体资源、Cocos Label | 可读、可更新的文本 |
| 动画 | GPT 制作可复用部件与特殊姿势，本地关节/骨骼和代码完成动作 | 部件图集、关节/动作数据、挂点与事件表、必要帧图集、Tween |
| 质量核验 | 文件检查、画面对照、播放与实机检查 | 接触表、动画预览、验收清单 |

后续默认使用当前可用的内置图像生成工具；无需为这条路线额外配置 API 密钥。可用工具的具体输出能力以执行时为准，记录实际使用的工具与来源，不在方案中绑定一个可能变化的模型名。

官方文档支持以参考图生成、编辑和连续迭代，同时指出多次生成的角色一致性仍可能出现问题。因此固定参考图与检查流程属于生产必需步骤。[OpenAI 图像生成文档](https://developers.openai.com/api/docs/guides/image-generation)

### 3.1 每次出图的输入包

每项任务都带上：

1. A 主风格参考图：只负责造型、轮廓、比例、材质概括和 UI/地图气质。
2. B 亮度参考图：只负责明度层次、主体与场地分离、文字和战斗信息的可读性；明确不参考其细长尖锐设计。
3. 该角色/物件已通过的设计基准：负责身份、装备与比例。
4. 当前动作或布局参考：负责姿势、方向、视角；已有素材只提供必要结构信息。
5. 单项制作目标：例如“凯尔右侧方向的近侧手臂部件，补齐肩部被遮挡区域”。
6. 输出要求：透明度、构图、部件清单、统一尺度、关节重叠区、留白；补姿势时另指定单元格和帧顺序。
7. 验收尺寸与使用场景。

明确标注各图的角色，例如“图 1 是 A 的造型与画风；图 2 仅参考 B 的亮度；图 3 是角色身份；图 4 仅参考姿势”。角色身份图只提供造型信息，材质以 A 参考为准。

每次制作重新提供稳定参考，不依赖模型记住长对话。修正时优先从已通过的基准或当前稿进行局部编辑，保留原稿，记录使用的版本。

### 3.2 小批次与修正规则

- 设计基准：每个对象先产出少量候选，选定一个可读、可动画化的版本。
- 部件制作：一个单位、一个方向、一个明确部件组一批；身体设计通过后固定尺度，只补缺件、遮挡区和确实需要的替换角度。
- 走跑、普通瞄准、后坐、轻受击和跟随动作优先修改本地数据，不向 GPT 重复请求整套动作图。
- 特殊姿势：一个单位、一个方向、一个必要动作一批；只补骨骼难以表现的透视、剪影或变形阶段。
- 不把全单位/全动作塞进一张生成大图。部件图集由已验收部件机械装箱；必要帧图集由已验收姿势组成。
- 同一缺陷连续修正两次仍存在，缩小任务：部件组拆为缺陷部件，特殊动作拆到单帧，或简化装备结构，再制作。
- 局部修正只取需要修正的帧；其余已通过帧继续使用原版本。整图编辑仍需检查是否误改其他区域。
- 风格参考与单位基准保持稳定，未经实际尺寸检查的候选不成为下一批参考。

## 4. 单位设计基准：先统一身份

### 4.1 六英雄的固定设计

| 英雄 | 角色身份 | 造型基准 | 重点 |
| --- | --- | --- | --- |
| 凯尔 | 炮击手、青色能量、义肢炮 | 黑短发、A 式圆整而结实的深色装甲与粗青色炮；侧面示例作为造型起点，使用 B 的亮度目标 | 可见枪口、大装甲块、清晰炮击姿势 |
| 薇薇安 | 工程师、无人机/炮台 | 蓝短发、护目镜、工具装备与遥控器；立绘同步为这一发色 | 固定无人机数量、挂载方式和武器结构 |
| 雷克 | 双斧狂战士、红色能量 | 宽肩、黑发胡须、深色重甲、两把红斧 | 全动作保持双斧；区分蓄力与命中 |
| 奥莉亚 | 时空行者、形态切换 | 白发、深蓝长外套、简化银甲、时空装置 | 两形态同一身份；远近战装备与动作分别规定 |
| 格雷夫 | 混沌傀儡、紫色核心 | 紫黑大块傀儡结构、胸口旋涡 | 用大块结构表达重量，保留空手施法身份 |
| 利亚娜 | 冰霜狙击手 | 白发/白兜帽、深色轻甲、完整冰蓝长枪 | 兜帽与武器一致，枪管不裁切 |

每人建立一份基准卡：全身图、前/侧/背静止姿势、装备结构、发色、主辅色、职业识别点，以及枪口或施法手位置。立绘、头像、战斗精灵、技能图标和动画由这份卡派生。

### 4.2 敌人与首领设计原则

- 普通近战：前倾、爪/武器明显；盾怪：方形稳定；爆炸怪：膨胀圆形与预爆状态；远程怪：发射结构清楚。
- 四足、六足、触手、漂浮单位分别设计动作。步态共用制作方法，不共用人体姿势图。
- 生物质、机械、晶体、虚空使用同一描线与块面标准，通过轮廓、色板、结构区分。
- Boss 保留独有轮廓与机制：腐肉骨爪、熔炉核心、悬浮晶核、门环触手、双剑机甲等。
- 最终灭世机神使用独立的机械主体，造型对应其技能和阶段。
- 每个有机制变化的 Boss 列出阶段/变形设计，避免只替换待机图片。

### 4.3 数量与范围

| 类别 | 必须覆盖的清单 |
| --- | --- |
| 英雄 | kai、vivian、reik、olia、graf、liana |
| 现有基础小兵 | grunt、shield、exploder、golem、elite_grunt、archer、miniboss（暗影猎手） |
| 新文档小兵 | rust_biter、needle_gunner、ember_acolyte、frost_acolyte、acid_sac、rivet_beast、arc_leech、gold_scavenger、blast_tick |
| 小 Boss | squid、turtle、shrimp、jelly、drone_a、drone_s、chain_hound、prism_snail、triune_priest、rail_butcher、bell_devourer |
| 首领 | boss_ch1、boss_ch2、boss_ch3、boss_ch4、boss_mech、boss_abyss、boss_vespa、boss_crucible_city、boss_manyfold、boss_invader |
| 其他 | 炮台、分身、孵化体及其他实际调用的独立召唤物 |

游戏生成 id 与素材 key 不总是相同。制作清单必须记录二者映射，不能直接根据 id 猜文件名。

## 5. 图片、图标与地图的制作规范

| 资源 | GPT 制作方式 | 正式导出要求 |
| --- | --- | --- |
| 英雄立绘/头像 | 由新设计基准派生，同身份不同构图 | 独立透明 PNG；保留与当前 UI 容器匹配的构图，UI 保持图片比例 |
| 战斗静态图 | 每方向单独生成，按实际尺寸比较 | 兼容已有 key；枪与身体完整；基准位置清楚 |
| 身体动画 | 主体分层素材 + 本地关节动作；特殊动作补姿势 | 部件图集、绑定与动作数据；姿势帧兼容现有网格或同步更新帧表；真实透明、固定尺度和枢轴 |
| Boss | 基准、方向、关节部件、必要变形/阶段姿势分批制作 | 同一 Boss 保留体量；机械/触手分层动作，变形专门绘制；技能特效单独输出 |
| 图标 | 共用背景/线条/构图模板，只改变主题 | 图标主体透明，外部卡框由 UI 绘制；32/48/64px 下可辨 |
| 英雄技能图标 | 6×Q/E/R 的身份/机制对应清单 | 原则上 18 个槽位，有意共享须明确记录；新增 key 登记测试 |
| 子弹 | 各英雄独立机制形状，统一漫画边缘 | 完整弹体、统一朝右基准、发射原点；旋转由代码完成 |
| 拾取物/炮台 | 同样使用 A 式圆整、简化的科幻卡通结构 | 透明 PNG；地图地面不烧录拾取物 |
| 静态特效/逐帧特效 | 主要纹理 + 本地粒子/代码；必要漫画形变补帧 | 单独透明层，固定原点，留足扩张空间；不把全部过程交给生成 |
| 标题背景 | 无 UI 的环境插画 | 16:9、建议 2048×1152 或 2560×1440；留出标题与操作空间 |
| 章节背景 | 先做地面/边缘结构设计，再生成可用底图 | 同镜头与光照、无英雄/怪物/UI；建议与标题同分辨率档位 |

尺寸为导出目标，最终以引擎导入、内存和实际显示结果选择。生成工具返回尺寸与目标不符时进行等比例整理；角色不作横纵不等比拉伸。已有动画单格包含 256、320、384、448 等规格，不能全部按 256px 等分。

### 5.1 六章节的视觉规划

| 章节 | 地面与边缘主体 | 环境强调 |
| --- | --- | --- |
| 1 废土街道 | 大块沥青、路缘、废车、检查站 | 锈红/灰蓝，少量青色设施 |
| 2 钢铁工厂 | 大钢板、传送带、熔炉、粗管线 | 炉橙/钢灰 |
| 3 海克斯实验室 | 大块实验地板、容器、核心装置 | 青绿，降低中央电路线亮度 |
| 4 混沌位面 | 低对比破碎平台、边缘裂口、门环 | 紫色局部能量 |
| 5 天罚领域 | 机甲设施、磁轨、巨大机械构件 | 冷蓝/钢灰 |
| 6 终焉天罚 | 崩坏机械平台、最终核心、边缘灾变结构 | 灰蓝/橙红峰值 |

每章先输出适合背景 Sprite 的完整地面与边缘环境。具有碰撞的建筑残骸、机器和立柱作为独立场景物件制作，与逻辑碰撞体使用同一套布局数据；需要遮挡或独立动效时再分层绘制。

第 1–4 章覆盖原同名图片；第 5、6 章新增背景 key 并更新 `WaveData`。中心区域保持低纹理和低对比，按第 2.1 节校准中间调。地图物件是否碰撞由场景数据明确指定，地面装饰不自动产生碰撞。

### 5.2 地图残骸与碰撞场景

每章规划 2–3 套手工校验的障碍布局，在进入该章时从对应布局中选择一套；同一章内保持布局稳定。每套包含少量明显的残骸组，其中 1 组可靠近场地中部，但须留下绕行与 Boss 战空间。首批只做第一章一套布局，验证后再扩展数量。

| 章节 | 可碰撞物件主题 | 布局变化方向 |
| --- | --- | --- |
| 1 废土街道 | 废车、断墙、路障 | 横向车阵、斜向断墙、分散检查站 |
| 2 钢铁工厂 | 炉台、机器、集装箱 | 单侧重型设备、双机器岛、错位传送台 |
| 3 海克斯实验室 | 实验舱、控制台、隔离墙 | 分隔实验台、破损舱室、三角控制岛 |
| 4 混沌位面 | 断柱、门环基座、浮岛残片 | 弧形断柱、偏置门环、散落平台 |
| 5 天罚领域 | 机械装甲、磁轨基座、炮台残骸 | 纵向轨道、双侧机械岛、中央破损机甲 |
| 6 终焉天罚 | 坍塌支架、核心碎块、巨型装置残骸 | 非对称支架、环绕核心、分段废墟 |

**数据与画面**：`ChapterArenaDB` 一类纯数据表记录章节、布局 id、物件 id、逻辑坐标、圆形/矩形碰撞范围、视觉资源、遮挡层与碰撞规则。简单物件先用圆形或轴对齐矩形，不按图片透明像素生成复杂轮廓。视觉主体、接地阴影和有效碰撞范围要对齐，允许少量安全边距。碰撞物件置于游戏世界坐标层；背景会按可见宽度适配并带轻微独立震屏位移，不能仅在背景图上画出残骸再叠一组固定坐标碰撞体，否则宽屏和震屏时可能错位。

**基础规则**：

1. 分为纯装饰、阻挡角色的低矮残骸、同时阻挡角色与弹体的高大残骸。高大残骸是否遮挡自动瞄准和敌方远程射击必须与弹体规则一致；范围伤害、落点技能和飞行单位按机制明确例外。
2. 玩家、普通敌人、Boss 使用各自半径与障碍求解，接触后沿边滑动。冲刺、击退、瞬移、召唤、Boss 位移和玩家复活也必须落在有效区域；图中建筑高度不改变二维碰撞半径。
3. 敌人需要绕行。少量分散障碍先使用局部绕行点或共享的低分辨率导航数据，验证不会在残骸另一侧持续追墙；群怪不逐只每帧计算完整路径。远程单位需能寻找射击位置。
4. 刷怪点、金币/拾取物掉落点、Boss 出场点和危险区不能落入障碍。布局校验包括出生安全区、可通行连通性和最大 Boss 的通道宽度，避免把玩家困在地图角落。
5. 挡弹体的障碍对友方和敌方使用一致的线段扫掠碰撞，避免快速子弹穿过薄墙。普通弹命中消失；穿透、反弹、追踪、爆炸、激光等技能逐项定义撞墙行为，不以角色碰撞规则推断。
6. 障碍轮廓按 A 的圆整科幻卡通风制作，亮面达到 B 的可读性目标；阴影标明落地范围，关键危险预警不能被遮住。残骸只放在明确布局槽，不随机把道具堆满中央。

实施顺序：第一章制作 2–3 个静态残骸物件和一套布局 → 完成玩家/敌人/Boss 的移动与出生校验 → 加入近战绕行和远程视线规则 → 接入友敌弹体与特殊技能 → 做第一章其余布局 → 扩展到各章。第一版不要求可破坏建筑；若后续增加破坏状态，视觉、碰撞与寻路数据须在同一事件中切换。

## 6. UI 与文字：设计图转真实组件

### 6.1 统一组件清单

以 `UIStyle.ts` 为入口扩展：主题色、间距、线宽、切角、按钮、面板、卡片、页头、页签、状态标签、弹窗、数值条与焦点反馈。

| 组件 | 实现方式 |
| --- | --- |
| 面板、框线、按钮、页签 | Cocos Graphics/节点，按尺寸绘制 |
| 血条、护盾、Boss 条、进度 | Graphics，值实时更新 |
| 冷却环、危险范围 | Graphics/现有绘制层，准确表达进度与判定 |
| 文本、数值、说明 | Label + 正式字体资源 |
| 暂停/返回/设置/锁定等简单符号 | 统一代码或矢量造型；沿用项目原生资源方式 |
| 角色头像、技能插画、奖励图标 | GPT 制作独立 PNG，由 Sprite 展示 |

GPT 的整页图用于布局和风格对照。正式页面仍由真实组件构建，文字、按钮与数值独立，不把整页图当 UI 背景替代真实交互。

### 6.2 字体规范

- 中文正文建议采用 Noto Sans SC 静态字体资源，选择普通/中等/粗体形成层级；实施时核对获取来源和项目适用条件。
- 标题建议 30–36，分区 22–26，正文/按钮 16–20，辅助说明 14–16，均为 1280×720 设计尺寸的起点。
- UI 正文不默认加厚黑描边；战斗数字可加适度描边，按尺寸单独核验。
- `LabelUtils` 增加标题、正文、次要说明、数值、战斗飘字等角色样式。文字大小、颜色、字重和行距统一管理。
- 长说明通过换行、扩大内容区、分页或滚动容纳；避免将正文自动缩到注脚尺寸。
- 使用字体资源保证不同设备稳定；图片中不烧录可变化的中文、金币、血量或关卡信息。

### 6.3 全页面迁移清单

| 页面/界面 | 设计要求 |
| --- | --- |
| 首页 | A 式科幻卡通环境、可分离标题/Logo、统一主次按钮与轻动态；按 B 的清晰度检查文字和入口 |
| 存档 | 统一档案卡、状态、提示文字与交互反馈 |
| 大厅 | 统一页头/档案面板/入口；传送门使用分层图与 Tween |
| 任务树 | 统一任务节点、连接、状态与详情阅读 |
| 图鉴 | 新英雄/敌人图片、统一裁切/尺度、未知样本和详情 |
| 成就 | 统一徽章、稀有度、进度与卡片字号 |
| 地图选择/难度 | 与大厅同一页头和导航；地图预览与难度标记 |
| 选人/英雄详情 | 同身份新立绘，统一职业与技能图标，改善长文本布局 |
| 战斗 HUD | 生命/护盾/章节/金币/Boss/技能共用规范 |
| 海克斯强化/普通商店 | 同一战术模块与商品体系、购买状态、刷新和余额反馈 |
| 属性 | 统一数值与词条排版、足够字号和阅读空间 |
| 暂停/设置 | 共用弹窗、滑杆、按钮与焦点态 |
| 失败/通关 | 共用行动报告组件，以局部状态色和奖励区别 |
| 测试房/触控/横屏提示/退出提示 | 同一控件与文字规则，保留各自功能 |

新画像用于不同容器时进行明确的等比适配。战斗精灵的固定画布和枢轴沿用动画体系；立绘使用独立的展示适配，避免混用。

## 7. 动画主路线：少量素材 + 本地关节与代码 + 特殊姿势

### 7.1 方案选择与实施边界

A 的圆整大块造型、清楚轮廓和简化明暗拆成可重复使用的二维部件。动作通过本地姿势、重心、接地与节奏调试；B 的亮度目标用于部件、动作和战斗预览的可读性检查。

| 路线 | 本项目用途 | 成本与限制 |
| --- | --- | --- |
| Cocos Sprite 节点层级 + 本地关节/曲线数据 | 默认先用于凯尔侧面验证；适合刚性装甲、普通步态、枪械后坐与瞄准 | 需要实现绑定、混合、挂点和预览；不自动具有网格变形、成熟 IK 编辑器或复杂约束 |
| Spine 等专用二维骨骼工具 | 验证简单关节无法满足披风、柔性身体或复杂动作后再评估 | 需要拆图、绑定、工具与导出学习；接入前确认编辑器许可、导出版本与项目 3.8.8 的实际兼容性 |
| 必要姿势帧 + 帧播放器 | 大透视变化、倒地、夸张近战、Boss 变形，以及适合本地烘焙的群怪 | 表达关节旋转无法得到的轮廓；复用帧导入工具 |

先用轻量二维关节方案制作凯尔侧面动作。若需要复杂约束，比较专用工具与补姿势的工作量后选择。

Cocos 原生 Animation 可驱动节点位移、旋转、缩放等属性；复杂角色动画可接入专用二维骨骼工具。这里的 Sprite 关节层级是二维分层实现，不等同于引擎面向三维模型的骨骼管线。[Cocos 动画文档](https://docs.cocos.com/creator/3.8/manual/en/animation/)

### 7.2 可绑定素材：先准备部件，再制作动作

一个英雄需要的是一套设计，以及前/侧/背各自可绑定的部件。侧面验证通过后才扩展其他方向；不能用一套侧面图连续旋转出完整三维转身。

凯尔侧面起点可按约 12–18 个可见部件规划，按设计合并或细分，不作为所有角色的固定数量：

- 根节点、骨盆、胸甲、头；根节点与部分关节仅为数据，不需要图片。
- 远侧与近侧的上臂、前臂或义肢炮；固定持枪手可与武器局部合并，确需换握才拆分。
- 远侧与近侧的大腿、小腿、靴；根据屏幕尺度合并不影响动作的小部件。
- 炮身、能量核心等确需独立活动的装备；头发/披风只在造型具有这些结构时另拆。

制作顺序：完整设计基准 → 明确拆分与关节位置 → 部件组出图/局部补画 → 机械切片与装箱 → 本地绑定 → 检查大角度动作。

部件要求：

1. 头、胸、四肢、武器同镜头、同尺度、同色板、同光照，不通过各自重新生成任意缩放凑齐。
2. 肩、肘、髋、膝有足够隐藏重叠区；遮住的肌体/装备补齐。仅从完整立绘裁切会留下空洞。
3. 近侧/远侧分别标识，规定层级与关节轴心；有明显透视差异时单独绘制。
4. 外轮廓与接缝处理统一。内部连接处避免两条粗描边叠成黑圈，关节盖片不能随运动暴露空白。
5. 部件导出带切片矩形、枢轴和组装位置数据，装箱旋转或裁边不能丢失这些信息。
6. 武器保留完整枪管和可标定枪口；枪焰、弹体、投影不画进身体部件。
7. GPT 输出的部件名称、位置与透明度均需核验；文字标签与棋盘背景不能进入正式贴图。

优先保留已经合格的部件，补画只针对缺失区域或必要替换角度。机械切片可以自动化；姿势、遮挡补画和风格修正使用图像编辑。

### 7.3 动作设计：灵活感来自重心、节奏与衔接

| 动作 | 本地制作方式 | 验收重点 |
| --- | --- | --- |
| 待机 | 胸部轻呼吸、骨盆微调、装备延迟跟随 | 根节点稳定，不能全身同幅度上下弹跳 |
| 行走/奔跑 | 接触、承重、离地、摆腿的关键姿势与曲线；步频关联实际速度 | 足部接地阶段相对地面稳定，停止时步态自然收束；跑步有不同重心与节奏 |
| 瞄准 | 胸/肩/手臂/武器局部调整，必要时切换武器或手臂附件 | 限制当前视角的可用角度，不让整张高位侧面人物平面旋转成俯仰姿势 |
| 移动射击 | 下身持续走跑，上身播放开火与后坐 | 移动、侧移、后退能区分；枪口与手臂同步，开枪时腿不突然停住 |
| 轻受击 | 局部姿势偏移及短暂恢复；打断规则按现有玩法处理 | 命中有反馈，死亡/硬控仍优先；不能因视觉叠加误执行被取消的攻击 |
| 普通跳跃/悬浮 | 根高度与肢体姿势独立，投影单独控制 | 不改变逻辑碰撞与技能落地时刻；透视不足时补姿势 |
| 近战/Q/E/R | 本地蓄力、爆发、回收曲线，关键剪影必要时换姿势 | 攻击峰值清楚，武器不穿身，技能各有独特动作 |
| 倒地/大幅转身/变形 | 少量专门姿势或附件替换，必要时独立逐帧片段 | 装备、尺度和方向连续，不依靠过度拉伸代替透视变化 |
| 机械 Boss/触手 | 刚性关节或短链分层，错开启动和停止 | 固定连接点、重量与延迟；复杂柔性体另评估专用骨骼或补帧 |

先用明确关键姿势和插值曲线形成动作，再加入少量跟随。披风、头发等延迟跟随需要阻尼/幅度上限，暂停后不能继续积分或恢复时突然甩动。步态按真实位移/速度驱动，避免只按经过时间摆腿导致滑步。

美术身体根的重心偏移与游戏逻辑位置分离，阴影、血条和碰撞按各自规则跟随。前、侧、背方向使用各自附件与层级；跨方向切换检查接地相位和体量，先避免闪跳，再评估过渡方式。

### 7.4 与现有战斗系统的衔接

现状：`ActorAnimation` 只有一条带优先级的全身动作；`PlayerController.updateVisualAnimation()` 在动作锁定时不切换走跑。发弹和技能通过 `fire`/`strike`/`cast` 等帧事件执行，枪口由帧数据计算。移动射击的本地骨骼表现需要后续适配代码，不是直接替换 PNG。

后续以统一表现接口接入，模块名在实施时确定：

1. 下身通道负责 idle/walk/run，依据实际移动方向和速度采样；上身通道负责目标朝向、瞄准、攻击与后坐。朝向变化必须使用当前镜头下合理的附件，不作无限角度扭转。
2. 特殊技能、跳跃、硬直和死亡可接管全身；保持既有优先级、技能排队、取消与死亡清理语义。把视觉通道拆开不意味着放宽技能/移动规则。
3. 动作时间轴统一驱动曲线和事件，保留 `DT_MAX` 钳制、攻速调整与低帧率跨事件处理。每次攻击/施法的释放最多执行一次；暂停、取消和回收后不能留下延迟事件。
4. 发弹时用对应事件时刻的武器关节变换求枪口，应用单位尺度、镜像和方向。一次更新跨过多个关键时刻时，不用更新结束后的枪口位置冒充释放位置。
5. 原有逐帧单位与新关节单位共存；同一行为只选一个事件来源，不能让原帧时钟和新骨骼事件同时发弹。
6. 主体姿势帧与关节片段切换时锁定同一身体根、尺度、方向和投影；恢复后重置过期的跟随/动作状态。
7. 新动作数据保持纯数据层；无 parent 的 headless 模式只更新时间与事件，不创建引擎节点。组合继续经过 `GameManager`，遵循现有分层。

若使用 Spine，Cocos 文档区分 REALTIME 与缓存模式：共享缓存不支持动作混合/叠加，事件支持也有限。英雄的分层射击与挂点先按实时模式验证；群怪必须按具体事件需求、同屏数量和性能选择缓存或本地烘焙，不能统一套缓存模式。[Cocos Spine 组件文档](https://docs.cocos.com/creator/3.8/manual/en/editor/components/spine.html)

### 7.5 群怪复用与性能

- 英雄和少量 Boss 优先保留实时关节动作的灵活性；普通群怪不自动全部改成多节点实时骨骼。
- 简单怪物可用少部件动作；已在本地制作的动画也可离线烘焙为帧图集，继续使用现有播放器。这同样减少 GPT 调用，但烘焙后的固定全身片段不具备实时独立瞄准能力。
- 选择依据是实际同屏节点数、绘制调用、CPU 时间、纹理内存与加载时间。分层骨骼减少重复贴图不保证运行时更快。
- 兼容现有图集规格与事件表，先验证凯尔和少量怪物，不提前替换全部 292 张图集或删除旧资源。

### 7.6 技能特效：纹理 + 粒子/代码 + 必要姿势帧

- 枪口、弹体、命中、持续场、召唤和消散分别登记。先为一个元素制作可复用闪光、碎片、能量纹理，再用本地参数形成不同速度、方向、大小和生命周期。
- 爆炸、能量扩散、冲击环用粒子/Graphics/独立 Sprite 层组合；具有明确漫画形变的关键峰值可补少量序列帧。
- 固定枪口原点或径向中心，效果方向由运行时确定。身体部件不烧录枪焰、烟和弹体。
- 长时技能有循环段和结束段；表现范围不改变伤害半径，危险边界仍由真实判定准确驱动。
- 普通命中克制，终极技能与 Boss 峰值突出；核验透明混合、池复用、同屏密度和暂停生命周期。

### 7.7 页面、登场与结算短动画：分层图 + Tween

| 场景 | 图像准备 | 程序动画 |
| --- | --- | --- |
| 首页/大厅环境 | 底图、独立灯光或能量层 | 低幅度平移、呼吸、局部闪烁 |
| 传送门 | 底座、内环、外环、核心光 | 分层旋转与能量脉冲 |
| 英雄展示 | 立绘、背景、可独立摆动的装饰层 | 小幅视差、轻呼吸、入场 |
| Boss 登场 | 半身/剪影、背景条、独立能量 | 2–4 秒推入/揭示；文字仍由 Label 绘制 |
| 强化获得 | 图标、光纹、卡片组件 | 约 0.3–0.6 秒确认与收束 |
| 结算 | 报告面板、奖励徽章 | 逐项显现、数值计数、结束确认 |

按钮反馈约 120–180ms，弹窗/卡片进入约 180–250ms，作为初值并实机调整。真实走跑、攻击和死亡遵循身体动作路线；展示短动画在本地完成。

### 7.8 控制 VPN 流量与生成次数

1. 本地保存高清原稿、完整设计基准和已通过部件；上传时使用能保留身份细节的裁切参考，风格参考可从约 512–768px 长边试起，出现细节丢失则提高，不把这个档位当工具强制输出尺寸。
2. 每批只提供相关风格、角色身份和缺陷部件参考；修改动作曲线、关节、速度、跟随和粒子参数均在本地进行。
3. 不为每个动作重做战斗整图，不为了预览重新生成；预览截图、动作播放、接触表和性能检查在本地完成。
4. 精确部件布局不是 GPT 保证项；先验收再切片。错误限定在一个部件时只修该部件，保留其余已通过的原文件。
5. 下载后压缩只能减少存储和未来上传，不能追回已经下载的流量。格式转换在不丢 alpha 的前提下做；当前图像工具未开放的尺寸/压缩控制不写成可执行承诺。
6. 若以后使用图片 API，可按实际接口配置输出尺寸、格式与压缩；当前内置工具不是 API 所有参数的直接替代。[OpenAI 图像输出设置](https://developers.openai.com/api/docs/guides/image-generation)
7. P0a 记录真实生成/修改次数、上传与下载文件大小、本地整理与调参耗时；无法观测的 VPN 网络开销标记未知，不预先宣称能节省固定百分比。

## 8. 资源管理与兼容导入

### 8.1 后续制作目录

```text
docs/art/style-a/
  references/                 # A 主风格、B 亮度及单位基准
  source/<batch>/<asset>/      # 原始候选、编辑来源、提示词
  approved/<batch>/            # 已通过的部件、特殊姿势与正式候选
  qa/<batch>/                 # 接触表、动画预览、实机截图与缺陷记录
  manifest.json               # 后续实施时建立的资源/动作追踪清单
assets/resources/art/         # 游戏实际使用的最终资源
```

参考图位于 `references/`；制作时按批次建立其余目录和清单。

追踪清单每项至少记录：生成 id、素材 key、用途、参考版本、提示词文件、生成来源、原始/导出尺寸、方向、透明度、状态、替换目标、独立预览/实机结果。

分层动画另记录：部件名、切片矩形、父关节、绑定姿势、关节轴心、绘制层级、附件切换条件、动作曲线与时间轴版本、枪口/施法点。姿势帧另记录：grid/帧序、pivot/muzzle 与事件。使用哪种表现方式和哪一条事件来源必须明确。

状态依次为 `planned → generated → reviewed → imported → in_game_verified`；被拒稿使用 `rejected` 并记录原因。只有全部目标动作/方向通过的单位才能标记整单位完成。

每次后续任务结束，记录本批已完成项、未通过项、下一批入口和引用的基准版本。生成原稿进入项目制作目录，正式资源不得只依赖外部生成目录。

### 8.2 兼容原则

- 既有素材只覆盖同名 PNG 内容，保留现有 `.meta`/uuid；不改磁盘文件名。
- 分层部件图集和关节数据使用独立资源；未迁移单位继续使用其图集，保留可恢复的资源版本。新 PNG 读取经过 `artPath()`；若采用 Spine 骨骼数据，则使用对应资源类型与加载适配，不误套 SpriteFrame 后缀。
- 图集从小批次帧装箱时，对照目标网格与动作表。网格或帧序变化必须同步更新 `ActorAnimationDB`/`EffectAnimationDB`。
- 导出尺寸变化时让 Creator 正常重新导入，不以删除缓存或 uuid 的方式处理。
- 所有读取仍经过 `artPath()`；`/spriteFrame` 后缀与 `ArtRemap` 规则继续适用。
- 新背景、技能图标或独立召唤物使用新 key，登记真实文件与测试收集规则。
- 各批更换前保存目标图片与元数据快照，失败时恢复同名内容及对应帧表。
- 引擎生成目录 `library/`、`temp/`、`local/`、`build/` 不作为修复对象。
- `AnimationBoundsDB` 与原帧动作形状相关，帧路线重新生成/验证；关节路线定义可验证的身体边界与显示尺寸适配，不能直接把旧逐帧边界当新绑定的准确范围。上下边界、血条、阴影、枪口和碰撞须统一核对。
- 自动化工具承担机械切片、装箱、测量、动作数据与本地预览；绘制部件、遮挡补画和特殊姿势的美术修正通过图像编辑完成。走跑/瞄准等关节姿势由本地曲线控制。

## 9. 分阶段执行与完成条件

各阶段按产物与质量推进，不以固定生成次数或未经验证的时间估计宣称完成。

| 阶段 | 工作与产物 | 进入下一阶段的条件 |
| --- | --- | --- |
| P0 清单与风格固定 | 代码资源/动作矩阵、A 主风格+B 亮度规则、单位基准模板、UI 组件规范；保存资源基线 | 每个运行时引用和动作槽有对应制作项；基准规则可直接用于出图 |
| P0a 凯尔侧面动作验证 | 一套侧面分层部件、绑定与动作数据；待机/跑步/移动射击/受击、枪口与事件适配；真实尺寸本地与 Cocos 对照 | 能自然跑步、边移动边射击、受击和恢复；不滑步、不露接缝、不漏发/重复发弹；确认本地关节路线是否足够 |
| P1 第一章完整样机 | 凯尔全方向与完整行为；小兵/盾怪；腐肉 Boss 及实际阶段；第一章底图与一套可碰撞残骸布局；相关弹体/特效；HUD、强化商店、暂停/结算；标题/大厅的风格对照稿 | 在 Cocos 实际完成战斗→强化→战斗→暂停/结算短循环；通过障碍绕行、弹体、刷怪、Boss、画面和字体检查 |
| P2 全局 UI | 将统一组件覆盖第 6.3 节全部页面、正式字体、通用图标、触控规则；把首页/大厅稿实现为真实节点 | 全页面来回切换、开启/关闭、长文本、缩放与主要交互正常；各页面与样机同风格 |
| P3 六英雄 | 按凯尔→雷克→薇薇安/利亚娜→格雷夫→奥莉亚推进；身份基准、立绘、头像、完整动作、Q/E/R 图标和特效 | 每位英雄单独通过全部方向、装备、攻击类型/形态和技能链路后再记完成 |
| P4 章节与敌方单位 | 按章节/机制组制作 16 小兵、11 小 Boss、10 首领与召唤物；其余 5 章底图、残骸与每章 2–3 套可碰撞布局、特效；先覆盖常见群怪再复杂单位 | 全单位目录与地图布局覆盖，章节主题可辨，出生点及通路有效；不以同一套人体动作替代特殊解剖 |
| P5 展示与氛围 | 首页/传送门细节、Boss 登场、强化获得、章节转换/结算分层动画；复用现有音频接线做同步 | 动画节奏不遮挡关键交互，攻击/命中/警报音与视觉时刻匹配 |
| P6 总体验收 | 6 英雄×6 章关键场景；各布局的移动、绕行、弹体、技能、Boss、出生点；页面、触控、边缘、性能与异常状态 | 所有制作项达到 `in_game_verified`，剩余缺陷有明确处理结果，画面风格一致 |

从 P0 + P0a 启动。先验证凯尔侧面动作，并校准素材拆分、亮度和动作方法。P1 再完成凯尔前/侧/背、技能、死亡与全部实际行为，以及第一章样机。

### 9.1 批次粒度与工作量评估

- 小怪每批 2–3 个完整单位；英雄每批 1 个完整单位；复杂 Boss 每批 1 个。
- 单位内部拆为设计、方向/部件、绑定、动作和必要补姿势任务，每个任务都有可检查产物；动作任务并不对应一次出图。
- 多个逻辑槽共用同一物理帧时保留合理复用；不同装备、形态与关键技能不强行共用。
- 从 P0a 开始记录每类素材的生成次数、修正次数、拆图/绑定/调参耗时与实机问题，P1 后再估算剩余工作量。
- 以已验收部件、绑定、动作与页面估算工作量，分别记录生成、修正和本地调试成本。
- 不承诺一次 GPT 出图即可得到可绑定的人物或自然循环。减少远程生成会增加本地绑定与动作调试；质量预算优先给可见轮廓、接缝、步态/攻击和关键技能。

## 10. 每批验收表

### 10.1 视觉验收

- 轮廓、头身比例、装备块面、地图与 UI 造型对应 A；角色、敌人、危险、掉落和文字在真实画面中的可读性达到 B 所提供的观感目标。不把 B 的棱角与细长比例混进 A 的角色。
- 同屏截图检查视觉层级：场地中间调足够清楚，角色亮面与背景分离，Boss 的攻击预警持续可辨。阴影仍保留立体结构，场地不被整体提亮成灰雾。
- 立绘、头像、战斗和动作中人物身份一致；武器和固定装备数量一致。
- 英雄按当前约 82px 显示画布核验；小兵/Boss 使用代码实际尺寸与倍率，不全部按英雄尺寸预览。
- 32/48/64px 图标仍有清楚主体；不靠外框与辉光堆叠识别。
- 深、浅、四章已有环境及新增章节背景都检查透明边缘；文件确有 alpha，而非画出的棋盘格。
- 地面不过亮，友方、敌方、危险和奖励在同屏能迅速区分。
- 中等/高密度战斗截图下，角色、技能预警与 UI 文本仍可读。
- 建筑残骸的画面底座、接触阴影和实际不可通行区域一致；普通和宽屏画面、震屏时物件与碰撞体仍对齐。

### 10.2 动画与行为验收

- 首尾衔接自然；方向切换不抖动，不出现武器换手、重复肢体、忽大忽小。
- 镜像、脚底、身体根、阴影、血条、枪口和攻击判定对应。
- 接地阶段无明显滑步；关节不过伸，肩/肘/髋/膝无空洞或粗黑接缝；近远肢体遮挡正确。
- 下身走跑时上身能按现有瞄准规则射击；停止、侧移、后退、高速移动、跨方向和特殊姿势恢复时衔接自然。上身扭转不超出当前附件的合理视角。
- 待机/走/跑/跳/攻击/受击/死亡以及各技能均由实际行为触发。
- 30/60/120fps 下检查事件、技能排队和高攻速；没有重复发弹、漏释放或死亡后攻击。
- 暂停/冻结/打断/升空/隐身/重开/异步加载符合既有规则。
- 死亡完整播放后回收；同屏特效与尸体数量仍符合池与生命周期限制；回收时清理部件节点、关节状态、残余跟随和所有事件。
- 玩家、敌人和 Boss 能沿残骸边缘移动或绕行；冲刺、击退、瞬移、出生和掉落不进入实体障碍。阻挡弹体的场景对友敌方向一致，快速弹不穿墙，技能例外符合明示规则。

### 10.3 UI 与性能验收

- 标题、正文、数值、说明字重与字号稳定；长中文没有挤到极小字号。
- 正常、悬停、按下、禁用、选中与键盘焦点各有清楚反馈。
- 页面隐藏再显示时底板和遮罩仍存在；沿用激活重绘机制。
- 按当前目标设备检查横屏、全屏、视口变化、触控遮挡与可点击区域。
- 使用相同设备、单位数、技能与分辨率对比替换前后的帧耗时、内存和加载；有明显退步时优先减少图集/特效负担。

### 10.4 工程验证（后续修改代码/资源时）

- 运行 `npm test` 与 `npm run typecheck`，核对资源存在、alpha、图集网格与事件回归。
- 新增被测试的 TS 文件，加入 `tsconfig.test.json` 的显式清单。
- 每批保存独立预览和 Cocos 实机证据；文件校验通过不等于动作自然或整批视觉完成。
- 首领数量与覆盖矩阵从代码导出。
- 只做验证并停在待提交状态；用户明确要求“提交git”后才 commit + push，提交身份遵循 `user.name=Xy`。

## 11. 后续可以直接使用的提示词模板

以下为项目生产模板，不要求改用 API。变量填入本批真实规格；图像模板共同携带 A 主风格、B 亮度参考和已验收的对象设计基准。两张概念图的职责不可互换。

### 11.1 公共风格段

```text
Image 1 is the approved HEXBLAST A reference: use it for the overall
character shape, compact proportions, rounded sturdy armor, soft-cut
sci-fi UI geometry, simplified materials and clear outer ink contours.
Image 2 is the B reference: use it ONLY for perceived brightness,
mid-tone readability, subject/background separation and legible UI.
Do not transfer B's long narrow anatomy, sharp spikes or angular panels.
Use two or three clean value planes and restrained energy accents.
Consistent elevated game camera and upper-left key light.
Prioritize readability at the specified in-game size.
Brighten important subject planes and interface information; retain
shape-defining shadows and a quiet arena center. Do not raise global exposure.
Avoid realistic microtexture, chrome reflections, ornate filigree,
excessive bloom, muddy gradients, pixel art and infantile mascot anatomy.
```

### 11.2 单位设计基准

```text
Image 1: approved A STYLE reference for shape and rendering.
Image 2: B BRIGHTNESS reference only; ignore its shape language.
Image 3: existing unit IDENTITY/MECHANISM reference; ignore its rendering style.
Create the new design master for [unit id / name].
Required identity: [hair, costume, palette, anatomy, equipment count].
Required gameplay silhouette: [weapon / shield / limbs / core].
View: [specified elevated front OR right-facing side OR back view].
One complete full-body figure, no scene, no text, no effects or ground shadow.
True transparent background. Entire equipment stays inside the canvas.
Include sufficient clear margin for later animation.
Apply the common A shape + B brightness paragraph. Keep all prescribed equipment and limbs.
```

三方向分别制作，再组成对照图验收；不以一张多视角概念图直接切片当作正式动画。

### 11.3 分层部件、动作数据与必要特殊姿势

部件图模板：

```text
Image 1: approved A STYLE reference for shape and rendering.
Image 2: B BRIGHTNESS reference only; ignore its shape language.
Image 3: approved [unit] design master, the ONLY identity reference.
Image 4: approved assembly/part reference, if available.
Create ONLY [explicit part group] for a 2D articulated character.
View: [elevated right-facing side / front / back].
Lock camera, anatomy, proportions, costume, material, palette and lighting.
Required distinct parts: [list near/far parts and any equipment].
Preserve their relative scale. Separate parts without overlap for extraction.
Complete areas hidden at [shoulder / elbow / hip / knee] for joint overlap.
Use clean outer contours; avoid heavy duplicated ink lines at covered joints.
No ground shadow, effects, text, labels, grid or checkerboard.
True transparent background. Generous margins; complete weapon and limbs.
Do not redesign approved parts. [Repeat common A shape + B brightness paragraph.]
```

部件表仅为生成请求。正式切片、命名、关节轴心和装箱数据在本地核验后生成；图中部件漏画或尺度不一致时不能直接进入绑定。

本地动作数据模板（使用文字/代码能力，不调用图像生成）：

```text
For the approved [unit/view] 2D rig, design [one action] as local animation data.
Read the actual rig, bind pose, joint limits, hierarchy and engine timing first.
Use the project's real coordinate and angle conventions.
Specify key poses, normalized times, easing, contact phases and recovery.
Locomotion is based on actual movement; upper-body aim/recoil remains independent.
Keep held parts connected and respect the current view's aiming range.
Preserve gameplay action priorities, attack cadence and cancellation rules.
Use one authoritative release event and the muzzle transform at that event time.
Define transition/reset behavior for pause, hit, skill takeover and defeat.
Return inspectable data/code and local preview cases; do not request new images.
```

特殊姿势模板（仅骨骼难以表达的动作使用）：

```text
Image 1: approved A STYLE reference for shape and rendering.
Image 2: B BRIGHTNESS reference only; ignore its shape language.
Image 3: approved [unit] design master, the ONLY identity reference.
Image 4: approved start pose / previous key pose, for pose continuity.
Task: [unit], [view], [one action], [frame count or single frame].
Pose sequence: [enumerate contact, weight transfer, release, recovery...].
Lock camera, body proportions, costume, weapon shape/count, color and light.
Canvas/grid target: [actual target specification].
Fixed body-root and ground baseline for grounded frames; preserve intentional
jump height and fallen-body offset. Generous margins, no neighboring-cell overlap.
No text, grid lines, floor, projectiles, muzzle flashes or smoke.
True transparent background. Each pose must contain real limb articulation.
[Repeat common A shape + B brightness paragraph.]
```

模型给出的网格、基线和位置属于请求，必须检查真实输出后才能用于切片和事件挂点。

### 11.4 局部修正

```text
Edit only [specified frame / region / defect] in the current candidate.
Keep the approved identity, view, scale, equipment and all other accepted poses.
Correction: [concrete change, e.g. restore the second axe / extend the gun barrel].
Do not add effects, limbs, labels or new equipment.
Preserve true transparency, A's rendering and B's readability target.
```

修正后重新比较全部保留帧。若其他帧被误改，只取合格的目标帧，原有合格帧不替换。

### 11.5 地图底图

```text
Image 1: A STYLE reference for arena shape and rendering, not a literal layout.
Image 2: B BRIGHTNESS reference only, not a source of geometry or decoration.
Chapter: [name, structures, theme palette].
Produce a clean playable top-down arena BACKGROUND ONLY, 16:9.
Match A's rounded, simplified sci-fi structures, the established game camera,
upper-left light and clear planar shading.
Central approximately 65% has readable mid-tones, large floor shapes and
sparse, lower-contrast texture. Reserve [layout-specific obstacle slots] for
separate gameplay props; do not bake those collision props into the ground.
Keep units and danger signals distinct. Place large narrative structures
mainly at the edges.
No hero, enemies, loot, health bars, buttons, HUD or readable lettering.
No horizon, no inconsistent perspective, no bright floor pattern competing
with projectiles or danger telegraphs. [Target export size].
```

可碰撞物件使用单独请求，指定章节、布局槽、视觉方向、透明背景、完整接地底座和阴影；按实机显示尺寸验收后，由逻辑数据确定碰撞范围，不直接按图片透明轮廓生成判定。

### 11.6 图标/特效

```text
Approved A shape language and B readability target. Asset: [skill icon OR effect sequence].
Subject/mechanism: [one clear concept]. Palette: [identity/element palette].
[Icon: one large readable symbol, no outer frame, no text, readable at 48px.]
[Effect: enumerate onset/peak/breakup/end; fixed emission point or center;
 target grid, generous expansion margin; drawn shape changes across frames.]
True transparent background; clean alpha edges; no checkerboard, labels,
background panel, realistic smoke carpet, tiny noisy particles or excess bloom.
```

### 11.7 UI 设计/实现

```text
Design [page/component] for HEXBLAST using A's sci-fi cartoon UI geometry
and B's perceived brightness and readability target.
Respect existing functions, content and the 1280x720 design canvas.
Specify layout, spacing, type roles, states, colors, and visual hierarchy.
Use A's compact matte panels, consistent softer cut corners and restrained cyan.
Make important text, values and controls clear without flattening all contrast.
Keep Chinese body text readable and variable values as real text fields.
Separate illustration assets from panels, buttons, bars and cooldown geometry.
Provide a component specification that can be implemented with Cocos nodes,
Graphics, Sprite and Label; include long-text and disabled/selected states.
```

## 12. 第一次实施的具体交付包

从 P0 + P0a 执行以下清单：

1. 导出当前资源/动作与事件清单，保存基线；只对凯尔展开首批详细任务，仍保留全游戏覆盖矩阵。
2. 完成凯尔的 A 造型+B 亮度身份基准和右侧方向设计，定义近远肢体、义肢炮结构、拆图和关节位置。
3. GPT 制作必要分层部件；本地机械切片、检查遮挡补画、真实 alpha、尺度与接缝，组成一套正式候选。
4. 本地建立关节层级、绑定数据、部件图集与预览；在实际约 82px 显示尺度验证，不只看放大的设计图。
5. 制作待机/跑步/移动射击/受击与恢复，加入枪口、后坐和确有需要的跟随；跑步与射击通道独立。
6. 在 Cocos 接入凯尔侧面验证，检查发弹时刻、攻速、取消、暂停与死亡后的清理。提供侧面小样不能被记为凯尔全方向/全动作完成。
7. 交付本地动作预览、实机画面、部件/关节/事件数据、缺陷记录、真实出图与流量记录；确定能复用的素材和动画模板。

P0a 通过后再进入第一章完整样机：补凯尔前/背方向和全部实际动作、必要特殊姿势；完成小兵、盾怪、腐肉 Boss 与阶段；第一章底图、相关弹体/特效、HUD/强化/暂停/结算和标题/大厅对照。完成实际战斗短循环后，才扩展全局 UI 与其他英雄/章节。

后续每批汇报四件事：本批替换了什么、用了哪些基准、实机验证了什么、尚有什么缺陷。全量完成以清单和实机结果为依据。

## 13. 资料与能力依据

- 项目：`CharacterDB.ts`、`BossDB.ts`、`WaveData.ts`、`ActorAnimationDB.ts`、`EffectAnimationDB.ts`、`UIStyle.ts`、`LabelUtils.ts`、`SpriteUtils.ts`。
- 资源清单：`docs/art/art-inventory.md`、`docs/art/art-needs.md`。
- [OpenAI 图像生成文档](https://developers.openai.com/api/docs/guides/image-generation)：参考图、图像编辑和连续迭代，以及角色一致性限制。
- [OpenAI 图像提示词文档](https://developers.openai.com/api/docs/guides/image-prompting)：明确参考角色、约束与输出核验，包括真实透明通道。
- [Cocos 3.8 动画文档](https://docs.cocos.com/creator/3.8/manual/en/animation/)：节点属性动画与复杂角色动画工具的适用范围。
- [Cocos 3.8 Spine 组件文档](https://docs.cocos.com/creator/3.8/manual/en/editor/components/spine.html)：骨骼资产、实时/缓存播放和挂点能力；具体支持以项目 3.8.8 的实际导入与运行结果确认。
