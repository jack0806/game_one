# 技能、海克斯与全敌方攻击表现重做

日期：2026-10-09。已完成本次图标和战斗特效范围，保持待提交。

## 交付范围

- 24 个英雄技能图标：8 位英雄的 Q/E/R 各自独立设计。
- 32 个海克斯图标：`hex01`–`hex32` 各自独立设计，并接入当前强化数据。
- 12 张敌方攻击主体：针刺、冰刺、毒液、水弹、锯片、虚空刃、声波、火印、爪击、蛛网、电弧、磁轨。
- 6 张四行四列特效图集，覆盖 24 种效果、每种 4 帧；同时重做薇娅钥矢与莫提斯骨矛，替换白色占位条。
- 16 种小兵、11 种小 Boss、10 种首领的攻击表现全部接入并逐类检查。

按参考 A 使用粗轮廓、简洁大色块、明确主体；借用参考 B 的明亮中间调。所有位图由内置 image_gen 生成，保留透明背景。现有 PNG 同名覆盖，20 组替换资源的主 UUID 和子资源 UUID 均保留。新增图标由 Creator 导入。

图标按实际 64/48/32px 检查：

- [技能 1–12](combat-qa-2026-10-09/final-icons-skills-1.png)、[技能 13–24](combat-qa-2026-10-09/final-icons-skills-2.png)
- [海克斯 1–16](combat-qa-2026-10-09/final-icons-hex-1.png)、[海克斯 17–32](combat-qa-2026-10-09/final-icons-hex-2.png)

## 关键修复

1. 敌弹使用独立精灵并随真实速度移动，旋转方向跟随轨迹；近战释放有弧刃与短碎屑，挥空也能看到完整出手。冲撞前摇改为断续侧界，扇形预警与伤害角度一致。
2. 光束、磁力束、声波和炉环使用流动轮廓，释放与蓄力分离。磁力蓄力改为两端聚能；文档首领的活塞、镜刃、毒雨分别有短暂释放、实际移动刀刃、下落毒滴及命中消散。
3. 大范围地面效果放在角色下方，保留角色轮廓；短命中特效单独分层。毒弹常规显示上限 30px，中毒脚边毒泡约 26px、0.22 秒，命中约 26px、0.2 秒；普通敌弹上限 44px、虚空刃上限 52px，实际碰撞直径更大时不会缩到判定范围以下。
4. 修复首次异步载入图片时 Cocos 默认尺寸模式把小特效撑到原图尺寸的问题。静态图片、缓存命中和逐帧切片统一使用 `Sprite.SizeMode.CUSTOM`。
5. 修复扇区绘制方向导致六面安全区被整圆覆盖的问题；毒震环、炉环和钟鸣波的安全缺口按真实判定绘制。
6. 深海分身移除中心瞄准细线，水柱改成旋流核心、浮动水滴和涟漪，水刺指定冰水弹体。时间奇点改为独立核心与环绕碎片。薇娅/莫提斯弹丸按各自原图比例显示。

## 覆盖与实机核验

使用 Cocos Creator 3.8.8 Web Desktop 构建，后半程及最终复核通过 Codex 内置浏览器完成。测试房按 60Hz 推进真实玩法状态，采集攻击前、前摇、释放/命中、持续和结束阶段；额外检查短暂命中时刻及全场机制。未使用用户桌面进行最终测试。

| 范围 | 单位/技能 |
| --- | --- |
| 小兵 16 | grunt、shield、exploder、golem、elite_grunt、archer、miniboss、rust_biter、needle_gunner、ember_acolyte、frost_acolyte、acid_sac、rivet_beast、arc_leech、gold_scavenger、blast_tick |
| 小 Boss 11 | squid、turtle、shrimp、jelly、drone_a、drone_s、chain_hound、prism_snail、triune_priest、rail_butcher、bell_devourer |
| 首领 10 | boss_ch1–ch4、boss_mech、boss_abyss、boss_vespa、boss_crucible_city、boss_manyfold、boss_invader |
| 英雄 24 | kai、vivian、reik、olia、graf、liana、via、mortis 的 Q/E/R |
| 文档首领 | 维斯帕、坩埚、千面各 5 个机制全部单独触发 |
| 追加阶段 | 祭司三相、磁轨三招、钟噬者轮转、棱晶闭壳；前四章冲锋/召唤；机械风暴/强化/坠击；深海水柱/冰区/分身/召唤；天罚最终形态；薇娅三类赃技 |

