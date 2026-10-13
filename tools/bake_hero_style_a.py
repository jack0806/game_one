"""从已审核的三视图母稿烘焙八英雄的运行时立绘和动作图集。"""

from __future__ import annotations

import json
import math
import os
import time
import uuid
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
MASTERS = ROOT / "docs/art/style-a/hero-redesign/masters"
ACTION_MASTERS = ROOT / "docs/art/style-a/hero-redesign/action-masters"
SKILL_MASTERS = ROOT / "docs/art/style-a/hero-redesign/skill-masters"
ART = ROOT / "assets/resources/art"
HEROES = ("kai", "vivian", "reik", "olia", "graf", "liana", "via", "mortis")
VIEWS = ("front", "side", "back")
SOURCE_BREAKS = {
    "kai": (710, 1190), "vivian": (530, 1018), "reik": (714, 1145),
    "olia": (530, 1015), "graf": (710, 1145), "liana": (585, 1030),
    "via": (520, 1018), "mortis": (620, 1110),
}
COLORS = {
    "kai": (32, 227, 249), "vivian": (38, 190, 250),
    "reik": (252, 75, 62), "olia": (110, 218, 255),
    "graf": (209, 88, 252), "liana": (129, 227, 255),
    "via": (251, 197, 80), "mortis": (150, 237, 112),
}
ACTIONS = ("idle", "walk", "run", "jump", "attack", "hit", "defeated",
           "skill", "skill2", "skill3", "attackMelee")


def save_png(image: Image.Image, name: str, size: tuple[int, int] | None = None) -> None:
    path = ART / f"{name}.png"
    if size is not None:
        image = image.resize(size, Image.Resampling.LANCZOS)
    staged = MASTERS.parent / f".{name}.png.work"
    image.save(staged, format="PNG", optimize=True)
    if path.exists():
        payload = staged.read_bytes()
        for attempt in range(12):
            try:
                with path.open("r+b") as target:
                    target.seek(0)
                    target.write(payload)
                    target.truncate()
                staged.unlink()
                break
            except OSError:
                if attempt == 11:
                    raise
                time.sleep(0.3)
    else:
        os.replace(staged, path)
    if path.with_suffix(".png.meta").exists():
        update_meta(path, image.size)
    else:
        create_meta(path, image.size)


def update_meta(path: Path, size: tuple[int, int]) -> None:
    meta_path = path.with_suffix(".png.meta")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    frame = meta["subMetas"]["f9941"]["userData"]
    w, h = size
    frame.update(trimX=0, trimY=0, offsetX=0, offsetY=0, width=w, height=h,
                 rawWidth=w, rawHeight=h)
    v = frame["vertices"]
    v["rawPosition"] = [-w / 2, -h / 2, 0, w / 2, -h / 2, 0,
                        -w / 2, h / 2, 0, w / 2, h / 2, 0]
    v["uv"] = [0, h, w, h, 0, 0, w, 0]
    v["nuv"] = [0, 0, 1, 0, 0, 1, 1, 1]
    v["minPos"] = [-w / 2, -h / 2, 0]
    v["maxPos"] = [w / 2, h / 2, 0]
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def create_meta(path: Path, size: tuple[int, int]) -> None:
    template = ART / "anim_kai_front.png.meta"
    meta = json.loads(template.read_text(encoding="utf-8"))
    old = meta["uuid"]
    fresh = str(uuid.uuid4())
    name = path.stem
    raw = json.dumps(meta).replace(old, fresh).replace("anim_kai_front", name)
    path.with_suffix(".png.meta").write_text(raw, encoding="utf-8")
    update_meta(path, size)


def isolate_views(hero: str) -> dict[str, Image.Image]:
    source = Image.open(MASTERS / f"{hero}.png").convert("RGBA")
    b1, b2 = SOURCE_BREAKS[hero]
    bounds = (0, b1, b2, source.width)
    result = {}
    for index, view in enumerate(VIEWS):
        crop = source.crop((bounds[index], 0, bounds[index + 1], source.height))
        pixels = np.asarray(crop).copy()
        occupied = (pixels[:, :, 3] > 12).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(occupied, 8)
        if count > 1:
            main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            pixels[labels != main] = 0
            crop = Image.fromarray(pixels, "RGBA")
        alpha = crop.getchannel("A")
        box = alpha.point(lambda a: 255 if a > 12 else 0).getbbox()
        if box is None:
            raise ValueError(f"{hero}/{view} 没有可见像素")
        result[view] = crop.crop(box)
    return result


