// ============================================================
//  WaveManager.ts — 波次管理器（一局一章 × 15 波，v5 六图五章）
// ============================================================
// - chapter 为全局章号 1~30（LevelIndex 唯一真源，1-based）；
// - wave 为关内波次 1~15（W15 = 关底，击杀即本局通关）；
// - W15 关底：图末章 = 图鉴大 Boss；前 4 章 = 小首领组合（LevelIndex.finaleFor）；
// - 小首领固定槽位（W5/W10/W14），精英固定槽（W4/W8/W14），兽潮 W9/W13。
// （无尽模式已于 2026-10-07 按玩家要求整体移除。）
import { enemyCountForWave, waveKind } from '../data/WaveData';
import { mapDef, mapOf, miniBossTiers, meleePoolFor, rangedPoolFor, finaleFor, eliteSlots } from '../data/LevelIndex';
import { MINI_BOSSES } from '../data/BossDB';
import { Rng, clamp } from '../core/MathUtils';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';

export type WaveState = 'idle' | 'spawning' | 'fighting' | 'intermission';

export class WaveManager {
    /** 关内波次（1~15）。 */
    wave        = 0;
    /** 所选全局章号 1~30（GameManager 开局注入，1-based）。 */
    chapter     = 1;
    state: WaveState = 'idle';
    /** 难度数量倍率（GameManager 注入 DifficultyDB.countMult；缺省 1 = 普通基准）。 */
    countMult   = 1;

    /** Called by GameManager: (type, x?, y?) => spawnEnemy(type, x, y) — x/y 为批次共享锚点 */
    onSpawnEnemy?: (type: string, x?: number, y?: number) => void;
    /** Called by GameManager when a wave is fully cleared. */
    onWaveCleared?: () => void;

    /** 预切好的批次队列：普通波每批5-7、兽潮波每批10-14（近战+远程混合）。 */
    private _spawnBatches: string[][] = [];
    /** 各批间隔秒数（普通 1.5 / 兽潮 1.2），spawning 阶段逐批出队。 */
    private _spawnBatchesInterval: number[] = [];
    private _spawnTimer = 0;
    /** 批间隔（v4 4.2：2.5→1.5，出怪更快密度峰值更早）。 */
    private readonly BATCH_INTERVAL = 1.5;
    /** 兽潮批间隔：更短，"整波压过来"的持续涌入感。 */
    private readonly BEAST_BATCH_INTERVAL = 1.2;
    /** 波间间歇（v4 4.2：1.5→1.0）。 */
    private readonly INTERMISSION = 1.0;
    private _intermissionTimer = 0;
    /** Boss 波待登场：小兵全部死亡后刷关底（图末章大 Boss / 前 4 章小首领组合）。 */
    private _bossPending = false;
    /** 前 4 章 W15 关底待登场的小首领 id（boss 波开始时解析）。 */
    private _finaleMini: string[] = [];
    /** 镜像军队变异：延迟登场的 Boss 同样 ×2。 */
    private _bossMirror = false;
    /** 变异：混沌节拍(chaos_beat) — 每5秒随机buff一批场上敌人的计时器。 */
    private _chaosBeatTimer = 0;

    /** 模板波次：1~15 的节奏槽位（正常局恒等于 wave；保留取模作防御性钳制）。 */
    templateWave(): number {
        return ((this.wave - 1) % 15) + 1;
    }

    // 当前章近战池（v5：LevelIndex 图池 × 图内章节渐进过滤；miniboss=暗影猎手是高级近战）
    private _meleePool(): string[] {
        return meleePoolFor(this.chapter);
    }

    // 远程类型池（同上，渐进过滤）
    private _rangedPool(): string[] {
        return rangedPoolFor(this.chapter);
    }

    /** 一批敌人共享的边缘出生锚点：整批从同一边缘进场，形成"一波"的群体感。 */
    private _batchAnchor(): [number, number] {
        const side = Rng.int(0, 3);
        switch (side) {
            case 0: return [Rng.float(120, CANVAS_W - 120), 24];
            case 1: return [Rng.float(120, CANVAS_W - 120), PLAYFIELD_BOTTOM - 24];
            case 2: return [24, Rng.float(120, PLAYFIELD_BOTTOM - 120)];
            default: return [CANVAS_W - 24, Rng.float(120, PLAYFIELD_BOTTOM - 120)];
        }
    }

