// ============================================================
//  ActorAnimation.ts — 可脱离引擎测试的逐帧动作时钟
// ============================================================
import { DT_MAX } from './Constants';
import { ActorAction, ActorClip, AnimationFrame } from '../data/ActorAnimationDB';

const PRIORITY: Record<ActorAction, number> = {
    idle: 0, walk: 0, run: 0, jump: 2, attack: 3, attackMelee: 3,
    skill: 4, skill2: 4, skill3: 4, skill4: 4, skill5: 4, hit: 5, defeated: 10,
};

export interface ActorFrameEvent {
    event: NonNullable<AnimationFrame['event']>;
    frame: AnimationFrame;
}

export class ActorAnimation {
    action: ActorAction = 'idle';
    frame = 0;
    elapsed = 0;
    finished = false;
    private _clip?: ActorClip;
    private _events: ActorFrameEvent[] = [];

    get clip(): ActorClip | undefined { return this._clip; }
    get currentFrame(): AnimationFrame | undefined { return this._clip?.frames[this.frame]; }
    get locked(): boolean { return !!this._clip && !this._clip.loop && !this.finished; }

    reset(): void {
        this.action = 'idle'; this.frame = 0; this.elapsed = 0; this.finished = false;
        this._clip = undefined; this._events.length = 0;
    }

    play(action: ActorAction, clip: ActorClip | undefined, restart = false): boolean {
        if (!clip || clip.frames.length === 0) return false;
        if (this.action === 'defeated' && this._clip) return false;
        if (this.locked && PRIORITY[action] < PRIORITY[this.action]) return false;
        if (!restart && this.action === action && this._clip === clip) return false;
        this.action = action; this._clip = clip;
        this.frame = 0; this.elapsed = 0; this.finished = false;
        this._events.length = 0;
        this._enterFrame();
        return true;
    }

    update(dt: number, rate = 1): void {
        if (!this._clip || this.finished) return;
        this.elapsed += Math.max(0, Math.min(DT_MAX, dt)) * Math.max(0, Math.min(64, rate));
        while (this.elapsed >= Math.max(0.001, this.currentFrame!.seconds)) {
            this.elapsed -= Math.max(0.001, this.currentFrame!.seconds);
            if (this.frame + 1 < this._clip.frames.length) this.frame++;
            else if (this._clip.loop) this.frame = 0;
            else { this.finished = true; this.elapsed = 0; break; }
            this._enterFrame();
        }
    }

    /** 战斗逻辑已经完成蓄力时，直接落到对应命中姿势，不再重复等一次前摇。 */
    seekFrame(index: number): void {
        if (!this._clip) return;
        this.frame = Math.max(0, Math.min(this._clip.frames.length - 1, Math.floor(index)));
        this.elapsed = 0; this.finished = false;
        this._events.length = 0; this._enterFrame();
    }

    takeEvents(): NonNullable<AnimationFrame['event']>[] {
        return this.takeFrameEvents().map(entry => entry.event);
    }

    takeFrameEvents(): ActorFrameEvent[] {
        return this._events.splice(0);
    }

    private _enterFrame(): void {
        const event = this.currentFrame?.event;
        if (event) this._events.push({ event, frame: this.currentFrame! });
    }
}

/** 挂点与 Sprite 使用同一枢轴/镜像/画布比例，返回逻辑世界坐标。 */
export function animationSocket(
    frame: AnimationFrame, x: number, y: number, displaySize: number, mirror: 1 | -1,
): [number, number] | undefined {
    if (!frame.muzzle) return undefined;
    return [x + (frame.muzzle[0] - frame.pivot[0]) * displaySize * mirror,
            y + (frame.muzzle[1] - frame.pivot[1]) * displaySize];
}