def fit(image: Image.Image, size: tuple[int, int], maximum: tuple[int, int],
        center: tuple[int, int]) -> Image.Image:
    scale = min(maximum[0] / image.width, maximum[1] / image.height)
    content = image.resize((round(image.width * scale), round(image.height * scale)),
                           Image.Resampling.LANCZOS)
    out = Image.new("RGBA", size)
    x = center[0] - content.width // 2
    y = center[1] - content.height // 2
    out.alpha_composite(content, (x, y))
    return out


def warp(image: Image.Image, action: str, phase: int, hero: str,
         view: str) -> Image.Image:
    """在固定枢轴内对上下身与左右落脚区作独立形变，避免整张平移。"""
    rgba = np.asarray(image, dtype=np.float32)
    h, w = rgba.shape[:2]
    alpha = rgba[:, :, 3:4] / 255.0
    premultiplied = np.concatenate((rgba[:, :, :3] * alpha, rgba[:, :, 3:4]), axis=2)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    upper = np.clip((0.72 - yy / h) / 0.56, 0, 1)
    lower = np.clip((yy / h - 0.46) / 0.42, 0, 1)
    side = np.tanh((xx - w * (0.48 if view != "side" else 0.52)) / 14)
    swing = (0, 1, 0, -1)[phase]
    sway = (0, 2, 0, -2)[phase]
    dx = np.zeros((h, w), np.float32)
    dy = np.zeros((h, w), np.float32)
    if action == "idle":
        dy += (0, 1.5, 0, -1.5)[phase] * upper
        dx += sway * upper * 0.35
    elif action in ("walk", "run"):
        power = 7 if action == "walk" else 13
        dx += swing * power * side * lower
        dx -= swing * power * 0.22 * upper
        dy += (0, 2, 0, -2)[phase] * upper
        dy += swing * (3 if action == "walk" else 6) * side * lower
    elif action == "jump":
        dy -= (0, 11, 18, 7)[phase]
        dx += (0, -2, 1, 2)[phase] * upper
    elif action in ("attack", "attackMelee"):
        force = 18 if action == "attackMelee" else 12
        dx += (0, force * 0.45, force, 3)[phase] * upper
        dx -= (0, 2, 3, 1)[phase] * lower
        dy += (0, -2, -1, 0)[phase] * upper
    elif action == "hit":
        dx -= (0, 9, 13, 3)[phase] * upper
        dy += (0, 2, 3, 0)[phase] * upper
    elif action == "defeated":
        dx -= (0, 5, 13, 22)[phase] * upper
        dy += (0, 5, 10, 18)[phase] * upper
        dy += (0, 0, 3, 8)[phase] * lower
    elif action == "skill":
        dx += (0, 4, 15, 3)[phase] * upper
        dy -= (0, 2, 4, 0)[phase] * upper
    elif action == "skill2":
        dx += (0, -5, -8, 0)[phase] * upper
        dy -= (0, 3, 8, 1)[phase] * upper
    elif action == "skill3":
        dx += (0, -3, 5, 0)[phase] * upper
        dy -= (0, 6, 10, 3)[phase] * upper
        dx += (0, 0, 3, 0)[phase] * side * lower
    rendered = cv2.remap(premultiplied, xx - dx, yy - dy,
                         cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)
    a = np.clip(rendered[:, :, 3:4], 0, 255)
    rgb = np.where(a > 0.5, rendered[:, :, :3] * 255 / np.maximum(a, 0.5), 0)
    result = np.concatenate((rgb, a), axis=2)
    return Image.fromarray(np.uint8(np.clip(result, 0, 255)), "RGBA")


def action_keyposes(hero: str, view: str) -> tuple[Image.Image, ...]:
    sheet = Image.open(ACTION_MASTERS / f"{hero}.png").convert("RGBA")
    cell_w, cell_h = sheet.width // 4, sheet.height // 3
    row = VIEWS.index(view)
    poses = []
    for col in range(4):
        image = sheet.crop((col * cell_w, row * cell_h,
                            (col + 1) * cell_w, (row + 1) * cell_h))
        pixels = np.asarray(image).copy()
        occupied = (pixels[:, :, 3] > 12).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(occupied, 8)
        if count > 1:
            main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            pixels[labels != main] = 0
            image = Image.fromarray(pixels, "RGBA")
        box = image.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
        if box is None:
            raise ValueError(f"{hero}/{view}/{col} 动作格为空")
        image = image.crop(box)
        if hero == "kai" and view == "front" and col < 2:
            # 生成稿走姿时把右臂炮放到了画面左侧；镜像后与身份基准一致。
            image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        poses.append(fit(image, (256, 256), (222, 208), (128, 128)))
    return tuple(poses)


