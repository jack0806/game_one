// ============================================================
//  EffectSystem.ts — 屏幕震动 / 顿帧 / 飘字
// ============================================================
import { clamp } from '../core/MathUtils';

// ── 屏幕震动 ───────────────────────────────────────────────
export class ScreenShake {
    x  = 0;
    y  = 0;
    private _t   = 0;
    private _str = 0;
    private _duration = 0;
    private _phase = 0;

    /** strength=像素, duration=秒 */
    shake(strength = 8, duration = 0.25): void {
        const nextStr = clamp(strength, 0, 14);
        const nextDur = clamp(duration, 0.04, 0.45);
        // 正在播放的强震动不会被连续小命中无限续杯；只有同级或更强反馈才延长。
        if (this._t > 0 && nextStr < this._str * 0.65) return;
        if (this._t <= 0) this._phase = 0;
        this._str = Math.max(this._str, nextStr);
        this._duration = Math.max(this._duration, nextDur);
        this._t = Math.max(this._t, nextDur);
    }
    /** 别名：add(strength, durationMs) */
    add(strength: number, durationMs: number): void {
        this.shake(strength, (durationMs || 250) / 1000);
    }

    update(dt: number): void {
        if (this._t > 0) {
            this._t = Math.max(0, this._t - dt);
            this._phase += dt * 46;
            const remain = this._duration > 0 ? this._t / this._duration : 0;
            const amp = this._str * remain * remain;
            // 阻尼双轴振荡替代“每帧完全随机跳点”，保留冲击感但不再像角色持续抖动。
            this.x = Math.round(Math.sin(this._phase) * amp);
            this.y = Math.round(Math.sin(this._phase * 1.71 + 1.2) * amp * 0.55);
        } else {
            this.x = 0; this.y = 0; this._t = 0;
            this._str = 0; this._duration = 0;
        }
    }

    get active(): boolean { return this._t > 0; }

    reset(): void {
        this.x = 0; this.y = 0; this._t = 0; this._str = 0;
        this._duration = 0; this._phase = 0;
    }
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
        // 同一位置连续触发的技能反馈按行错开；重复文案只刷新寿命，避免
        // 盗神等高频技能把数行文字叠成一块。估宽用于布局，不依赖引擎字体。
        const width = Math.min(600, text.length * size * 0.9);
        const nearby = this.items.filter(item =>
            Math.abs(item.x - x) < (width + Math.min(600, item.text.length * item.size * 0.9)) / 2 + 10
            && Math.abs(item.y - y) < 125);
        const repeated = nearby.find(item => item.text === text);
        if (repeated) {
            repeated.life = 1;
            repeated.alpha = 1;
            return;
        }
        if (nearby.length >= 4) {
            const oldest = nearby[0];
            this.items.splice(this.items.indexOf(oldest), 1);
        }
        let placedY = y;
        const direction = y < 180 ? 1 : -1;
        for (let lane = 0; lane < 5; lane++) {
            const collision = this.items.some(item =>
                Math.abs(item.x - x) < (width + Math.min(600, item.text.length * item.size * 0.9)) / 2 + 10
                && Math.abs(item.y - placedY) < Math.max(28, (size + item.size) * 0.75));
            if (!collision) break;
            placedY = y + direction * (lane + 1) * 31;
        }
        this.items.push({ x, y: Math.max(62, placedY), text, color, size, life: 1, vy: -60, alpha: 1, crit });
        if (this.items.length > 32) this.items.shift();
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

    clear(): void {
        this.items.length = 0;
    }

    /**
     * Render floating items via a Cocos Graphics component.
     * Note: Graphics cannot render text — each item should use a Label node.
     * This stub exists so GameManager compiles; replace with Label-node
     * pool if rich text is needed at runtime.
     */
    draw(_g: any): void { /* Label-based rendering handled by HUD overlay */ }
}
