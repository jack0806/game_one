# Hexblast — 工作区说明

Cocos Creator 3.8.8 顶视角射击 roguelite（TypeScript）。单场景 `assets/scenes/Game.scene`，画布 1280x720（见 `assets/scripts/core/Constants.ts`）。所有 UI/实体节点均由代码程序化构建，不在编辑器里摆 prefab。参考实现为外部 `hexblast-py` 项目，本项目是其 TS 重制版。

## 常用命令

```bash
npm test          # 先 tsc -p tsconfig.test.json 编译到 tests/dist，再 node --test 跑 tests/specs/*.test.js
npm run typecheck # tsc -p tsconfig.json --noEmit --skipLibCheck（依赖编辑器生成的 temp/tsconfig.cocos.json，需至少用 Cocos Creator 打开过一次项目）
```

没有 lint 脚本。`tests/dist/` 已被 gitignore，不要提交。

## 目录结构（assets/scripts/）

- `core/` — `GameManager`（单例，`GameManager.inst`，驱动状态机与主循环，持有全部系统）、`Constants`、`MathUtils`（Vec/Rng/clamp）、`SpriteUtils`、`LabelUtils`、`ArtRemap`
- `data/` — 纯静态数据：`CharacterDB`（角色）、`AugmentDB`（词条）、`WaveData`（章节/波次/变异）
- `systems/` — 玩法逻辑：`AugmentManager`、`Economy`、`EffectSystem`、`InputManager`、`ParticleManager`、`WaveManager`
- `entities/` — `PlayerController`、`EnemyBase`、`BossController`、`BulletController`（对象池）
- `ui/` — `HUD`、`AugSelectUI`、`ShopUI`、`ScreenManager`

分层规则：data 不依赖其他层；systems/entities/ui 只通过 GameManager 引用彼此；GameManager 是唯一的组合根。

## 测试体系（重要）

- 测试用 Node 内置 runner（`node:test` + `node:assert/strict`），不依赖引擎：`cc` 模块由本地文件依赖 `tests/stubs/cc` 桩掉（仅提供可 import 的符号）。
- 实体类都支持 headless 模式：构造时不传 `parent` Node 即不触任何引擎渲染路径。测试里用 `tests/specs/mockGame.js` 的 `makeMockGame()`/`makePlayer()` 提供最小模拟对象。新系统也应保持这种可 headless 测试的写法。
- **`tsconfig.test.json` 的 `include` 是显式文件清单**：新增需要被测试覆盖的 TS 源文件时，必须手动加入该清单，否则不会编译进 `tests/dist`，测试 require 会失败。
- 测试从 `../dist/<模块路径>` require 编译产物；新增测试文件放 `tests/specs/*.test.js`。
- `tests/specs/artmanifest.test.js` 会扫描代码中所有 art key 并断言 `assets/resources/art/` 下存在对应 PNG——新增 art 引用必须确保文件真实存在。

## 美术资源规则（易踩坑）

- **所有读取 `assets/resources/art/` 图片的代码必须经过 `core/ArtRemap.ts` 的 `artPath(key)`**，不要手拼路径：
  1. 部分素材文件名与内容错位（如 `bg_chapter1`/`bg_chapter4` 互为对方内容），`resolveArtKey()` 负责重定向。**禁止直接改磁盘 PNG 文件名**——会扰动 Cocos 已生成的 uuid/meta/library 缓存。
  2. `artPath()` 会拼上 `/spriteFrame` 后缀。用 `resources.load(path, SpriteFrame, cb)` 时若不带的此后缀，path 会命中 ImageAsset 记录导致引擎抛 "Bundle resources doesn't contain art/xxx"。

## 资源文档

`docs/` 存放美术/音频资源清单（`docs/art/art-inventory.md` 现有 49 图、`docs/art/art-needs.md` 待办、`docs/audio/audio-needs.md` 音频需求、`docs/prompts/` 即梦生成提示词）。涉及资源替换/新增的任务先读它们；替换图片只能覆盖同名文件内容，禁止改文件名。

## 代码约定

- 4 空格缩进；TS `strict: false`；注释、测试名均用中文，沿用现有风格。
- 日志只用 `console.warn`，带 `[模块名]` 前缀（见 `SpriteUtils.ts`、`ScreenManager.ts`）。
- 禁止修改 `.gitignore` 中列出的编辑器生成目录（`library/`、`temp/`、`local/`、`build/` 等）。
- 帧时间统一经 `DT_MAX`（Constants）钳制，防死亡螺旋；随机一律用 `MathUtils.Rng`。
