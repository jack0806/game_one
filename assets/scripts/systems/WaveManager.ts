// ============================================================
//  WaveManager.ts — 波次/章节管理器
// ============================================================
import { CHAPTERS, MUTATIONS, ENEMY_COUNT_BY_WAVE, MutationDef } from '../data/WaveData';
import { Rng } from '../core/MathUtils';
import { ENDLESS_START_WAVE } from '../core/Constants';

export type WaveState = 'idle' | 'spawning' | 'fighting' | 'intermission';

export class WaveManager {
    wave        = 0;
    chapter     = 1;
    state: WaveState = 'idle';
    difficulty: 'normal' | 'nightmare' | 'chaos' = 'normal';
    endless     = false;

    /** Called by GameManager: (type) => spawnEnemy(type) */
    onSpawnEnemy?: (type: string) => void;
    /** Called by GameManager when a wave is fully cleared. */
    onWaveCleared?: () => void;

    private _activeMutations: MutationDef[] = [];
    private _spawnQueue: string[] = [];
    private _spawnTimer = 0;
    private _spawnInterval = 0.5;   // 秒
    private _intermissionTimer = 0;
    /** 变异：混沌节拍(chaos_beat) — 每5秒随机buff一批场上敌人的计时器。 */
    private _chaosBeatTimer = 0;

    // 当前波次敌人类型池（按章节加权）
    private _getEnemyPool(): string[] {
        switch (this.chapter) {
            case 1: return ['grunt', 'grunt', 'grunt', 'shield', 'exploder'];
            case 2: return ['grunt', 'shield', 'shield', 'exploder', 'golem'];
            case 3: return ['shield', 'exploder', 'golem', 'golem', 'elite_grunt'];
            case 4: return ['golem', 'exploder', 'elite_grunt', 'miniboss'];
            default: return ['grunt', 'shield', 'exploder', 'golem', 'elite_grunt'];
        }
    }

    startWave(game: any): void {
        this.wave++;
        this.chapter = Math.ceil(this.wave / 10);

        // 词条 onWaveStart 钩子（wave_heal / time_shard / absolute_zero 等依赖此分发；
        // 之前一直未被任何调用点触发，是死代码——这里补上消费点）。
        game.augmentManager?.dispatchWaveStart?.(game.player, game);

        // 无尽模式每10波新增变异
        if (this.endless && this.wave >= ENDLESS_START_WAVE && (this.wave - ENDLESS_START_WAVE) % 10 === 0) {
            const unused = MUTATIONS.filter(m => !this._activeMutations.find(a => a.id === m.id));
            if (unused.length) {
                const m = Rng.pick(unused);
                this._activeMutations.push(m);
                m.apply(game);
                game.floatingText?.spawn(640, 200, `⚠ ${m.name} ⚠`, m.color, 24, true);
            }
        }

        // Boss 波
        const chDef = CHAPTERS.find(c => c.bossWave === this.wave);
        const mods  = game._mutationMods || {};
        if (chDef) {
            this._spawnQueue = ['boss'];
            // 变异：镜像军队 — Boss型敌人数量×2（对齐 WaveData.ts 的 mirror_army 描述）
            if (mods.mirrorArmy) this._spawnQueue.push('boss');
        } else {
            const count = ENEMY_COUNT_BY_WAVE(this.wave, this.difficulty);
            const pool  = this._getEnemyPool();
            this._spawnQueue = Array.from({ length: count }, () => Rng.pick(pool));
            const eliteChance = 0.05 + (this.chapter - 1) * 0.08;
            if (Rng.chance(eliteChance)) this._spawnQueue.push('elite_grunt');
            // 变异：分身之战 — 每波额外生成2倍普通敌人（对齐 WaveData.ts 的 clone_war 描述）
            if (mods.cloneWar) {
                this._spawnQueue.push(...Array.from({ length: count * 2 }, () => Rng.pick(pool)));
            }
            // 变异：镜像军队 — miniboss/elite 也算"Boss型"敌人，数量×2
            if (mods.mirrorArmy) {
                const bossLike = this._spawnQueue.filter(t => t === 'elite_grunt' || t === 'miniboss');
                this._spawnQueue.push(...bossLike);
            }
        }

        this._spawnTimer = 0;
        this.state = 'spawning';
    }

    update(dt: number, game: any): void {
        if (this.state === 'spawning') {
            this._spawnTimer -= dt;
            if (this._spawnTimer <= 0 && this._spawnQueue.length > 0) {
                const type = this._spawnQueue.shift()!;
                // Prefer callback; fall back to duck-typing for backward compat
                (this.onSpawnEnemy ?? ((t: string) => game.spawnEnemy(t)))(type);
                this._spawnTimer = this._spawnInterval;
            }
            if (this._spawnQueue.length === 0) this.state = 'fighting';
        }

        if (this.state === 'fighting') {
            const alive = game.enemies.filter((e: any) => !e.dead && e.alive).length;
            if (alive === 0) {
                this.state = 'intermission';
                this._intermissionTimer = 1.5;
            }
        }

        if (this.state === 'intermission') {
            this._intermissionTimer -= dt;
            if (this._intermissionTimer <= 0) {
                this.state = 'idle';
                (this.onWaveCleared ?? (() => game.onWaveCleared()))();
            }
        }

        // 变异：混沌节拍 — 每5秒随机buff一批场上敌人（对齐 WaveData.ts 的 chaos_beat 描述）
        if (game._mutationMods?.chaosBeat) {
            this._chaosBeatTimer += dt;
            if (this._chaosBeatTimer >= 5) {
                this._chaosBeatTimer = 0;
                const alive = (game.enemies as any[]).filter(e => !e.dead);
                const batch = Math.max(1, Math.ceil(alive.length * 0.4));
                for (let i = 0; i < batch && alive.length; i++) {
                    const idx = Rng.int(0, alive.length - 1);
                    alive[idx].applyChaosBuff?.(1.6, 4);
                    alive.splice(idx, 1);
                }
            }
        }
    }

    isBossWave(): boolean {
        return !!CHAPTERS.find(c => c.bossWave === this.wave);
    }

    reset(): void {
        this.wave = 0; this.chapter = 1; this.state = 'idle';
        this._activeMutations = []; this._spawnQueue = []; this._spawnTimer = 0;
    }
}
