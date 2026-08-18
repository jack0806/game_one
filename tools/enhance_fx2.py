# -*- coding: utf-8 -*-
"""
enhance_fx2.py — fx_explosion / fx_hex_ring 针对性二轮增强

v1（enhance_fx.py）的视觉复核结论：
- fx_explosion 光刺"硬边、外端未羽化、无白心渐变、长度太均匀"；
- fx_hex_ring "无发光感、中心无焦点，像 HUD 图标不像特效"。

二轮做法（都从 temp/art_pipeline_test/ 里的"已抠图未增强"版本重新开始，
避免在已增强结果上二次叠加）：
- fx_explosion：10 根随机角度/长度/宽度的角向高斯光刺，径向两端羽化，
  颜色按半径从白→橙→深橙渐变，整体再轻羽化。
- fx_hex_ring：中心白色能量核（径向高斯亮斑）、原六边形亮线外扩成青色
  辉光（大 σ 高斯 screen 叠加）、亮线自身 alpha 提亮。
"""
import os
import shutil

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "assets", "resources", "art")
STAGE = os.path.join(ROOT, "temp", "art_pipeline_test")


def angular_distance(a, b):
    d = np.abs(a - b) % (2 * np.pi)
    return np.minimum(d, 2 * np.pi - d)


def grid(size):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    c = (size - 1) / 2
    dx, dy = xx - c, c - yy  # y 向上为正
    return np.arctan2(dy, dx), np.hypot(dx, dy) / (size / 2)


def enhance_explosion():
    src = os.path.join(STAGE, "fx_explosion.png")
    img = cv2.imread(src, cv2.IMREAD_UNCHANGED)
    h, w = img.shape[:2]
    ang, r = grid(max(h, w))
    ang = cv2.resize(ang, (w, h))
    r = cv2.resize(r, (w, h))

    rng = np.random.default_rng(41)
    field = np.zeros_like(r)
    for _ in range(9):
        a0 = rng.uniform(0, 2 * np.pi)
        length = rng.uniform(0.62, 1.05)
        width = rng.uniform(0.10, 0.22)
        prof = np.exp(-(angular_distance(ang, a0) / width) ** 2)
        radial = np.clip((r - 0.40) / 0.08, 0, 1) * np.clip((length - r) / 0.30, 0, 1)
        field = np.maximum(field, prof * np.clip(radial, 0, 1))
    # 内端亮、外端暗：光刺要像从火球里"射"出来的光，不是等宽线条
    field *= np.clip(1.25 - r * 0.75, 0.25, 1.0)
    field = cv2.GaussianBlur(field, (0, 0), max(3.0, w / 150))

    # 颜色随半径：内端亮白黄（高温）→ 外端橙（冷却）
    t = np.clip((r - 0.40) / 0.50, 0, 1)[..., None]
    hot = np.array([225, 250, 255], np.float32)    # BGR 白黄
    orange = np.array([30, 120, 255], np.float32)
    col = hot * (1 - t) + orange * t
    heat = np.clip(field * 1.45, 0, 1)[..., None]

    rgb = img[:, :, :3].astype(np.float32)
    rgb = rgb * (1 - heat) + col * heat
    alpha = np.maximum(img[:, :, 3].astype(np.float32), field * 255)
    out = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8),
                     np.clip(alpha, 0, 255).astype(np.uint8)])
    dst = os.path.join(ART, "fx_explosion.png")
    cv2.imwrite(dst, out)
    print("[boom2] fx_explosion rewritten (10 randomized streaks, white core)")


def enhance_hex_ring():
    src = os.path.join(STAGE, "fx_hex_ring.png")
    img = cv2.imread(src, cv2.IMREAD_UNCHANGED)
    h, w = img.shape[:2]
    ang, r = grid(max(h, w))
    r = cv2.resize(r, (w, h))

    # 1) 外辉光：alpha 亮线大 σ 模糊 → 青色 glow，screen 叠加
    a = img[:, :, 3].astype(np.float32) / 255
    rgb = img[:, :, :3].astype(np.float32)
    glow_a = cv2.GaussianBlur(a, (0, 0), max(6.0, w / 70))
    cyan = np.array([255, 235, 120], np.float32)  # BGR 青偏绿
    rgb = 255 - (255 - rgb) * (255 - cyan * glow_a[..., None]) / 255  # screen

    # 2) 中心能量核：白色径向高斯亮斑（r<0.3）
    core = np.exp(-(r / 0.16) ** 2) * 1.15
    core = np.clip(core, 0, 1)
    rgb = rgb * (1 - core[..., None]) + np.array([235, 250, 255], np.float32) * core[..., None]

    # 3) alpha：原亮线提亮 + 辉光 + 能量核
    alpha = np.clip(np.maximum(a * 255 * 1.15, glow_a * 165), 0, 255)
    alpha = np.maximum(alpha, core * 235)
    out = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8),
                     alpha.astype(np.uint8)])
    dst = os.path.join(ART, "fx_hex_ring.png")
    cv2.imwrite(dst, out)
    print("[ring2] fx_hex_ring rewritten (core hotspot + cyan glow)")


if __name__ == "__main__":
    enhance_explosion()
    enhance_hex_ring()
    # 其余三张维持 v1 的轻增强，不再动
    _ = shutil  # （占位：不需要额外拷贝）
