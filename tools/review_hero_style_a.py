"""把运行时英雄图集整理成便于目测的角色、视角与动作对照板。"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "assets/resources/art"
OUT = ROOT / "docs/art/style-a/hero-redesign"
HEROES = ("kai", "vivian", "reik", "olia", "graf", "liana", "via", "mortis")
VIEWS = ("front", "side", "back")
ACTIONS = ("idle", "walk", "run", "jump", "attack", "hit", "defeated",
           "skill", "skill2", "skill3", "attackMelee")
FONT = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 17)


def atlas(hero, view):
    with Image.open(ART / f"anim_stylea_hero_{hero}_{view}.png") as image:
        return image.convert("RGBA")


def frame(sheet, row, col):
    return sheet.crop((col * 256, row * 256, (col + 1) * 256, (row + 1) * 256))


def make_board(filename, columns, rows, cell_width=205, cell_height=242):
    board = Image.new("RGB", (columns * cell_width, rows * cell_height), "#252a43")
    draw = ImageDraw.Draw(board)
    for col, row, label, sprite in filename():
        x, y = col * cell_width, row * cell_height
        draw.text((x + 9, y + 8), label, font=FONT, fill="#e6efff")
        sprite.thumbnail((cell_width - 16, cell_height - 31), Image.Resampling.LANCZOS)
        board.paste(sprite, (x + (cell_width - sprite.width) // 2, y + 29), sprite)
    return board


def roster():
    for index, hero in enumerate(HEROES):
        with Image.open(ART / f"char_{hero}.png") as image:
            yield index % 4, index // 4, hero, image.convert("RGBA")


def views():
    for row, hero in enumerate(HEROES):
        for col, view in enumerate(VIEWS):
            yield col, row, f"{hero} {view}", frame(atlas(hero, view), 0, 0)


def actions():
    for row, hero in enumerate(HEROES):
        sheet = atlas(hero, "front")
        for col, action in enumerate(ACTIONS):
            show_frame = 2 if action not in ("idle", "defeated") else 3
            yield col, row, f"{hero} {action}", frame(sheet, col, show_frame)


def icons():
    for row, hero in enumerate(HEROES):
        for col, slot in enumerate(("q", "e", "r")):
            with Image.open(ART / f"ui_icon_skill_{hero}_{slot}.png") as image:
                yield col, row, f"{hero} {slot.upper()}", image.convert("RGBA")


make_board(roster, 4, 2).save(OUT / "roster-qa.png")
make_board(views, 3, 8).save(OUT / "views-qa.png")
make_board(actions, len(ACTIONS), 8, 180, 218).save(OUT / "actions-qa.png")
make_board(icons, 3, 8).save(OUT / "icons-qa.png")
