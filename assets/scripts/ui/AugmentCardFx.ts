import { Color, Graphics, instantiate, Node, UITransform, UIOpacity } from 'cc';
import { CARD_BREAK_TIME, CARD_FX_LIFE, createDiamondFlow, diamondFacetColors,
    diamondFlowPoint, FlowDiamond, sampleFlowDiamond } from '../core/CardFracture';
import { DT_MAX } from '../core/Constants';
import { clamp, Rng } from '../core/MathUtils';
import { drawHexPanel } from '../core/UIStyle';

/** 卡面与购买快照共用底板；Graphics 的透明度需要显式绘制。 */
export function drawAugmentCardFace(g: Graphics, width: number, height: number, accent: Color, alpha = 255): void {
    g.clear();
    drawHexPanel(g, -width / 2, -height / 2, width, height, new Color(96, 123, 144), alpha);
    g.fillColor = new Color(accent.r, accent.g, accent.b, alpha);
    g.fillRect(-width / 2 + 18, height / 2 - 6, width - 36, 3);
}

interface StarDust {
    track: number; angle: number; offset: number; phase: number; size: number; life: number;
}

type Point = { x: number; y: number };

/** C「星钻流光」：整卡化成同稀有度切面碎钻，卷入三条开放流光并交错闪烁。 */
export class AugmentCardFx {
    readonly root: Node;
    private readonly _intact: Node;
    private readonly _face: Graphics;
    private readonly _faceOpacity: UIOpacity;
    private readonly _g: Graphics;
    private readonly _diamonds: FlowDiamond[];
    private readonly _dust: StarDust[] = [];
    private readonly _colors: number[][];
    private _time = 0;

    constructor(parent: Node, source: Node, private readonly _width: number,
                private readonly _height: number, private readonly _accent: Color,
                content: Node[], private readonly _rarity = 'silver') {
        this.root = new Node('StarDiamondFlow'); this.root.setParent(parent);
        this.root.setPosition(source.position);
        this.root.addComponent(UITransform).setContentSize(_width, _height);
        this._colors = diamondFacetColors(_rarity);
        this._diamonds = createDiamondFlow(_width, _height);
        // 只复制一次纯图文快照，在转化瞬间淡出；碎钻不携带任何文字与交互。
        this._intact = new Node('PurchaseFace'); this._intact.setParent(this.root);
        this._faceOpacity = this._intact.addComponent(UIOpacity);
        const bg = new Node('Armor'); bg.setParent(this._intact);
        this._face = bg.addComponent(Graphics);
        drawAugmentCardFace(this._face, _width, _height, _accent);
        for (const original of content) instantiate(original).setParent(this._intact);
        const light = new Node('DiamondLight'); light.setParent(this.root);
        this._g = light.addComponent(Graphics);
        for (let i = 0; i < 66; i++) {
            this._dust.push({ track: i % 3, angle: Rng.float(0, Math.PI * 2),
                offset: Rng.float(-9, 9), phase: Rng.float(0, Math.PI * 2),
                size: Rng.float(0.5, 1.6), life: Rng.float(0.72, 1.17) });
        }
        this._draw();
    }

    update(dt: number): boolean {
        this._time += clamp(dt, 0, DT_MAX);
        const charge = clamp(this._time / CARD_BREAK_TIME, 0, 1);
        this._intact.active = this._time < CARD_BREAK_TIME;
        if (this._intact.active) {
            this._faceOpacity.opacity = Math.round(255 * (1 - charge * 0.65));
            drawAugmentCardFace(this._face, this._width, this._height, this._accent,
                Math.round(255 * (1 - charge * 0.65)));
            this._intact.setScale(1 - charge * 0.025, 1 - charge * 0.025, 1);
        }
        this._draw();
        return this._time >= CARD_FX_LIFE;
    }

    private _color(index: number, opacity: number): Color {
        const rgb = this._colors[index % this._colors.length];
        return new Color(rgb[0], rgb[1], rgb[2], Math.round(255 * clamp(opacity, 0, 1)));
    }

    private _polygon(points: Point[], color: Color): void {
        const g = this._g;
        g.fillColor = color; g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
        g.close(); g.fill();
    }

    /** 紧贴钻石尖角的四芒高光：柔色外晕、细长白芯、短横向光刺。 */
    private _star(x: number, y: number, size: number, opacity: number, tint = 0): void {
        if (opacity <= 0.01 || size < 0.15) return;
        const g = this._g;
        for (const layer of [2.2, 1]) {
            const r = size * layer, waist = size * (layer > 1 ? 0.16 : 0.085);
            const color = layer > 1 ? this._color(tint, opacity * 0.13)
                : new Color(255, 254, 248, Math.round(255 * opacity));
            this._polygon([{ x, y: y + r }, { x: x + waist, y: y + waist },
                { x: x + r * 0.72, y }, { x: x + waist, y: y - waist },
                { x, y: y - r }, { x: x - waist, y: y - waist },
                { x: x - r * 0.72, y }, { x: x - waist, y: y + waist }], color);
        }
        g.fillColor = new Color(255, 255, 255, Math.round(230 * opacity));
        g.circle(x, y, Math.max(0.45, size * 0.11)); g.fill();
    }