def skill_keyposes(hero: str, view: str) -> tuple[Image.Image, ...]:
    sheet = Image.open(SKILL_MASTERS / f"{hero}.png").convert("RGBA")
    cell_w, cell_h = sheet.width // 3, sheet.height // 3
    row = VIEWS.index(view)
    pixels = np.asarray(sheet).copy()
    occupied = (pixels[:, :, 3] > 12).astype(np.uint8)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(occupied, 8)
    poses = []
    for col in range(3):
        if hero == "mortis" and row == 0 and col == 0:
            # 召唤阵与下一行绿光相连，使用局部格防止取到阵上的碎石。
            local = pixels[:cell_h, :cell_w].copy()
            local_count, local_labels, local_stats, _ = cv2.connectedComponentsWithStats(
                (local[:, :, 3] > 12).astype(np.uint8), 8)
            local_main = 1 + int(np.argmax(local_stats[1:, cv2.CC_STAT_AREA]))
            local[local_labels != local_main] = 0
            image = Image.fromarray(local, "RGBA")
            box = image.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
            poses.append(fit(image.crop(box), (256, 256), (222, 208), (128, 128)))
            continue
        candidates = [index for index in range(1, count)
                      if col * cell_w <= centroids[index, 0] < (col + 1) * cell_w
                      and row * cell_h <= centroids[index, 1] < (row + 1) * cell_h]
        if not candidates:
            candidates = [index for index in range(1, count)
                          if stats[index, cv2.CC_STAT_LEFT] < (col + 1) * cell_w
                          and stats[index, cv2.CC_STAT_LEFT] + stats[index, cv2.CC_STAT_WIDTH] > col * cell_w
                          and stats[index, cv2.CC_STAT_TOP] < (row + 1) * cell_h
                          and stats[index, cv2.CC_STAT_TOP] + stats[index, cv2.CC_STAT_HEIGHT] > row * cell_h]
        if not candidates:
            raise ValueError(f"{hero}/{view}/{col} 找不到技能主体")
        main = max(candidates, key=lambda index: stats[index, cv2.CC_STAT_AREA])
        isolated = pixels.copy()
        isolated[labels != main] = 0
        image = Image.fromarray(isolated, "RGBA")
        box = image.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
        if box is None:
            raise ValueError(f"{hero}/{view}/{col} 技能格为空")
        poses.append(fit(image.crop(box), (256, 256), (222, 208), (128, 128)))
    return tuple(poses)


def action_frames(body: Image.Image, poses: tuple[Image.Image, ...],
                  skills: tuple[Image.Image, ...], action: str, hero: str,
                  view: str) -> tuple[Image.Image, ...]:
    walk_a, walk_b, windup, release = poses
    if action == "defeated":
        fallen = [body]
        for angle, center_y in ((24, 150), (58, 174), (86, 188)):
            rotated = body.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
            box = rotated.getchannel("A").getbbox()
            fallen.append(fit(rotated.crop(box), (256, 256), (222, 160), (128, center_y)))
        return tuple(fallen)
    if action == "walk":
        return walk_a, body, walk_b, body
    if action == "run":
        return (warp(walk_a, "run", 1, hero, view), walk_b,
                warp(walk_b, "run", 3, hero, view), walk_a)
    if action in ("attack", "attackMelee"):
        return windup, release, warp(release, "hit", 1, hero, view), body
    if action == "skill":
        return body, windup, skills[0], body
    if action == "skill2":
        return body, warp(skills[1], "skill2", 1, hero, view), skills[1], body
    if action == "skill3":
        return body, warp(skills[2], "skill3", 1, hero, view), skills[2], body
    return tuple(warp(body, action, frame, hero, view) for frame in range(4))


