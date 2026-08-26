# Hexblast 资源文档索引

本目录存放美术 / 音频资源的需求与现状清单，供用即梦（Jimeng）生成图片、音乐资源时对照使用。

## 快速结论

| 类别 | 现状 | 结论 |
|------|------|------|
| 美术图片 | 54 张 PNG 全部存在；核心角色/VFX/金币/背景另有像素级门禁 | **无缺失**，本轮专业化升级已落地 |
| 音频 | 7 首 BGM + 17 个 SFX 已入库，`AudioManager` 已接入状态机与主要玩法事件 | **已接线**；缺独立 `sfx_heal` / `sfx_hex_activate`，当前使用现有音效映射 |

## 文档目录

```
docs/
├── README.md                  # 本文件：总览与索引
├── 怪物设计与数值.md          # 9 种炮灰、5 个分级小 Boss、3 个五技能大 Boss
├── art/
│   ├── art-inventory.md       # 现有 54 张图清单：key、用途、规格、引用位置
│   ├── art-needs.md           # 待办美术需求：缺口、可选升级项 + 生成规格
│   ├── visual-overhaul-plan-2026-08-20.md # 专业化视觉与听觉优化方案
│   └── implementation-audit-2026-08-20.md # 逐项实现证据与最终实机清单
├── audio/
│   ├── audio-needs.md         # 音频需求基线与完成状态
│   └── audio-integration-2026-08-20.md # 实际接线、音量、限流与 QA
└── prompts/
    ├── image-prompts.md       # 即梦生图提示词全集（背景/角色/敌人/特效/图标）
    └── audio-prompts.md       # 即梦音乐/音效生成提示词全集
```

## 使用即梦生成资源前的必读事项

1. **图片文件名必须与代码中的 art key 完全一致**（如 `ui_icon_fire.png`）。生成后直接**覆盖同名文件内容**，不要改文件名——改名会扰动 Cocos 的 uuid/meta 缓存，有资源丢失风险。
2. 少数文件名与内容错位的素材已通过 `assets/scripts/core/ArtRemap.ts` 重映射（详见 art-inventory.md 的背景章节说明），替换背景图时务必先读该说明，避免张冠李戴。
3. 新增资源（而非覆盖）时：文件放入 `assets/resources/art/`（音频放 `assets/resources/audio/`），用 Cocos Creator 打开一次项目让它生成 `.meta`，再按 art-needs.md 里的"接线清单"登记代码引用与 `tests/specs/artmanifest.test.js`。
4. 生成完成后运行 `npm test`；`artmanifest` 会拦截缺失资源，`visualmanifest` 会拦截核心 PNG 的黑底、尺寸和比例倒退，`audio.test` 会检查音频清单。
