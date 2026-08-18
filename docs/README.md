# Hexblast 资源文档索引

本目录存放美术 / 音频资源的需求与现状清单，供用即梦（Jimeng）生成图片、音乐资源时对照使用。

## 快速结论

| 类别 | 现状 | 结论 |
|------|------|------|
| 美术图片 | 49 张 PNG 全部存在且被代码引用（86 个单测全过） | **无缺失**，可按需升级重生成 |
| 音频 | 代码中没有任何音频系统（无 AudioSource/AudioClip），`assets/` 下无任何音频文件 | **完全缺失**，需要先加代码播放层再生成资源 |

## 文档目录

```
docs/
├── README.md                  # 本文件：总览与索引
├── art/
│   ├── art-inventory.md       # 现有 49 张图清单：key、用途、规格、引用位置
│   └── art-needs.md           # 待办美术需求：缺口、可选升级项 + 生成规格
├── audio/
│   └── audio-needs.md         # 音频需求清单：BGM / SFX 全量列表 + 落地步骤
└── prompts/
    ├── image-prompts.md       # 即梦生图提示词全集（背景/角色/敌人/特效/图标）
    └── audio-prompts.md       # 即梦音乐/音效生成提示词全集
```

## 使用即梦生成资源前的必读事项

1. **图片文件名必须与代码中的 art key 完全一致**（如 `ui_icon_fire.png`）。生成后直接**覆盖同名文件内容**，不要改文件名——改名会扰动 Cocos 的 uuid/meta 缓存，有资源丢失风险。
2. 少数文件名与内容错位的素材已通过 `assets/scripts/core/ArtRemap.ts` 重映射（详见 art-inventory.md 的背景章节说明），替换背景图时务必先读该说明，避免张冠李戴。
3. 新增资源（而非覆盖）时：文件放入 `assets/resources/art/`（音频放 `assets/resources/audio/`），用 Cocos Creator 打开一次项目让它生成 `.meta`，再按 art-needs.md 里的"接线清单"登记代码引用与 `tests/specs/artmanifest.test.js`。
4. 生成完成后运行 `npm test`，artmanifest 自检会拦截拼写/映射错误导致的静默加载失败。
