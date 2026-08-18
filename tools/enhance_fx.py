# -*- coding: utf-8 -*-
"""
enhance_fx.py — fx_* 特效贴图"去图片感"增强

用户反馈特效贴图"一眼看出来是图片，太假"。抠图（黑底→透明）已解决最大
的"黑方框"问题，这里再做两层图像侧增强，让 fx 更像程序特效而不是照片：

1. fx_explosion：叠加程序生成的放射状光刺（radial streaks，多谐波角向
   噪声 + 径向高斯衰减），只作用于外围（r>0.4），核心仍用原美术。
2. 全体 fx：饱和度+18%、亮度曲线提亮中间调、alpha 做 gamma 0.9 提亮，
   正常混合下呈现接近加法发光的观感。

处理直接覆盖 assets/resources/art/ 下的同名文件（备份在
temp/art_backup_before_cutout/，那里保存的是未抠图原图）。
"""
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "assets", "resources", "art")


def radial_streaks(size: int, seed: int = 7) -> np.ndarray:
    """放射状光刺强度场 [0,1]，多组角向谐波+随机相位，径向高斯衰减。"""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    cx = cy = (size - 1) / 2
    dx, dy = xx - cx, cy - yy
    ang = np.arctan2(dy, dx)
    r = np.sqrt(dx * dx + dy * dy) / (size / 2)
    rng = np.random.default_rng(seed)
    field = np.zeros_like(r)
    for freq, power, weight in [(9, 2.2, 0.5), (17, 3.0, 0.32), (29, 4.0, 0.18)]:
        phase = rng.uniform(0, 2 * np.pi)
        stripe = (0.5 + 0.5 * np.cos(ang * freq + phase)) ** power
        field += weight * stripe
    # 只亮外围（核心交给原美术），径向衰减到 r=1.0
    falloff = np.exp(-((r - 0.55) / 0.42) ** 2) * np.clip((r - 0.40) / 0.12, 0, 1)
    return np.clip(field * falloff, 0, 1)


def enhance_explosion(path: str) -> None:
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None or img.shape[2] != 4:
        print(f"[skip] {os.path.basename(path)}")
        return
    h, w = img.shape[:2]
    s = max(h, w)
    streak = radial_streaks(s, seed=11)
    streak = cv2.resize(streak, (w, h))
    # 光刺颜色：橙→白，按强度混入原像素
    heat = np.clip(streak * 1.35, 0, 1)[..., None]
    col = np.array([60, 150, 255], np.float32)  # BGR 橙白
    rgb = img[:, :, :3].astype(np.float32)
    rgb = rgb * (1 - heat) + col * heat
    alpha = img[:, :, 3].astype(np.float32)
    alpha = np.clip(np.maximum(alpha, streak * 255), 0, 255)
    out = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), alpha.astype(np.uint8)])
    cv2.imwrite(path, out)
    print(f"[boom ] {os.path.basename(path)}: streaks added")


def enhance_glow_soft(path: str, sat=1.18, mid=1.12, alpha_gamma=0.9) -> None:
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None or img.shape[2] != 4:
        print(f"[skip] {os.path.basename(path)}")
        return
    hsv = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2HSV)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * sat, 0, 255).astype(np.uint8)
    v = hsv[:, :, 2].astype(np.float32)
    hsv[:, :, 2] = np.clip(255 * (v / 255) ** (1 / mid), 0, 255).astype(np.uint8)
    rgb = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    a = img[:, :, 3].astype(np.float32) / 255
    a = np.clip(a ** alpha_gamma * 255, 0, 255).astype(np.uint8)
    cv2.imwrite(path, np.dstack([rgb, a]))
    print(f"[glow+] {os.path.basename(path)}")


def main():
    fx_dir = [f for f in sorted(os.listdir(ART))
              if f.startswith("fx_") and f.endswith(".png")]
    for f in fx_dir:
        p = os.path.join(ART, f)
        if f == "fx_explosion.png":
            enhance_explosion(p)
        else:
            enhance_glow_soft(p)


if __name__ == "__main__":
    main()
