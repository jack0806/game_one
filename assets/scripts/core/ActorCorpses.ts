// 尸体脱离战斗数组后仅保留表现，伤害/掉落/寻路都不再更新。
import { ActorAnimation } from './ActorAnimation';
import { DT_MAX } from './Constants';

export interface CorpseActor {
    alive: boolean;
    actorAnimation: ActorAnimation;
    beginDefeat(): boolean;
}
export interface CorpseEntry<T> { actor: T; resting: number; alpha: number; }

export class ActorCorpses<T extends CorpseActor> {
    readonly entries: CorpseEntry<T>[] = [];
    constructor(private _dispose: (actor: T) => void, private _capacity = 64) {}

    add(actor: T): void {
        if (this.entries.some(e => e.actor === actor)) return;
        if (actor.alive) return;
        if (!actor.beginDefeat()) { this._dispose(actor); return; }
        if (this.entries.length >= this._capacity) this._dispose(this.entries.shift()!.actor);
        this.entries.push({ actor, resting: 0, alpha: 1 });
    }

    update(rawDt: number): void {
        const dt = Math.max(0, Math.min(DT_MAX, rawDt));
        for (let i = this.entries.length - 1; i >= 0; i--) {
            const entry = this.entries[i];
            entry.actor.actorAnimation.update(dt);
            entry.actor.actorAnimation.takeEvents();
            if (entry.actor.actorAnimation.finished) entry.resting += dt;
            entry.alpha = Math.max(0, 1 - Math.max(0, entry.resting - 0.35) / 0.25);
            if (entry.alpha <= 0) {
                this._dispose(entry.actor);
                this.entries.splice(i, 1);
            }
        }
    }

    clear(): void {
        for (const entry of this.entries) this._dispose(entry.actor);
        this.entries.length = 0;
    }
}
