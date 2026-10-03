// ============================================================
//  WaveManager.ts — 波次管理器（一局一章 × 15 波，2026-10-03 v4）
// ============================================================
// - chapter 由 GameManager 注入（所选章 1~6），不再按全局波次反推；
// - wave 为关内波次 1~15（无尽模式 16 起按模板波次循环）；
// - 小首领固定槽位（W5/W10/W14），精英固定槽（W4/W8/W14），兽潮 W9/W13。
import { MUTATIONS, enemyCountForWave, waveKind, eliteSlots, MutationDef } from '../data/WaveData';
import { MINI_BOSSES } from '../data/BossDB';
import { Rng, clamp } from '../core/MathUtils';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';

export type WaveState = 'idle' | 'spawning' | 'fighting' | 'intermission';

/** 各章小首领池（v4 6.2，按主题分配现有 11 只；tier 档位取用）。 */
const MINI_POOL: Record<number, { 普通: string[]; 史诗: string[]; 地狱: string[] }> = {
    1: { 普通: ['chain_hound', 'jelly'],            史诗: [],                                        地狱: [] },
    2: { 普通: ['turtle', 'prism_snail'],            史诗: ['drone_s'],                               地狱: [] },
    3: { 普通: ['jelly', 'prism_snail'],             史诗: ['squid', 'triune_priest'],                地狱: [] },
    4: { 普通: [],                                   史诗: ['squid', 'triune_priest', 'rail_butcher'],地狱: ['shrimp'] },
    5: { 普通: ['drone_a'],                          史诗: ['drone_s', 'rail_butcher'],               地狱: ['shrimp'] },
    6: { 普通: [],                                   史诗: ['squid', 'triune_priest', 'rail_butcher', 'drone_s'], 地狱: ['shrimp', 'bell_devourer'] },
};

/** 小首领出场槽位（v4 6.1：W5 试炼 / W10 关中战 / W14 守卫，每局共 4 次）。 */
function miniBossTiers(chapterId: number, wave: number): string[] {
    const T = (w5: number, w10a: string, w10b: string, w14: string): string[] =>
        wave === 5 ? Array(w5).fill('普通')
        : wave === 10 ? [w10a, w10b]
        : wave === 14 ? [w14]
        : [];
    switch (chapterId) {
        case 1:  return T(1, '普通', '普通', '普通');
        case 2:  return T(1, '普通', '史诗', '史诗');
        case 3:  return T(1, '史诗', '史诗', '史诗');
        case 4:  return wave === 5 ? ['史诗'] : wave === 10 ? ['史诗', '史诗'] : wave === 14 ? ['地狱'] : [];
        case 5:  return wave === 5 ? ['史诗'] : wave === 10 ? ['史诗', '地狱'] : wave === 14 ? ['地狱'] : [];
        default: return wave === 5 ? ['史诗'] : wave === 10 ? ['地狱', '地狱'] : wave === 14 ? ['地狱'] : [];
    }
}

export class WaveManager {
    /** 关内波次（1~15；无尽模式继续累加）。 */
    wave        = 0;
    /** 所选章 1~6（GameManager 开局注入；无尽沿用 6）。 */
    chapter     = 1;
    state: WaveState = 'idle';
    difficulty: 'normal' | 'nightmare' | 'chaos' = 'normal';
    /** 无尽模式：W15 击杀 Boss 后不结算，继续无限打（每+10波变异、每+15波Boss）。 */
    endless     = false;

    /** Called by GameManager: (type, x?, y?) => spawnEnemy(type, x, y) — x/y 为批次共享锚点 */
    onSpawnEnemy?: (type: string, x?: number, y?: number) => void;
    /** Called by GameManager when a wave is fully cleared. */
    onWaveCleared?: () => void;

    private _activeMutations: MutationDef[] = [];
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
    /** Boss 波待登场：小兵全部死亡后才刷大Boss（2026-09-21 玩家调整）。 */
    private _bossPending = false;
    /** 镜像军队变异：延迟登场的 Boss 同样 ×2。 */
    private _bossMirror = false;
    /** 变异：混沌节拍(chaos_beat) — 每5秒随机buff一批场上敌人的计时器。 */
    private _chaosBeatTimer = 0;

