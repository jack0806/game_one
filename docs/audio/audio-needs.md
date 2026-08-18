# 音频资源需求清单（全新，从零开始）

盘点结论：代码中**没有任何音频系统**（全仓无 AudioSource/AudioClip/audio 相关引用），`assets/` 下没有任何音频文件。BGM 与 SFX 均需从零生成 + 接线。

---

## 0. 前置代码任务（生成资源之前先做）

1. 建 `assets/resources/audio/` 目录（BGM 与 SFX 建议分子目录：`audio/bgm/`、`audio/sfx/`）。
2. 新建 `assets/scripts/systems/AudioManager.ts`：
   - 挂在 GameManager 根节点上的 `@ccclass` 组件，模仿现有系统单例风格（参考 `GameManager.inst`）；
   - BGM：常驻 AudioSource，`resources.load('audio/bgm/<key>/clip', AudioClip, ...)` 加载后循环播放，支持切换时淡入淡出；
   - SFX：one-shot 播放（`AudioSource.playOneShot(clip, volume)`），内置并发限流（射击/命中类高频音效防止爆音）；
   - headless 测试兼容：构造不依赖 Node 时静默空操作（参考 `tests/stubs/cc` 与 mockGame 模式，`cc` 桩里需要补 `AudioSource`/`AudioClip`/`playOneShot` 符号）。
3. `GameManager` 状态机切换处调 `AudioManager.playBgm(...)`；各系统命中/死亡/拾取处调 `playSfx(...)`。
4. 若新增 `tsconfig.test.json` 编译目标（AudioManager），记得把文件加进其 `include` 清单。

## 1. BGM 需求（7 条，即梦音乐生成）

| 建议 key | 场景 | 风格提示词要点 | 时长/格式 |
|---|---|---|---|
| `bgm_title` | 标题屏 | 科技感氛围电子，低沉铺垫，器乐循环 | 60–90s 可无缝循环，mp3 |
| `bgm_ch1` | 第1章 废土街道 | 后朋克/废土工业，萧瑟城市废墟感 | 2–3min 循环 |
| `bgm_ch2` | 第2章 钢铁工厂 | 重工业电子，金属打击，熔炉轰鸣节奏 | 2–3min 循环 |
| `bgm_ch3` | 第3章 海克斯实验室 | 施法科技/辐射感，诡异合成器，海克斯魔法风 | 2–3min 循环 |
| `bgm_ch4` | 第4章 混沌位面 | 史诗管弦+失真电子，现实崩塌的压迫感 | 2–3min 循环 |
| `bgm_boss` | Boss 波（每章第10波） | 战斗高潮版本，急促鼓点，紧张 | 2min 循环 |
| `bgm_shop` | 商店/结算 | 轻松弛放，与战斗曲反差 | 60–90s 循环 |

> 章名与主题对照 `WaveData.ts` 的 CHAPTERS。无尽模式（41 波起）可复用 `bgm_ch4`。

## 2. SFX 需求（19 条，即梦音效生成）

> 每条的具体生成提示词见 `docs/prompts/audio-prompts.md`。命名建议 `sfx_<名>.mp3`，时长 0.2–1.5s，单声道小体积。

| 建议 key | 触发点（代码位置参考） | 要求 |
|---|---|---|
| `sfx_shoot` | `PlayerController` 开火 | 清脆短促，可高频重复不腻 |
| `sfx_hit` | 子弹命中敌人（`BulletController` 命中分支） | 轻打击感 |
| `sfx_enemy_die` | 敌人死亡（`EnemyBase` 死亡） | 干脆的消亡音 |
| `sfx_explode` | 爆炸类事件（自爆怪/爆炸词条/`fx_explosion` 触发处） | 低频轰鸣 |
| `sfx_boss_roar` | Boss 出现（`BossController` 初始化） | 压迫感吼叫 |
| `sfx_player_hurt` | 玩家受伤（`PlayerController.takeDamage`） | 提示性痛感，不刺耳 |
| `sfx_player_die` | 玩家死亡 → gameover 状态切换 | 低沉终止感 |
| `sfx_gold` | 金币拾取（`Economy` 拾取分支） | 清脆叮声 |
| `sfx_buy` | 商店购买成功（`ShopUI` 购买回调） | 确认音 |
| `sfx_button` | 通用按钮点击（各 UI 点击处） | 轻 UI 音 |
| `sfx_augment_pick` | 选定词条（`AugSelectUI` 确认） | 升格/获得感 |
| `sfx_levelup` | 升级弹出词条选择（进入 `augSelect` 状态） | 正反馈上扬音 |
| `sfx_skill_q` / `sfx_skill_e` / `sfx_skill_r` | 三类技能释放（`PlayerController` 技能施放） | 可先用 3 个通用音，后期按 6 角色分化 |
| `sfx_freeze` | 冰冻控制生效 | 结晶/冻结碎裂感 |
| `sfx_lightning` | 连锁闪电（`AugmentManager` chain 触发） | 电弧噼啪 |
| `sfx_heal` | 治疗生效（`fx_heal` 触发处） | 温和上扬 |
| `sfx_hex_activate` | 海克斯技能激活（`fx_hex_ring` 触发处） | 能量充能释放 |

## 3. 落地核对清单

- [ ] AudioManager + cc 桩补齐，`npm test` 保持全绿
- [ ] `assets/resources/audio/bgm/*.mp3` × 7 入库并接线
- [ ] `assets/resources/audio/sfx/*.mp3` 入库并接线
- [ ] `artmanifest.test.js` 扩展为音频清单自检（扫描代码中的 audio key，断言文件存在——与 art 同思路）
- [ ] Cocos Creator 实机预览：音量平衡（BGM 约 0.4–0.6，SFX 0.7–1.0）、循环接缝检查
