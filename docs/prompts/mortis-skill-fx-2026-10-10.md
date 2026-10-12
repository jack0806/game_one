# 即梦生图提示词 · 亡灵法师技能特效四件套（2026-10-10）

> 对应 `docs/art/art-needs.md` C 节四项需求：`fx_rot_fog` / `fx_plague_wave` / `fx_bone_spear`（覆盖 `bullet_mortis`）/ `unit_skeleton`。
> 沿用 `image-prompts.md` 的通用规则：**纯黑背景生成 → 抠图去黑底导出带 Alpha 的 PNG**；同批次生成或用即梦"参考图"上传现有 fx 图保持风格统一；英文约束短语整段保留。
> 保存位置：`assets/resources/art/` 下对应文件名；`bullet_mortis.png` 为覆盖同名，其余三张为新增（需编辑器打开一次生成 .meta 后接代码）。

## 1. `fx_rot_fog.png` — 腐雾领域地面雾（1:1 · 需透明）

**登场场景**：E 腐雾领域释放后，地面上的半径 350 码毒雾区域，持续 5 秒，显示约 700px 圆形铺地；雾内怪物持续掉血减速。作为地面叠加层，中心略透（能看见地面与雾内单位），边缘必须柔和淡出。

```
顶视角射击游戏的地面范围特效贴图，正方形构图。相机垂直90度正俯视，一片圆形的死亡毒雾区域占据画面中心：瘟绿色毒雾呈缓慢漩涡状旋转，中心密度略低、隐约透出地面，中环浓雾堆积成环带，边缘化作丝缕状雾气逐渐消散，雾中漂浮细小的骨骼碎屑与幽绿光粒，整体发光通透。海克斯科技幻想风格，主色瘟绿#a8e06e与暗沼绿，边缘必须干净利落地淡出，无硬边、无画布裁切感。纯黑色背景，无文字，无UI，无人物。top-down 90° overhead view, circular poison fog zone, soft fading edges, glow effect, on pure black background for alpha extraction.
```

## 2. `fx_plague_wave.png` — 亡者天灾灵魂冲击波（1:1 · 需透明）

**登场场景**：R 亡者天灾施放瞬间，从角色位置向外扩散的灵魂冲击波（程序会随时间放大+淡出，只需一张静态环）。环中心必须空无（透底），代码按环形叠加在角色身上。

```
顶视角射击游戏的环形冲击波特效贴图，正方形构图。一个完整的圆环状灵魂冲击波：外环为浓烈的瘟绿色能量环带，内侧紧贴一圈骨白色能量细环，环带上分布细小的骷髅纹样与六边形符文碎片，环内外两侧有细碎的幽绿灵魂光粒飞散，环中心完全空无（透出黑底）。冲击波有速度感和能量感，环形左右上下对称，边缘干净。海克斯科技幻想风格，骨白#e8e2d0+瘟绿#a8e06e双色。纯黑色背景，无文字，无UI。top-down view, single complete shockwave ring, empty center, symmetrical, glowing energy ring on pure black background.
```

## 3. `fx_bone_spear.png` — 白骨之矛弹体（1:1 · 需透明 · **覆盖 `bullet_mortis.png` 同名**）

**登场场景**：Q 白骨之矛的飞行弹体，程序按飞行方向旋转贴图，显示约 40×40px。**引擎会对弹体整体染色**（莫提斯染骨白 #e8e2d0）→ 底图必须是接近纯白的浅灰白素体，不能自带饱和色。长矛水平放置、左右贯穿画布、上下留呼吸空间（方画布+横置主体，旋转后任意方向都不变形）。

```
顶视角射击游戏的投射物贴图，正方形构图。一支水平指向右方的白骨长矛：细长的骨白色矛杆由多节兽骨拼接，表面有骨节纹理与轻微裂纹，矛头是打磨锋利的尖锥骨刺，矛尾末端缠绕碎骨与两片小骨翼，矛身周围有极淡的白色能量光晕。素体为接近纯白的浅灰白，无任何饱和色（引擎整体染色）。主体水平居中，左右贯穿画布，上下留呼吸空间。海克斯科技幻想风格。纯黑色背景，无文字，无UI。horizontal bone spear projectile, light gray-white body, centered, subtle energy halo, on pure black background, no saturated colors.
```

## 4. `unit_skeleton.png` — 骸骨仆从立绘（1:1 · 需透明）

**登场场景**：被动"骸骨军团"与 R"亡者天灾"召唤的仆从，俯视小单位，显示约 40px，会朝任意方向移动但**贴图不转向**→ 正俯视对称构图最耐看。中低亮度骨白（给受击闪白留余量），瘟绿眼窝是辨识度锚点。

```
顶视角射击游戏的召唤单位贴图，正方形构图。相机垂直90度正俯视的一具骸骨仆从：从正上方看到的骷髅士兵全身骨架，头骨朝上位于构图上方，肋骨与脊柱清晰可辨，双臂骨持一柄小骨刀，腿骨呈迈步姿态；骨质为中低亮度的骨白色（灰白偏暗），眼窝深处透出两点瘟绿色幽光#a8e06e，骨架缝隙缠绕几缕瘟绿灵魂雾气。大轮廓、高对比、少细节，缩小到40像素仍一眼可辨。海克斯科技幻想风格。纯黑色背景，无文字，无UI。top-down 90° overhead skeleton warrior, skull pointing up, dark bone white with glowing green eye sockets, big silhouette readable at small size, on pure black background.
```

## 入库清单

| 文件名 | 类型 | 入库后动作 |
|---|---|---|
| `fx_rot_fog.png` | 新增 | 编辑器开一次生成 .meta → 我接 rotFog 分支 Sprite 渲染 |
| `fx_plague_wave.png` | 新增 | 同上，接 plagueWave 分支 |
| `bullet_mortis.png` | **覆盖同名** | 零代码改动，直接生效 |
| `unit_skeleton.png` | 新增 | 接 skeleton 分支（保留血条环/浮现动画的程序叠加） |
