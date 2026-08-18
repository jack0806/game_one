// ============================================================
//  EffectSystem.ts — 屏幕震动 / 顿帧 / 飘字
// ============================================================
import { Rng, clamp } from '../core/MathUtils';

// ── 屏幕震动 ───────────────────────────────────────────────
export class ScreenShake {
    x  = 0;
    y  = 0;
    private _t   = 0;
    private _str = 0;

    /** strength=像素, duration=秒 */
    shake(strength = 8, duration = 0.25): void {
        this._str = Math.max(this._str, strength);
        this._t   = Math.max(this._t,   duration);
    }
    /** 别名：add(strength, durationMs) */
    add(strength: number, durationMs: number): void {
        this.shake(strength, (durationMs || 250) / 1000);
    }

    update(dt: number): void {
        if (this._t > 0) {
            this._t -= dt;
            const s = this._str * (this._t > 0 ? 1 : 0);
            this.x = Rng.float(-s, s);
            this.y = Rng.float(-s, s);
            this._str *= 0.88;
        } else {
            this.x = 0; this.y = 0; this._t = 0;
        }
    }

    reset(): void { this.x = 0; this.y = 0; this._t = 0; this._str = 0; }
}

// ── 顿帧（hit-stop） ──────────────────────────────────────
export class HitStop {
    private _t = 0;

    /** dur 可以是秒（<2）或毫秒（≥2），自动识别 */
    trigger(dur = 0.05): void {
        this._t = Math.min(0.08, dur >= 2 ? dur / 1000 : dur);
    }
    update(dt: number): void { if (this._t > 0) this._t -= dt; }
    isActive(): boolean  { return this._t > 0; }
    get active(): boolean { return this._t > 0; }
}

// ── 伤害飘字 ──────────────────────────────────────────────
interface FloatingItem {
    x: number; y: number;
    text: string; color: string;
    size: number; crit: boolean;
    life: number; vy: number; alpha: number;
}

export class FloatingText {
    items: FloatingItem[] = [];

    spawn(x: number, y: number, text: string, color = '#fff', size = 18, crit = false): void {
        this.items.push({ x, y, text, color, size, life: 1, vy: -60, alpha: 1, crit });
    }

    update(dt: number): void {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const t = this.items[i];
            t.y   += t.vy * dt;
            t.life -= dt * 1.5;
            t.alpha = Math.max(0, t.life);
            if (t.life <= 0) this.items.splice(i, 1);
        }
    }

    /**
     * Render floating items via a Cocos Graphics component.
     * Note: Graphics cannot render text — each item should use a Label node.
     * This stub exists so GameManager compiles; replace with Label-node
     * pool if rich text is needed at runtime.
     */
    draw(_g: any): void { /* Label-based rendering handled by HUD overlay */ }
}