def bake_hero(hero: str) -> None:
    views = isolate_views(hero)
    for view, source in views.items():
        portrait_name = f"char_{hero}"
        if view == "front":
            with Image.open(ART / f"{portrait_name}.png") as original:
                portrait_size = original.size
            # 选人页采用上半身特写；游戏头像与详情页共用这一身份。
            top = source.crop((0, 0, source.width, round(source.height * 0.70)))
            portrait = fit(top, portrait_size, (round(portrait_size[0] * .94),
                                                round(portrait_size[1] * .94)),
                           (portrait_size[0] // 2, portrait_size[1] // 2))
            save_png(portrait, portrait_name)
            if hero in ("via", "mortis"):
                with Image.open(ART / f"ui_portrait_{hero}.png") as original_ui:
                    ui_size = original_ui.size
                save_png(portrait, f"ui_portrait_{hero}", ui_size)
        token_name = f"char_token_{hero}" + ("" if view == "front" else f"_{view}")
        if (ART / f"{token_name}.png").exists():
            with Image.open(ART / f"{token_name}.png") as original_token:
                token_size = original_token.size
            token = fit(source, token_size, (round(token_size[0] * .84),
                                             round(token_size[1] * .86)),
                        (token_size[0] // 2, token_size[1] // 2))
            save_png(token, token_name)
        body = fit(source, (256, 256), (206, 206), (128, 126))
        poses = action_keyposes(hero, view)
        skills = skill_keyposes(hero, view)
        if (ART / f"{token_name}_move.png").exists():
            token_box = token.getchannel("A").getbbox()
            walk_box = poses[0].getchannel("A").getbbox()
            if token_box and walk_box:
                walk_source = poses[0].crop(walk_box)
                target_height = token_box[3] - token_box[1]
                target_width = round(walk_source.width * target_height / walk_source.height)
                moved = Image.new("RGBA", token_size)
                scaled = walk_source.resize((target_width, target_height), Image.Resampling.LANCZOS)
                moved.alpha_composite(scaled, ((token_size[0] - target_width) // 2, token_box[1]))
                save_png(moved, f"{token_name}_move")
        sheet = Image.new("RGBA", (1024, 2816))
        for row, action in enumerate(ACTIONS):
            for frame, pose in enumerate(action_frames(body, poses, skills, action, hero, view)):
                sheet.alpha_composite(pose, (frame * 256, row * 256))
        save_png(sheet, f"anim_stylea_hero_{hero}_{view}")


def bake_turret() -> None:
    base = Image.open(MASTERS / "turret_base.png").convert("RGBA")
    barrel = Image.open(MASTERS / "turret_barrel.png").convert("RGBA")
    for name, image in (("turret_base_vivian", base), ("turret_barrel_vivian", barrel)):
        with Image.open(ART / f"{name}.png") as original_turret:
            size = original_turret.size
        save_png(fit(image, size, (round(size[0] * .95), round(size[1] * .95)),
                     (size[0] // 2, size[1] // 2)), name)
    source = fit(barrel, (448, 448), (360, 220), (224, 224))
    atlas = Image.new("RGBA", (1792, 1792))
    for row in range(4):
        for col in range(4):
            pose = source.copy()
            if col in (1, 2):
                draw = ImageDraw.Draw(pose)
                radius = (22, 32)[col - 1]
                cx, cy = 410, 224
                draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius),
                             fill=(28, 237, 255, 65), outline=(177, 253, 255, 210), width=5)
            if col == 2:
                pose = pose.transform(pose.size, Image.Transform.AFFINE,
                                      (1, 0, 8, 0, 1, 0), resample=Image.Resampling.BICUBIC)
            atlas.alpha_composite(pose, (col * 448, row * 448))
    save_png(atlas, "anim_turret_barrel_fire")


def bake_turret_icons() -> None:
    sheet = Image.open(SKILL_MASTERS / "vivian-turret-icons.png").convert("RGBA")
    cell_w = sheet.width // 3
    for col, name in enumerate(("ui_icon_skill_vivian_q", "ui_icon_hex13", "ui_icon_hex14")):
        image = sheet.crop((col * cell_w, 0, (col + 1) * cell_w, sheet.height))
        box = image.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
        if box is None:
            raise ValueError(f"{name} 图标格为空")
        with Image.open(ART / f"{name}.png") as original_icon:
            size = original_icon.size
        icon = fit(image.crop(box), size, (round(size[0] * .88), round(size[1] * .88)),
                   (size[0] // 2, size[1] // 2))
        save_png(icon, name)


if __name__ == "__main__":
    for item in HEROES:
        bake_hero(item)
        print(f"已烘焙 {item}")
    bake_turret()
    bake_turret_icons()
    print("已烘焙薇薇安飞炮")
