"""绘制运动学姿势参考图，仅供生成模型约束关节位置，不生成或变形游戏美术。"""
from pathlib import Path
import math


def leg(phase, hip_z):
    # 支撑期脚底沿地面后移；摆动期抬脚前摆，两腿相差半个周期。
    if phase < .6:
        y, z = 30 - 60 * phase / .6, 10
    else:
        t = (phase - .6) / .4
        y = -30 + 60 * (3*t*t - 2*t*t*t)
        z = 10 + 25 * math.sin(math.pi*t)
    dz = z - hip_z
    distance = math.hypot(y, dz)
    height = math.sqrt(max(0, 55**2 - distance**2 / 4))
    knee = (y/2 - dz/distance*height, (hip_z+z)/2 + y/distance*height)
    return knee, (y, z)


def write_guide(view):
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="560" viewBox="0 0 1120 560">',
             '<rect width="1120" height="560" fill="#f7f8fa"/>']
    for index in range(8):
        phase = index / 8
        hip_z = 114 - 3 * math.cos(4*math.pi*phase)
        parts.append(f'<g transform="translate({index%4*280},{index//4*280})">')
        parts.append(f'<text x="18" y="25" fill="#667788" font-size="17">{index+1}</text>')
        def point(lateral, forward, z):
            if view == 'side':
                return (103+forward, 246-z)
            return (140+lateral, 210 + forward*.56 - z*.72)
        def line(points, color, width):
            xy = ' '.join(f'{x:.2f},{y:.2f}' for x, y in points)
            parts.append(f'<polyline points="{xy}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round"/>')
        hip = point(0, 0, hip_z)
        shoulder = (hip[0]+7 if view=='side' else hip[0], hip[1]-44)
        line([shoulder, hip], '#707c88', 23)
        parts.append(f'<ellipse cx="{shoulder[0]+3}" cy="{shoulder[1]-25}" rx="14" ry="18" fill="#707c88"/>')
        if view == 'side':
            line([shoulder, (shoulder[0]+18,shoulder[1]+26), (shoulder[0]+59,shoulder[1]+21)], '#8795a3', 10)
            line([(shoulder[0]+46,shoulder[1]+17),(shoulder[0]+123,shoulder[1]+17)], '#444d57', 8)
        else:
            for sign in [-1,1]:
                line([(shoulder[0]+sign*14,shoulder[1]),(shoulder[0]+sign*27,shoulder[1]+30),(hip[0]+sign*6,hip[1]-8)], '#8795a3', 9)
            line([(hip[0],hip[1]-22),(hip[0],hip[1]+52)], '#444d57', 7)
        for offset, lateral, color in [(.5,-13,'#387aca'),(0,13,'#dc523e')]:
            knee, ankle = leg((phase+offset)%1,hip_z)
            positions = [point(lateral,0,hip_z), point(lateral,*knee), point(lateral,*ankle)]
            line(positions,color,11)
            kx, ky = positions[1]
            parts.append(f'<circle cx="{kx}" cy="{ky}" r="4" fill="white"/>')
            ax, ay = positions[2]
            if view == 'side':
                line([(ax,ay),(ax-4,ay+9),(ax+14,ay+9)],color,8)
            else:
                line([(ax,ay),(ax,ay+10),(ax+4,ay+12)],color,9)
        if view == 'side':
            parts.append('<path d="M45 245H170" stroke="#bbc5cc" stroke-width="1"/>')
        parts.append('</g>')
    parts.append('</svg>')
    root = Path(__file__).resolve().parents[1] / 'docs/art/animation-qa'
    svg = root / f'walk-pose-reference-{view}.svg'
    svg.write_text('\n'.join(parts), encoding='utf-8')
    # SVG工程图的格式导出；不读取或修改任何角色位图。
    import fitz
    with fitz.open(svg) as doc:
        doc[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5), alpha=False).save(svg.with_suffix('.png'))


if __name__ == '__main__':
    for view in ['side', 'front']:
        write_guide(view)
