# -*- coding: utf-8 -*-
"""
cutout_art.py — assets/resources/art/ 批量抠图管线 v2

背景：即梦生成的素材全部是"近黑背景、无透明通道"的 RGB PNG（49 张里 48 张无 alpha），
直接进游戏会顶着黑色方框渲染，这是"特效一眼假"的最大来源。

两类处理：
  GLOW （bullet_* / fx_* / ui_icon_*）——自发光体，黑底 → 亮度软阈值转 alpha，
        颜色保持不变。阈值按用途分类：子弹要保纹理（阈值低）、图标要锐利
        （阈值高）、特效要保雾气（居中）。
  SOLID（enemy_* / char_token_* / char_*）——不透明实体。v1 用浮动阈值
        floodFill 会顺着暗部渐变"爬进"主体（吃掉 grunt 四肢 / boss 翅膀 /
        kai 半张脸），v2 改为 FIXED_RANGE：只吃与各边界种子自身颜色相近的
        像素，主体的彩色像素无论如何渐变都不会被吃；再叠加一层"极暗全局
        遮罩"兜底、连通域除尘、闭运算、填洞、羽化。不做任何暗色压碎。

bg_* / title_screen 是全屏图，不处理。
char_token_liana 生成时已带透明通道，只做裁剪+缩放对齐。

处理结果直接覆盖原文件（备份在 temp/art_backup_before_cutout/），
文件名不变以维持 Cocos 的 uuid/meta 映射（工作区规则：只覆盖内容，不改名）。

用法：python tools/cutout_art.py [--dry]   （可用环境变量 ART_DIR 重定向输出目录做沙盒测试）
"""
import os
import sys

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.environ.get("ART_DIR") or os.path.join(ROOT, "assets", "resources", "art")

# 每类目标输出尺寸（最长边）。游戏内显示尺寸都很小（子弹10px、图标30px、
# 敌人最大292px），2048 的原图纯属浪费显存与加载时间。
SOLID_SIZE = {
    "enemy_boss": 768,
    "enemy": 512,
    "char_token": 256,
    "char": 640,
}
# glow 类：(lo, hi, gamma) —— hi 越低主体越"实"，越高边缘越柔。
GLOW_PARAMS = {
    "bullet":  (6, 60, 0.75),   # 保住弹面纹理与外形
    "fx":      (5, 80, 0.85),   # 保留雾气/光晕的渐变
    "ui_icon": (10, 115, 0.85), # 符号要锐利，底要干净
}
GLOW_SIZE = {
    "bullet": 128,
    "ui_icon": 256,
    "fx": 512,
}


def list_files(prefixes):
    out = []
    for f in sorted(os.listdir(ART)):
        if not f.endswith(".png"):
            continue
        name = f[:-4]
        for p in prefixes:
            if name == p or name.startswith(p + "_") or name.startswith(p):
                out.append(name)
                break
    return out


def luminance_alpha(bgr: np.ndarray, lo, hi, gamma, blur=1.2):
    """GLOW 类：以逐像素最大通道值当亮度，软阈值转 alpha，颜色保持不变。"""
    lum = bgr.max(axis=2).astype(np.float32)
    a = np.clip((lum - lo) / (hi - lo), 0.0, 1.0) ** gamma
    a = cv2.GaussianBlur(a, (0, 0), blur)
    return (a * 255).astype(np.uint8)


def floodfill_bg_mask(bgr: np.ndarray, work=768, diff=14):
    """SOLID 类背景提取：缩小图上从边界密集播种，FIXED_RANGE 只吃与种子
    自身颜色相近的像素（背景近黑且均匀，主体彩色像素不会被吃）。"""
    small = cv2.resize(bgr, (work, work), interpolation=cv2.INTER_AREA)
    h, w = small.shape[:2]
    mask = np.zeros((h + 2, w + 2), np.uint8)
    flags = 4 | cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (1 << 8)
    seeds = []
    step = 6
    for x in range(0, w, step):
        seeds += [(x, 0), (x, h - 1)]
    for y in range(0, h, step):
        seeds += [(0, y), (w - 1, y)]
    for seed in seeds:
        cv2.floodFill(
            small.copy(), mask, seed, (0, 0, 0),
            (diff, diff, diff), (diff, diff, diff), flags,
        )
    bg = mask[1:-1, 1:-1] == 1
    return bg


