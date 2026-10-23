"""从已定稿关节稿直接渲染图鉴展示图；不改动战斗素材、动作和角色设计。"""
from pathlib import Path
import json
import uuid
from PIL import Image
from bake_enemy_rigs import extract_parts
import enemy_rig_motion as motion

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/art/style-a/enemy-redesign'
DEST = ROOT / 'assets/resources/art'
REPORT = ROOT / 'docs/art/style-a/unit-display-2026-10-23'


def write_meta(path, width, height):
    target = path.with_suffix('.png.meta')
    if target.exists():
        meta = json.loads(target.read_text(encoding='utf8'))
    else:
        meta = json.loads((DEST / 'ui_hero_display_kai.png.meta').read_text(encoding='utf8'))
        text = json.dumps(meta).replace(meta['uuid'], str(uuid.uuid4()))
        meta = json.loads(text.replace('ui_hero_display_kai', path.stem))
    data = meta['subMetas']['f9941']['userData']
    data.update(width=width, height=height, rawWidth=width, rawHeight=height,
                trimX=0, trimY=0, offsetX=0, offsetY=0, trimType='none', packable=False)
    data['vertices'].update(
        rawPosition=[-width/2,-height/2,0, width/2,-height/2,0,
                     -width/2,height/2,0, width/2,height/2,0],
        uv=[0,height,width,height,0,0,width,0],
        nuv=[0,0,1,0,0,1,1,1], minPos=[-width/2,-height/2,0], maxPos=[width/2,height/2,0])
    target.write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n', encoding='utf8')


def main():
    units = json.loads((SOURCE/'production.json').read_text(encoding='utf8'))['units']
    baseline = {u['id']: u for u in json.loads((SOURCE/'baseline.json').read_text(encoding='utf8'))['units']}
    report = []
    for unit in units:
        uid = unit['id']
        rig = SOURCE / 'rigs' / f'{uid}.png'
        parts = extract_parts(rig)['front']
        picture = motion.render_pose(parts, 'front', 'idle', 0, unit, pixel_scale=3)
        bounds = picture.getbbox()
        if not bounds or min(bounds[0], bounds[1], picture.width-bounds[2], picture.height-bounds[3]) < 8:
            raise ValueError(f'{uid}: 展示轮廓不能贴住渲染画布边缘: {bounds}')
        body = picture.crop(bounds)
        padding = 24
        display = Image.new('RGBA', (body.width+padding*2, body.height+padding*2))
        display.alpha_composite(body, (padding, padding))
        key = f'ui_unit_display_{uid}'
        path = DEST / f'{key}.png'
        display.save(path, optimize=True)
        write_meta(path, *display.size)
        report.append(dict(id=uid, category=baseline[uid]['category'], artKey=key,
                           sourceRig=rig.relative_to(ROOT).as_posix(),
                           combatArtKey=baseline[uid]['key'], width=display.width, height=display.height,
                           alphaBounds=display.getbbox()))
        motion._SCALED.clear()
        print(f'[单位展示图] {uid}: {display.width}x{display.height}', flush=True)
    REPORT.mkdir(parents=True, exist_ok=True)
    (REPORT/'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')


if __name__ == '__main__':
    main()