    startWave(game: any): void {
        this.wave++;
        const tw = this.templateWave();
        const kind = waveKind(tw);

        // 词条 onWaveStart 钩子（wave_heal / time_shard / absolute_zero 等依赖此分发）。
        game.augmentManager?.dispatchWaveStart?.(game.player, game);

        const count = enemyCountForWave(tw, this.chapter, this.countMult);
        this._bossPending = false;
        this._bossMirror = !!((game._mutationMods || {}).mirrorArmy);
        this._finaleMini = [];
        if (kind === 'boss') {
            this._spawnBatches = this._buildMinionBatches(count, game._mutationMods || {}, tw);
            this._bossPending = true;   // 小兵清空后由 update 阶段补刷关底
            const finale = finaleFor(this.chapter);
            if (finale.kind === 'mini') {
                // 前 4 章关底：按档位从图池无重复抽小首领（池小允许回落复用）。
                const pool = mapDef(mapOf(this.chapter)).miniPool;
                const used = new Set<string>();
                for (const tier of finale.tiers) {
                    const ids = pool[tier as '普通'] ?? [];
                    const candidates = ids.filter(id => !used.has(id));
                    const pickFrom = candidates.length ? candidates : ids;
                    const id = pickFrom.length ? pickFrom[Rng.int(0, pickFrom.length - 1)] : 'chain_hound';
                    used.add(id);
                    this._finaleMini.push(id);
                }
            }
        } else {
            this._spawnBatches = this._buildMinionBatches(count, game._mutationMods || {}, tw);
        }

        // 困难模式兽潮（v4 7.2：从"每3波"改为对齐 W9/W13 密度峰）
        if (game._difficulty?.id === 'hard' && kind === 'beast') {
            game.spawnBeastTide?.(this.chapter);
        }

        this._spawnTimer = 0;
        this.state = 'spawning';
    }

    /**
     * 把小怪波总量预切成批次：普通波 5-7 只/批、兽潮波 10-14 只/批，
     * 每批远程配比随波次爬坡（W1~4 ≤1 → W12+ 2-3），并追加精英固定槽 /
     * 小首领槽位 / 掠金虫事件批 / 变异扩展批。Boss 波与普通波共用。
     */
    private _buildMinionBatches(count: number, mods: Record<string, any>, tw: number): string[][] {
        const melee = this._meleePool();
        const ranged = this._rangedPool();
        const kind = waveKind(tw);
        const beast = kind === 'beast';
        const [minSize, maxSize] = beast ? [10, 14] : [5, 7];
        const sizes: number[] = [];
        let left = count;
        while (left > 0) {
            let size = Math.min(left, Rng.int(minSize, maxSize));
            const rem = left - size;
            if (rem > 0 && rem < 3 && left >= minSize + 3) size = left - 3;
            sizes.push(size);
            left -= size;
        }
        // 尾批不足 3 只时并入前一批，避免碎尾巴（普通波并入后仍在 5-7 范围）
        if (sizes.length >= 2 && sizes[sizes.length - 1] < 3) {
            const tail = sizes.pop()!;
            sizes[sizes.length - 1] += tail;
        }
        // 每批远程数（v4 4.2）：W1 纯近战好割草、W2~4 每批 1、后期 2-3 弹幕压力；兽潮以近战炮灰为主
        const rangedPerBatch = (sz: number): number => {
            if (beast) return Math.min(Rng.int(1, 2), Math.max(0, sz - 2));
            if (tw <= 1) return 0;
            if (tw <= 4) return 1;
            if (tw >= 12) return Math.min(Rng.int(2, 3), Math.max(1, sz - 2));
            return Math.min(Rng.int(1, 2), Math.max(1, sz - 2));
        };
        const interval = beast ? this.BEAST_BATCH_INTERVAL : this.BATCH_INTERVAL;
        const batches: string[][] = [];
        const intervals: number[] = [];
        for (const sz of sizes) {
            const batch: string[] = [];
            const rangedN = Math.min(rangedPerBatch(sz), ranged.length ? 99 : 0);
            for (let i = 0; i < rangedN; i++) batch.push(Rng.pick(ranged));
            while (batch.length < sz) batch.push(Rng.pick(melee));
            batches.push(batch);
            intervals.push(interval);
        }

        // 精英固定槽（v4 7.1：W4/W8/W14，随章爬升）+ 保留现行随机精英批概率
        const eliteN = eliteSlots(tw, this.chapter);
        for (let i = 0; i < eliteN; i++) {
            batches.push(['elite_grunt']);
            intervals.push(interval);
        }
        // 随机精英批概率（v5：按图爬升 0.05→0.45，图内持平）
        const eliteChance = 0.05 + (mapOf(this.chapter) - 1) * 0.08;
        if (Rng.chance(eliteChance)) { batches.push(['elite_grunt']); intervals.push(interval); }

        // 小首领固定槽位（W5/W10/W14，档位随图与图内章爬升，同波不重复）
        const tiers = miniBossTiers(this.chapter, tw);
        const usedMini = new Set<string>();
        const miniPool = mapDef(mapOf(this.chapter)).miniPool;
        for (const tier of tiers) {
            const pool = miniPool[tier as '普通'] ?? [];
            let candidates = pool.filter(id => !usedMini.has(id));
            if (!candidates.length) candidates = pool;   // 小池跨槽允许复用
            const id = candidates.length ? candidates[Rng.int(0, candidates.length - 1)] : 'chain_hound';
            usedMini.add(id);
            batches.push([id]);
            intervals.push(interval);
        }

        // 掠金虫（v4 7.2：W11 固定 2-3 只奖励时刻；其余各波 5% 概率追加 1 只）
        const scavN = tw === 11 ? Rng.int(2, 3) : (Rng.chance(0.05) ? 1 : 0);
        for (let i = 0; i < scavN; i++) {
            batches.push(['gold_scavenger']);
            intervals.push(interval);
        }

        // 变异：分身之战 — 每波额外生成2倍普通敌人
        if (mods.cloneWar) {
            const extras = Array.from({ length: count * 2 }, () => Rng.pick(melee));
            for (let i = 0; i < extras.length; i += 4) {
                batches.push(extras.slice(i, i + 4));
                intervals.push(interval);
            }
        }
        // 变异：镜像军队 — miniboss/elite 也算"Boss型"敌人，数量×2
        if (mods.mirrorArmy) {
            const bossLike: string[] = [];
            for (const b of batches) {
                for (const t of b) if (t === 'elite_grunt' || t === 'miniboss' || MINI_BOSSES.some(m => m.id === t)) bossLike.push(t);
            }
            if (bossLike.length) { batches.push(bossLike); intervals.push(interval); }
        }

        this._spawnBatchesInterval = intervals;
        return batches;
    }