def clean_fg_mask(fg_small: np.ndarray):
    """连通域除尘 + 闭运算桥接细缝 + 填内部洞。"""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(fg_small.astype(np.uint8), 8)
    if n <= 1:
        return fg_small
    areas = stats[1:, cv2.CC_STAT_AREA]
    keep = 1 + np.where(areas >= max(60, areas.max() * 0.004))[0]
    out = np.isin(labels, keep)
    out = cv2.morphologyEx(out.astype(np.uint8), cv2.MORPH_CLOSE,
                           np.ones((3, 3), np.uint8)).astype(bool)
    # 填内部洞：不与边界连通的透明区域 → 不透明。
    # 只填小洞（< fg 面积 2%）：大洞往往是"主体肢体间露出的背景缝隙"
    # （闭运算把窄缝封死后 flood 进不去），填了就会留下黑块。
    inv = (~out).astype(np.uint8)
    n2, lab2 = cv2.connectedComponents(inv)
    border = set(lab2[0, :]) | {0} | set(lab2[-1, :]) | set(lab2[:, 0]) | set(lab2[:, -1])
    area_lim = out.sum() * 0.02
    holes = np.isin(lab2, [l for l in range(1, n2)
                           if l not in border and (lab2 == l).sum() <= area_lim])
    return out | holes.astype(bool)


def trim(bgra: np.ndarray, thresh=8, margin=6):
    """按 alpha 包围盒裁剪，留 margin 像素余量。"""
    a = bgra[:, :, 3]
    ys, xs = np.where(a > thresh)
    if len(xs) == 0:
        return bgra
    x0, x1 = max(0, xs.min() - margin), min(a.shape[1], xs.max() + 1 + margin)
    y0, y1 = max(0, ys.min() - margin), min(a.shape[0], ys.max() + 1 + margin)
    return bgra[y0:y1, x0:x1]


def fit_size(img: np.ndarray, target: int):
    h, w = img.shape[:2]
    scale = target / max(h, w)
    if scale >= 1.0:
        return img
    return cv2.resize(img, (max(1, round(w * scale)), max(1, round(h * scale))),
                      interpolation=cv2.INTER_AREA)


def process_glow(name: str, target: int, lo, hi, gamma, dry=False):
    path = os.path.join(ART, name + ".png")
    bgr = cv2.imread(path, cv2.IMREAD_COLOR)
    if bgr is None:
        print(f"[skip] {name}: read fail")
        return
    alpha = luminance_alpha(bgr, lo, hi, gamma)
    bgra = np.dstack([bgr, alpha])
    bgra = fit_size(trim(bgra), target)
    if not dry:
        cv2.imwrite(path, bgra)
    print(f"[glow ] {name}: -> {bgra.shape[1]}x{bgra.shape[0]}")


def process_solid(name: str, target: int, dry=False):
    path = os.path.join(ART, name + ".png")
    bgr = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if bgr is None:
        print(f"[skip] {name}: read fail")
        return
    if bgr.shape[2] == 4:
        # 已带透明（如 char_token_liana）：只裁剪+缩放
        bgra = fit_size(trim(bgr.copy()), target)
        if not dry:
            cv2.imwrite(path, bgra)
        print(f"[solid] {name}: already-alpha -> {bgra.shape[1]}x{bgra.shape[0]}")
        return
    h, w = bgr.shape[:2]
    bg_small = floodfill_bg_mask(bgr)
    # 兜底：极暗像素（max 通道 < 26）无论 flood 是否命中都算背景
    very_dark_small = cv2.resize(bgr, bg_small.shape[::-1],
                                 interpolation=cv2.INTER_AREA).max(axis=2) < 26
    bg_small = bg_small | very_dark_small
    fg_small = clean_fg_mask(~bg_small)
    # 放大回原尺寸 → 轻羽化。SOLID 类不做暗色压碎（会误杀主体暗部）。
    fg = cv2.resize(fg_small.astype(np.float32), (w, h),
                    interpolation=cv2.INTER_LINEAR)
    alpha = (np.clip(cv2.GaussianBlur(fg, (0, 0), max(1.3, h / 500)), 0, 1) * 255)
    alpha = alpha.astype(np.uint8)
    bgra = np.dstack([bgr, alpha])
    bgra = fit_size(trim(bgra), target)
    if not dry:
        cv2.imwrite(path, bgra)
    print(f"[solid] {name}: -> {bgra.shape[1]}x{bgra.shape[0]}")


def main():
    dry = "--dry" in sys.argv
    glow_files = list_files(GLOW_PARAMS.keys())
    solid_files = list_files(SOLID_SIZE.keys())
    for name in glow_files:
        prefix = next(k for k in GLOW_PARAMS if name.startswith(k))
        lo, hi, gamma = GLOW_PARAMS[prefix]
        process_glow(name, GLOW_SIZE[prefix], lo, hi, gamma, dry)
    for name in solid_files:
        target = next(v for k, v in SOLID_SIZE.items() if name.startswith(k))
        process_solid(name, target, dry)
    print(f"\ndone. glow={len(glow_files)} solid={len(solid_files)} dry={dry}")


if __name__ == "__main__":
    main()