    private _draw(): void {
        const g = this._g; g.clear();
        const t = this._time - CARD_BREAK_TIME;
        if (t < 0) {
            const charge = this._time / CARD_BREAK_TIME;
            // 一道斜向钻光扫过卡面，随后整卡转化为对应稀有度的钻石。
            const y = -this._height * 0.4 + charge * this._height * 0.8;
            g.strokeColor = this._color(1, charge * 0.75); g.lineWidth = 1.5;
            g.moveTo(-this._width * 0.42, y - 23); g.lineTo(this._width * 0.42, y + 23); g.stroke();
            this._star(this._width * (charge - 0.5) * 0.8, y, 8 + charge * 7, charge);
            return;
        }
        this._drawRibbons(t);
        this._drawDust(t);
        for (let i = 0; i < this._diamonds.length; i++) {
            const d = this._diamonds[i];
            const state = sampleFlowDiamond(d, this._time, this._width, this._height);
            if (!state.visible || state.opacity < 0.005) continue;
            this._drawDiamond(state, i);
        }
        const flash = Math.max(0, 1 - t / 0.2);
        this._star(0, this._height * 0.1, 25 + (1 - flash) * 16, flash * 0.9);
    }

    /** 三条有头尾的斜向弧线，分段收尖，银/金/彩的整条光流保持同档配色。 */
    private _drawRibbons(t: number): void {
        const g = this._g;
        const appear = clamp(t / 0.13, 0, 1);
        const fade = 1 - clamp((t - 0.59) / 0.48, 0, 1);
        if (fade <= 0) return;
        for (let track = 0; track < 3; track++) {
            const direction = track === 1 ? -1 : 1;
            const head = track * 1.9 + direction * t * (2.2 + track * 0.28);
            const span = (1.75 + track * 0.18) * appear;
            for (const layer of [0, 1, 2]) {
                for (let j = 0; j < 22; j++) {
                    const a = j / 22, b = (j + 1) / 22;
                    const start = diamondFlowPoint(track, head - direction * span * (1 - a), this._width, this._height);
                    const end = diamondFlowPoint(track, head - direction * span * (1 - b), this._width, this._height);
                    const brightness = (0.12 + b * 0.88) * appear * fade;
                    const tint = this._rarity === 'prismatic' ? (track + Math.floor(b * 3)) % 4 : 0;
                    g.strokeColor = layer === 2 ? this._color(4, brightness * 0.78)
                        : this._color(tint, brightness * (layer === 0 ? 0.1 : 0.55));
                    g.lineWidth = [10, 2.8, 0.9][layer] * (0.35 + b * 0.65);
                    g.moveTo(start.x, start.y); g.lineTo(end.x, end.y); g.stroke();
                }
            }
            const tip = diamondFlowPoint(track, head, this._width, this._height);
            this._star(tip.x, tip.y, 6.5, appear * fade * 0.8, track);
        }
    }

    private _drawDust(t: number): void {
        const g = this._g;
        for (const s of this._dust) {
            const fade = 1 - clamp(t / s.life, 0, 1);
            if (fade <= 0) continue;
            const direction = s.track === 1 ? -1 : 1;
            const point = diamondFlowPoint(s.track, s.angle + direction * t * 2.5, this._width, this._height);
            const x = point.x + Math.sin(s.phase) * s.offset;
            const y = point.y + Math.cos(s.phase + t) * s.offset;
            const twinkle = 0.15 + 0.85 * Math.pow(Math.max(0, Math.sin(t * 17 + s.phase)), 6);
            const alpha = fade * twinkle;
            g.fillColor = this._color(s.track, alpha * 0.72);
            g.circle(x, y, s.size * (0.5 + twinkle * 0.5)); g.fill();
            if (twinkle > 0.68 && s.size > 1.1) this._star(x, y, s.size * 3.2, alpha * 0.75, s.track);
        }
    }

    /** 每颗钻石都有独立明暗三角切面，颜色填满实体，高光沿尖角交错闪动。 */
    private _drawDiamond(state: ReturnType<typeof sampleFlowDiamond>, index: number): void {
        const { x, y, size, squash, rotation, opacity, glint } = state;
        const cos = Math.cos(rotation), sin = Math.sin(rotation);
        const transform = (px: number, py: number): Point => ({
            x: x + (px * squash * cos - py * sin) * size,
            y: y + (px * squash * sin + py * cos) * size,
        });
        const points = [[0, 1.15], [0.52, 0.28], [0.39, -0.35], [0, -1.05],
            [-0.48, -0.18], [-0.36, 0.45]].map(p => transform(p[0], p[1]));
        const core = transform(-0.04, 0.12);
        const glow = points.map(p => ({ x: x + (p.x - x) * 1.45, y: y + (p.y - y) * 1.45 }));
        this._polygon(glow, this._color(index % 2 === 0 ? 0 : 3, opacity * (0.055 + glint * 0.08)));
        for (let face = 0; face < points.length; face++) {
            const colorIndex = this._rarity === 'prismatic' ? face + index % 3 : face;
            this._polygon([points[face], points[(face + 1) % points.length], core], this._color(colorIndex, opacity));
        }
        const g = this._g;
        g.strokeColor = this._color(1, opacity * 0.9); g.lineWidth = 0.7;
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
        g.close(); g.stroke();
        g.strokeColor = this._color(4, opacity * (0.25 + glint * 0.5)); g.lineWidth = 0.55;
        for (let i = 0; i < points.length; i += 2) {
            g.moveTo(points[i].x, points[i].y); g.lineTo(core.x, core.y);
        }
        g.stroke();
        if (glint > 0.12) this._star(points[0].x, points[0].y, size * (0.65 + glint * 0.7),
            glint * opacity, index % 4);
    }

    destroy(): void { this.root.destroy(); }
}