    update(dt: number, game: any): void {
        if (this.state === 'spawning') {
            this._spawnTimer -= dt;
            if (this._spawnTimer <= 0 && this._spawnBatches.length > 0) {
                // 整批共享一个边缘锚点、成员在锚点±50散布（兽潮批量更大，涌入感更强）。
                const batch = this._spawnBatches.shift()!;
                const interval = this._spawnBatchesInterval.shift() ?? this.BATCH_INTERVAL;
                const [ax, ay] = this._batchAnchor();
                const spawn = this.onSpawnEnemy ?? ((t: string, x?: number, y?: number) => game.spawnEnemy(t, x, y));
                for (const type of batch) {
                    spawn(type,
                        clamp(ax + Rng.float(-50, 50), 12, CANVAS_W - 12),
                        clamp(ay + Rng.float(-50, 50), 12, PLAYFIELD_BOTTOM - 12));
                }
                this._spawnTimer = interval;
            }
            if (this._spawnBatches.length === 0) this.state = 'fighting';
        }

        if (this.state === 'fighting') {
            const alive = game.enemies.filter((e: any) => !e.dead && e.alive).length;
            if (alive === 0) {
                // 关底波：小兵全部死亡后关底登场（图末章大 Boss / 前 4 章小首领组合；
                // 镜像军队变异 ×2）
                if (this._bossPending) {
                    this._bossPending = false;
                    const spawn = this.onSpawnEnemy ?? ((t: string, x?: number, y?: number) => game.spawnEnemy(t, x, y));
                    if (this._finaleMini.length) {
                        for (const id of this._finaleMini) spawn(id);
                        if (this._bossMirror) for (const id of this._finaleMini) spawn(id);
                    } else {
                        spawn('boss');
                        if (this._bossMirror) spawn('boss');
                    }
                    // spawn 未生效（极端/mock 场景）时直接按清场处理，避免卡死
                    const bossAlive = game.enemies.filter((e: any) => !e.dead && e.alive).length;
                    if (bossAlive === 0) {
                        this.state = 'intermission';
                        this._intermissionTimer = this.INTERMISSION;
                    }
                } else {
                    this.state = 'intermission';
                    this._intermissionTimer = this.INTERMISSION;
                }
            }
        }

        if (this.state === 'intermission') {
            this._intermissionTimer -= dt;
            if (this._intermissionTimer <= 0) {
                this.state = 'idle';
                (this.onWaveCleared ?? (() => game.onWaveCleared()))();
            }
        }

        // 变异：混沌节拍 — 每5秒随机buff一批场上敌人
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
        return this.templateWave() === 15;
    }

    reset(): void {
        this.wave = 0; this.chapter = 1; this.state = 'idle'; this.countMult = 1;
        this._spawnBatches = []; this._spawnBatchesInterval = [];
        this._spawnTimer = 0;
        this._bossPending = false; this._bossMirror = false; this._finaleMini = [];
    }
}
