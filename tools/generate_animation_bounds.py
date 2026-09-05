"""从正式动作图集生成逐帧 alpha 顶边，供运行时血条贴合可见身体。"""
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PREVIEW_DATA = ROOT / 'docs/art/animation-qa/preview-data.json'
ART_DIR = ROOT / 'assets/resources/art'
OUTPUT = ROOT / 'assets/scripts/data/AnimationBoundsDB.ts'


def main() -> None:
    database = json.loads(PREVIEW_DATA.read_text(encoding='utf-8'))
    sheets: dict[str, dict] = {}
    for actor in database.values():
        for view in actor.values():
            for clip in view.values():
                name = clip['sheet']
                layout = (clip['columns'], clip['rows'])
                entry = sheets.setdefault(name, {'layout': layout, 'indices': set()})
                if entry['layout'] != layout:
                    raise ValueError(f'{name}在动作表中使用了互相矛盾的网格')
                entry['indices'].update(frame['index'] for frame in clip['frames'])

    lines = [
        '// ============================================================',
        '//  AnimationBoundsDB.ts — 由 tools/generate_animation_bounds.py 生成',
        '//  每个数值是对应网格帧内首个非透明像素的归一化Y；-1表示动作表未使用。',
        '// ============================================================',
        '',
        'export const ANIMATION_ALPHA_TOP: Record<string, readonly number[]> = {',
    ]
    used_frames = 0
    for name in sorted(sheets):
        columns, rows = sheets[name]['layout']
        image = Image.open(ART_DIR / f'{name}.png').convert('RGBA')
        if image.width % columns or image.height % rows:
            raise ValueError(f'{name}尺寸{image.size}不能整除{columns}×{rows}')
        cell_w, cell_h = image.width // columns, image.height // rows
        alpha = image.getchannel('A')
        tops = [-1.0] * (columns * rows)
        for index in sheets[name]['indices']:
            row, column = divmod(index, columns)
            tile = alpha.crop((column * cell_w, row * cell_h, (column + 1) * cell_w, (row + 1) * cell_h))
            bounds = tile.point(lambda value: 255 if value > 8 else 0).getbbox()
            if bounds is None:
                raise ValueError(f'{name}第{index}帧为空，不能标定可见顶边')
            tops[index] = round(bounds[1] / cell_h, 4)
            used_frames += 1
        values = ','.join('-1' if value < 0 else f'{value:.4f}' for value in tops)
        lines.append(f"    '{name}': [{values}],")
    lines.extend([
        '};',
        '',
        '/** 找不到标定时回退到画布顶边0，绝不猜测另一个动作的边界。 */',
        'export function animationAlphaTop(sheet: string, index: number): number {',
        '    const value = ANIMATION_ALPHA_TOP[sheet]?.[index];',
        '    return Number.isFinite(value) && value >= 0 ? value : 0;',
        '}',
        '',
    ])
    OUTPUT.write_text('\n'.join(lines), encoding='utf-8')
    print(f'已生成{len(sheets)}张图集、{used_frames}个已用物理帧的alpha顶边')


if __name__ == '__main__':
    main()