    /** 模板波次：1~15 的节奏槽位（无尽 16+ 波映射回模板，密度曲线按轮循环）。 */
    templateWave(): number {
        return ((this.wave - 1) % 15) + 1;
    }

    // 当前章近战类型池（v4 5.2 十六怪分布；miniboss=暗影猎手是高级近战不占小首领槽）
    private _meleePool(): string[] {
        switch (this.chapter) {
            case 1:  return ['grunt', 'grunt', 'grunt', 'rust_biter', 'blast_tick', 'exploder'];
            case 2:  return ['grunt', 'shield', 'shield', 'rivet_beast', 'blast_tick'];
            case 3:  return ['shield', 'rivet_beast', 'golem', 'elite_grunt'];
            case 4:  return ['golem', 'exploder', 'elite_grunt', 'rust_biter', 'miniboss'];
            case 5:  return ['golem', 'rivet_beast', 'elite_grunt', 'elite_grunt', 'miniboss'];
            default: return ['golem', 'rivet_beast', 'elite_grunt', 'elite_grunt', 'miniboss', 'blast_tick'];
        }
    }

    // 远程类型池（v4 5.2）
    private _rangedPool(): string[] {
        switch (this.chapter) {
            case 1:  return ['archer'];
            case 2:  return ['archer', 'needle_gunner'];
            case 3:  return ['needle_gunner', 'ember_acolyte', 'frost_acolyte', 'acid_sac'];
            case 4:  return ['ember_acolyte', 'frost_acolyte', 'acid_sac', 'arc_leech'];
            case 5:  return ['needle_gunner', 'arc_leech', 'archer'];
            default: return ['arc_leech', 'ember_acolyte', 'frost_acolyte', 'acid_sac'];
        }
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

        // 无尽模式：W15 后每 +10 波新增 1 个变异（以无尽内部波次计时）
        if (this.endless && this.wave > 15 && (this.wave - 15) % 10 === 0) {
            const unused = MUTATIONS.filter(m => !this._activeMutations.find(a => a.id === m.id));
            if (unused.length) {
                const m = Rng.pick(unused);
                this._activeMutations.push(m);
                m.apply(game);
                game.floatingText?.spawn(640, 200, `⚠ ${m.name} ⚠`, m.color, 24, true);
            }
        }

        const count = enemyCountForWave(tw, this.chapter, this.difficulty);
        this._bossPending = false;
        this._bossMirror = !!((game._mutationMods || {}).mirrorArmy);
        if (kind === 'boss') {
            this._spawnBatches = this._buildMinionBatches(count, game._mutationMods || {}, tw);
            this._bossPending = true;   // 小兵清空后由 update 阶段补刷 Boss
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
        const eliteChance = 0.05 + (this.chapter - 1) * 0.08;
        if (Rng.chance(eliteChance)) { batches.push(['elite_grunt']); intervals.push(interval); }

        // 小首领固定槽位（v4 6.1/6.2：W5/W10/W14，档位随章爬升，同波不重复）
        const tiers = miniBossTiers(this.chapter, tw);
        const usedMini = new Set<string>();
        for (const tier of tiers) {
            const pool = (MINI_POOL[this.chapter] ?? MINI_POOL[6])[tier as '普通'] ?? [];
            let candidates = pool.filter(id => !usedMini.has(id));
            if (!candidates.length) candidates = pool;   // 第 1 章普通池仅 2 只，跨槽允许复用
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
                // Boss 波：小兵全部死亡后大Boss才登场（镜像军队变异 ×2）
                if (this._bossPending) {
                    this._bossPending = false;
                    const spawn = this.onSpawnEnemy ?? ((t: string, x?: number, y?: number) => game.spawnEnemy(t, x, y));
                    spawn('boss');
                    if (this._bossMirror) spawn('boss');
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
        this.wave = 0; this.chapter = 1; this.state = 'idle'; this.endless = false;
        this._activeMutations = []; this._spawnBatches = []; this._spawnBatchesInterval = [];
        this._spawnTimer = 0;
        this._bossPending = false; this._bossMirror = false;
    }
}
