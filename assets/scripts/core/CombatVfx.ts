// 战斗表现几何：前摇只表达真实伤害区域，弹体和释放使用独立美术。
import { Color } from 'cc';

/** 世界坐标向下、本地坐标向上：扇区边界须交换并取反。 */
export function localSectorBounds(index: number, count: number): [number, number] {
    return [Math.PI - (index + 1) * Math.PI * 2 / count, Math.PI - index * Math.PI * 2 / count];
}

/** 显式采样小扇区，避免引擎 arc 的方向语义把 60 度画成 300 度。 */
export function sectorPath(g: any, x: number, y: number, radius: number, start: number, end: number): void {
    g.moveTo(x, y);
    const steps = Math.max(8, Math.ceil(Math.abs(end - start) * 20));
    for (let i = 0; i <= steps; i++) {
        const a = start + (end - start) * i / steps;
        g.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    }
    g.close();
}

/** 声波/炉环以流动的厚薄轮廓表达能量，始终保留指定角度的安全缺口。 */
export function drawEnergyArc(g: any, x: number, y: number, radius: number, halfWidth: number,
    start: number, end: number, time: number, color: string, opacity = 1): void {
    const c = Color.fromHEX(new Color(), color);
    const steps = Math.max(8, Math.ceil((end - start) * 16));
    for (const layer of [1, 0.35]) {
        g.fillColor = layer === 1 ? new Color(c.r, c.g, c.b, Math.round(185 * opacity))
            : new Color(247, 245, 213, Math.round(225 * opacity));
        for (const side of [1, -1]) {
            for (let k = 0; k <= steps; k++) {
                const t = side === 1 ? k / steps : 1 - k / steps;
                const a = start + (end - start) * t;
                const w = halfWidth * layer * (0.8 + 0.2 * Math.sin(a * 17 - time * 15));
                const r = Math.max(0, radius + side * w);
                const ax = x + Math.cos(a) * r, ay = y + Math.sin(a) * r;
                if (side === 1 && k === 0) g.moveTo(ax, ay); else g.lineTo(ax, ay);
            }
        }
        g.close(); g.fill();
    }
}

/** 地面扇面保留边界；不再从敌人画一条指向玩家的连线。 */
export function drawAttackSector(g: any, x: number, y: number, angle: number,
    radius: number, halfAngle: number, progress: number, color = '#ff795a'): void {
    const c = Color.fromHEX(new Color(), color);
    // 窄幅渐亮的外缘、朝内短齿表示危险边界；地面与角色不被实心扇面盖住。
    const start = angle - halfAngle, end = angle + halfAngle;
    const segments = Math.max(3, Math.ceil(halfAngle * 8));
    for (let k = 0; k < segments; k++) {
        const a0 = start + (end - start) * k / segments;
        const a1 = start + (end - start) * (k + 0.72) / segments;
        drawEnergyArc(g, x, y, radius, 1.1 + progress * 1.3, a0, a1, progress, color, 0.25 + progress * 0.45);
        if (k % 2 === 0) {
            const a = (a0 + a1) / 2;
            g.strokeColor = new Color(c.r, c.g, c.b, 90 + Math.round(progress * 80));
            g.lineWidth = 1.5;
            g.moveTo(x + Math.cos(a) * (radius - 7), y + Math.sin(a) * (radius - 7));
            g.lineTo(x + Math.cos(a) * (radius - 2), y + Math.sin(a) * (radius - 2)); g.stroke();
        }
    }
}

/** 冲撞只显示地面走廊的断续侧界，中心没有实心长条或瞄准线。 */
export function drawChargeLane(g: any, x: number, y: number, angle: number,
    length: number, halfWidth: number, progress: number): void {
    const ux = Math.cos(angle), uy = Math.sin(angle), px = -uy, py = ux;
    g.strokeColor = new Color(255, 139, 91, 90 + Math.round(progress * 95));
    g.lineWidth = 2;
    for (const side of [-1, 1]) {
        for (let d = 10; d < length; d += 35) {
            g.moveTo(x + ux * d + px * halfWidth * side, y + uy * d + py * halfWidth * side);
            const end = Math.min(length, d + 19);
            g.lineTo(x + ux * end + px * halfWidth * side, y + uy * end + py * halfWidth * side);
        }
    }
    g.stroke();
}

/** 真正光束的轮廓随时间流动，逐段宽窄变化；两端有独立释放/命中形状。 */
export function drawEnergyBeam(g: any, x: number, y: number, endX: number, endY: number,
    width: number, time: number, color = '#83e9ff', opacity = 1): void {
    const dx = endX - x, dy = endY - y, length = Math.hypot(dx, dy);
    if (length < 1) return;
    const px = -dy / length, py = dx / length;
    const c = Color.fromHEX(new Color(), color);
    for (const layer of [1, 0.38]) {
        g.fillColor = layer === 1 ? new Color(c.r, c.g, c.b, Math.round(150 * opacity)) : new Color(238, 252, 255, Math.round(235 * opacity));
        for (const side of [1, -1]) {
            for (let k = 0; k <= 24; k++) {
                const t = side === 1 ? k / 24 : 1 - k / 24;
                const taper = Math.min(1, t * 12, (1 - t) * 12);
                const w = width * layer * taper * (0.82 + 0.18 * Math.sin(t * 46 - time * 22));
                const ax = x + dx * t + px * w * side, ay = y + dy * t + py * w * side;
                if (side === 1 && k === 0) g.moveTo(ax, ay); else g.lineTo(ax, ay);
            }
        }
        g.close(); g.fill();
    }
}
