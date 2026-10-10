# 敌方命中反馈重制（2026-10-09）

本轮取代上一版统一的 fx_player_hit 闪光和 impact 扩散圆环。37 种目录单位中，掠金虫和支援无人机没有伤害攻击；其余 35 种各绘制独立四帧命中动画，另有 1 种无来源物理伤害兜底。素材通过内置 imagegen 生成，沿用参考 A 的深色轮廓、明亮色块和卡通碎片。

接触 35ms → 爆发 160ms → 碎裂 100ms → 消散 105ms（按后续实战反馈延长至 400ms）。常规命中为 56px，重击为 64px，首领为 72px；保留原始配色，方向从真实攻击/弹速取值。同源连续命中合并，异源最多两份，优先使用前景渲染池。无敌及受击保护帧保留接触动画，但不扣血、不触发受伤音效或震屏；未命中不播放接触，护盾完全吸收保留独立格挡反馈。

> 本页早期固定站位验收不足以证明移动、无敌、群战均正常。后续问题与复验范围见 [战斗修正记录](combat-corrections-2026-10-09.md)。

## 来源与材质

伤害来源随敌弹入池与回收，近战、冲锋、地面区、文档 Boss 技能、真伤均传入受击上下文。同一首领的特殊材质可选择对应元素动画，例如第一章首领的毒球与骨爪、祭司的冰/火/电、疫晶跳蛛的毒雨与晶矛、坩埚城兽的钢铁撞击与熔渣。

| 来源 | 命中形状 | 图集 / 行（1起算） |
| --- | --- | --- |
| grunt | 双爪撕裂 | anim_hit_units_1 / 1 |
| shield | 钢盾碎屑 | anim_hit_units_1 / 2 |
| exploder | 火团爆裂 | anim_hit_units_1 / 3 |
| golem | 岩块重砸 | anim_hit_units_1 / 4 |
| elite_grunt | 猩红三爪 | anim_hit_units_2 / 1 |
| archer | 尖叶毒液飞溅 | anim_hit_units_2 / 2 |
| miniboss | 紫晶裂隙 | anim_hit_units_2 / 3 |
| rust_biter | 锈齿咬合 | anim_hit_units_2 / 4 |
| needle_gunner | 钢针穿刺 | anim_hit_units_3 / 1 |
| ember_acolyte | 三瓣烬焰 | anim_hit_units_3 / 2 |
| frost_acolyte | 冰矛碎晶 | anim_hit_units_3 / 3 |
| acid_sac | 酸液泡沫 | anim_hit_units_3 / 4 |
| rivet_beast | 铆钉崩裂 | anim_hit_units_4 / 1 |
| arc_leech | 分叉电弧 | anim_hit_units_4 / 2 |
| blast_tick | 熔爆破片 | anim_hit_units_4 / 3 |
| squid | 深蓝水花 | anim_hit_units_4 / 4 |
| turtle | 玉甲重击 | anim_hit_units_5 / 1 |
| shrimp | 珊瑚交叉钳刃 | anim_hit_units_5 / 2 |
| jelly | 紫红毒刺 | anim_hit_units_5 / 3 |
| drone_a | 机械电浆 | anim_hit_units_5 / 4 |
| chain_hound | 链环爪痕 | anim_hit_units_6 / 1 |
| prism_snail | 三色棱晶 | anim_hit_units_6 / 2 |
| triune_priest | 三相雷火 | anim_hit_units_6 / 3 |
| rail_butcher | 锯齿切削 | anim_hit_units_6 / 4 |
| bell_devourer | 碎钟音裂 | anim_hit_units_7 / 1 |
| boss_ch1 | 骨爪血色碎片 | anim_hit_units_7 / 2 |
| boss_ch2 | 熔炉齿轮 | anim_hit_units_7 / 3 |
| boss_ch3 | 品红雷击 | anim_hit_units_7 / 4 |
| boss_ch4 | 虚空撕口 | anim_hit_units_8 / 1 |
| boss_mech | 光剑交叉斩 | anim_hit_units_8 / 2 |
| boss_abyss | 深海浪花 | anim_hit_units_8 / 3 |
| boss_vespa | 琥珀晶矛 | anim_hit_units_8 / 4 |
| boss_crucible_city | 熔渣喷发 | anim_hit_units_9 / 1 |
| boss_manyfold | 三面错位裂片 | anim_hit_units_9 / 2 |
| boss_invader | 导弹烈焰 | anim_hit_units_9 / 3 |
| physical | 物理碎石 | anim_hit_units_9 / 4 |

## 文件

- 成品：`assets/resources/art/anim_hit_units_1.png` 至 `anim_hit_units_9.png`，全部 1254×1254 RGBA，4×4 等格；meta 禁止动态合图。
- 提示词：`docs/art/style-a/impact-redesign-jobs.json`。
- 生成来源：`docs/art/style-a/impact-redesign-sources.json`。
- 验收入口：`tools/combat-review.html` 的“命中细查”和“全单位命中验收”，使用真实战斗更新并以生命值减少作为命中时间，非单独贴图展示。

## 验证

- 579 项自动化测试通过；覆盖 35 个独立图行、资源和 alpha、来源传递、回池清理、特殊材质、四帧采样与密集受击上限。
- TypeScript 类型检查通过。
- Cocos Creator 3.8.8 Web Desktop 构建通过；内置浏览器在 1280×720 游戏画布逐个运行攻击，35/35 种单位均真实扣血并产生有来源的命中动画。
- [全部单位命中对照](combat-qa-2026-10-09/impact-all-units.jpg)及[逐项结果](combat-qa-2026-10-09/impact-unit-coverage.json)。攻击无人机首次采到声波、三相祭司首次采到火焰，因此分别使用音裂和烬焰材质。
- 连续八帧核验：[普通小兵](combat-qa-2026-10-09/impact-grunt-frames.jpg)、[磁轨屠夫](combat-qa-2026-10-09/impact-rail-frames.jpg)、[万相首领](combat-qa-2026-10-09/impact-manyfold-frames.jpg)，命中可见，约 0.3 秒后消散，无通用受击圆环。
- 全单位验收脚本独立清理每组的持续伤害、buff、护盾和无敌时间，避免前一组毒伤污染下一组的命中检测。

原有图标、发射动画与弹体改动保持在待提交工作区。本轮不执行 git commit / push。