掠金虫按原设计没有攻击；支援机的治疗与护盾仍保持辅助用途。深海水柱属于常驻召唤物，停止射击后回到待机，不应当作残留特效清除。

代表性验收截图：

- [毒射手命中与消散](combat-qa-2026-10-09/final-iab-unit-archer.jpg)
- [深海旋流水柱与水刺](combat-qa-2026-10-09/final-iab-unit-boss_abyss-pillar.jpg)
- [全幅活塞释放](combat-qa-2026-10-09/full-doc-crucible_city-1.jpg)、[钢坯缺口](combat-qa-2026-10-09/full-doc-crucible_city-3.jpg)、[虫卵](combat-qa-2026-10-09/full-doc-vespa-3.jpg)、[收缩边界](combat-qa-2026-10-09/full-doc-manyfold-4.jpg)
- [酸囊攻击前、中、后：英雄保持可见](combat-qa-2026-10-09/final-iab-unit-acid_sac.jpg)
- [磁力蓄能与释放](combat-qa-2026-10-09/final-iab-unit-rail_butcher-2.jpg)
- [毒雨下落与命中](combat-qa-2026-10-09/final-iab-doc-vespa-2.jpg)
- [毒震环左右安全口](combat-qa-2026-10-09/final-iab-doc-vespa-4.jpg)
- [时间球完整阶段](combat-qa-2026-10-09/final-iab-hero-olia-r.jpg)
- [天罚最终形态](combat-qa-2026-10-09/final-iab-unit-boss_invader-1.jpg)

## 验证与复现

- `npm test`：571/571 通过，包含新增 14 项战斗表现回归测试。
- `npm run typecheck`：通过。
- Cocos Creator 3.8.8 Web Desktop：最终构建通过；最终内置浏览器复核无 console error/warn。
- 新图标唯一性、RGBA、导入元数据、全部运行时 art key 均由测试检查。补充验证了 320 发弹体位移/回收、毒效果堆积、光束边界、异步尺寸和扇区角度。

复现：先用 `tools/build-web-desktop.json` 构建，再执行 `python tools/serve_combat_review.py`。该服务仅监听 `127.0.0.1:8316`，只读提供构建与白名单验收页面。打开 `/output/playwright/combat-review.html`，选择用例并点击「完整阶段采样」；「查看全幅」可检查屏幕边缘机制。图标页面为 `/output/playwright/icon-review.html`。工具保存在 `tools/combat-review.html`、`tools/icon-review.html`，不进入正式游戏入口。

完整本地阶段总览在 `output/playwright/final-iab-*.jpg`，代表图随本文入库。图标、特效、图集的提示词清单分别位于 `style-a/combat-redesign-jobs.json`、`style-a/combat-vfx-jobs.json`、`style-a/combat-animation-jobs.json`；生成原件及来源位于 `style-a/generated/`。


## 追加：普通攻击击中英雄的反馈

用户实玩指出命中英雄后看不到打击效果。复查确认 `PlayerController.takeDamage` 原先只触发受击动作、浮字和震屏，普通近战/多数敌弹没有统一的命中贴图。上一轮阶段采样间距过长，也遗漏了这个问题。

此处原先增加统一 `playerHit` 撞击闪光，现已被后续[敌方命中反馈重制](enemy-impact-redesign-2026-10-09.md)取代：35 种攻击单位各有独立四帧图行，使用爪痕、火焰、水花、金属碎屑、锯刃与虚空裂口等不同材质，移除通用受击圆环。下列三张旧图仅保留为上一版本的检查记录；最新结果以新文档和 `impact-*` 验收图为准。

新增 3 项回归覆盖真实近战/敌弹命中、挥空、保护/护盾及高频受击。内置浏览器用「命中细查」从真实扣血时刻开始密集采样，确认撞击出现和消退；验证图：[普通近战](combat-qa-2026-10-09/player-hit-grunt.jpg)、[针弹连射](combat-qa-2026-10-09/player-hit-needle_gunner.jpg)、[毒射手](combat-qa-2026-10-09/player-hit-archer.jpg)。

追加验证：574/574 测试通过，类型检查、Cocos Web Desktop 构建与 diff 检查通过。保持待提交，未 commit/push。
