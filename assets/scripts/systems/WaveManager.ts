// ============================================================
//  WaveManager.ts — 波次/章节管理器
// ============================================================
import { CHAPTERS, MUTATIONS, ENEMY_COUNT_BY_WAVE, chapterForWave, MutationDef } from '../data/WaveData';
import { MINI_BOSSES } from '../data/BossDB';
import { Rng, clamp } from '../core/MathUtils';
import { ENDLESS_START_WAVE, CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';

export type WaveState = 'idle' | 'spawning' | 'fighting' | 'intermission';

export class WaveManager {
    wave        = 0;
    chapter     = 1;
    state: WaveState = 'idle';
    difficulty: 'normal' | 'nightmare' | 'chaos' = 'normal';
    endless     = false;

    /** Called by GameManager: (type, x?, y?) => spawnEnemy(type, x, y) — x/y 为批次共享锚点 */
    onSpawnEnemy?: (type: string, x?: number, y?: number) => void;
    /** Called by GameManager when a wave is fully cleared. */
    onWaveCleared?: () => void;

    private _activeMutations: MutationDef[] = [];
    /** 预切好的批次队列：每批3-4个（近战+远程混合），spawning 阶段整批出队。 */
    private _spawnBatches: string[][] = [];
    private _spawnTimer = 0;
    /** 批次间隔：一批3-4个同刷后停3.5秒，给玩家留出清理节奏。 */
    private readonly BATCH_INTERVAL = 2.5;
    private _intermissionTimer = 0;
    /** Boss 波待登场：小兵全部死亡后才刷大Boss（2026-09-21 玩家调整）。 */
    private _bossPending = false;
    /** 镜像军队变异：延迟登场的 Boss 同样 ×2。 */
    private _bossMirror = false;
    /** 变异：混沌节拍(chaos_beat) — 每5秒随机buff一批场上敌人的计时器。 */
    private _chaosBeatTimer = 0;

    // 当前波次近战类型池（按章节加权）；第五章/无尽沿用 default，含小BOSS
    private _meleePool(): string[] {
        switch (this.chapter) {
            case 1: return ['grunt', 'grunt', 'grunt', 'shield', 'exploder'];
            case 2: return ['grunt', 'shield', 'shield', 'exploder', 'golem'];
            case 3: return ['shield', 'exploder', 'golem', 'golem', 'elite_grunt'];
            case 4: return ['golem', 'exploder', 'elite_grunt', 'miniboss'];
            default: return ['golem', 'exploder', 'elite_grunt', 'elite_grunt', 'miniboss'];
        }
    }

    // 远程类型池：毒射手，与玩家保持距离发射毒弹
    private _rangedPool(): string[] {
        return ['archer'];
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
        this.chapter = chapterForWave(this.wave);

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

        // Boss 波：小兵先上，场上小兵全部死亡后大Boss才登场（2026-09-21 玩家
        // 调整：不再开局同刷）。镜像军队变异仍使 Boss 数量×2。
        const chDef = CHAPTERS.find(c => c.bossWave === this.wave);
        const mods  = game._mutationMods || {};
        this._bossPending = false;
        this._bossMirror = !!mods.mirrorArmy;
        if (chDef) {
            const count = ENEMY_COUNT_BY_WAVE(this.wave, this.difficulty);
            this._spawnBatches = this._buildMinionBatches(count, mods);
            this._bossPending = true;   // 小兵清空后由 update 阶段补刷 Boss
        } else {
            const count = ENEMY_COUNT_BY_WAVE(this.wave, this.difficulty);
            this._spawnBatches = this._buildMinionBatches(count, mods);
        }

        // 困难模式兽潮：每 3 波从屏幕边缘刷一圈强化怪向中心收拢（GameManager 维护）
        if (game._difficulty?.id === 'hard' && this.wave > 0 && this.wave % 3 === 0) {
            game.spawnBeastTide?.(this.chapter);
        }

        this._spawnTimer = 0;
        this.state = 'spawning';
    }

    /**
     * 把小怪波总量预切成 5-7 个的批次（每批 2-3 个远程 + 其余近战），
     * 并追加精英/变异扩展批。Boss 波与普通波共用，保证"boss 也正常刷小怪"。
     * 2026-09-07 密度上调：批次 3-4→5-7、批间隔 3.5s→2.5s（配合 WaveData
     * 总量曲线上调，同屏敌人密度显著提升，而不只是把波次时间拉长）。
     */
    private _buildMinionBatches(count: number, mods: Record<string, any>): string[][] {
        const melee = this._meleePool();
        // 先把 count 预切成 5-7 个的批；若这样切会剩 1-2 只的尾巴批，
        // 则把本批改为 left-3（仍在 5-7 范围内），让尾批至少 3 只。
        const sizes: number[] = [];
        let left = count;
        while (left > 0) {
            let size = Math.min(left, Rng.int(5, 7));
            const rem = left - size;
            if (rem > 0 && rem < 3 && left >= 8) size = left - 3;
            sizes.push(size);
            left -= size;
        }
        const batches: string[][] = sizes.map(sz => {
            const rangedN = Math.min(Rng.int(2, 3), Math.max(1, sz - 2));
            const batch: string[] = [];
            for (let i = 0; i < rangedN; i++) batch.push(Rng.pick(this._rangedPool()));
            while (batch.length < sz) batch.push(Rng.pick(melee));
            return batch;
        });
        const eliteChance = 0.05 + (this.chapter - 1) * 0.08;
        if (Rng.chance(eliteChance)) batches.push(['elite_grunt']);
        // 第三章之后的章节（4/5 与无尽沿用阶段）每波固定小BOSS压阵
        // （2026-09-21 频率上调）：第四章 2 只，第五章/无尽 3 只。
        // 单位取特型小BOSS名册（测试房同款：深海鱿鱼/锯齿剑虾/毒刺鬼水母/
        // 攻击·支援无人机/铆链猎犬/棱壳巡灯兽/三相祭司/磁轨屠夫/葬钟吞噬者/
        // 盾龟），按稀有度加权（普通×3/史诗×2/地狱×1），同一波内不重复
        if (this.chapter >= 4) {
            const n = this.chapter >= 5 ? 3 : 2;
            const weights = MINI_BOSSES.map(m => m.tier === '地狱' ? 1 : m.tier === '史诗' ? 2 : 3);
            const poolIdx = MINI_BOSSES.map((_, i) => i);
            for (let i = 0; i < n; i++) {
                let id: string;
                if (poolIdx.length) {
                    const k = Rng.weighted(poolIdx.map(j => weights[j]));
                    id = MINI_BOSSES[poolIdx.splice(k, 1)[0]].id;
                } else {
                    id = MINI_BOSSES[Rng.weighted(weights)].id;
                }
                batches.push([id]);
            }
        }
        // 变异：分身之战 — 每波额外生成2倍普通敌人（对齐 WaveData.ts 的 clone_war 描述）
        if (mods.cloneWar) {
            const extras = Array.from({ length: count * 2 }, () => Rng.pick(melee));
            for (let i = 0; i < extras.length; i += 4) batches.push(extras.slice(i, i + 4));
        }
        // 变异：镜像军队 — miniboss/elite 也算"Boss型"敌人，数量×2
        if (mods.mirrorArmy) {
            const bossLike: string[] = [];
            for (const b of batches) {
                for (const t of b) if (t === 'elite_grunt' || t === 'miniboss') bossLike.push(t);
            }
            if (bossLike.length) batches.push(bossLike);
        }
        return batches;
    }

    update(dt: number, game: any): void {
        if (this.state === 'spawning') {
            this._spawnTimer -= dt;
            if (this._spawnTimer <= 0 && this._spawnBatches.length > 0) {
                // 一波5-7个成批同刷：整批共享一个边缘锚点、成员在锚点±50散布，
                // 批间隔2.5秒（密度上调前为3-4个/3.5秒滴灌，同屏压力不足）。
                const batch = this._spawnBatches.shift()!;
                const [ax, ay] = this._batchAnchor();
                const spawn = this.onSpawnEnemy ?? ((t: string, x?: number, y?: number) => game.spawnEnemy(t, x, y));
                for (const type of batch) {
                    spawn(type,
                        clamp(ax + Rng.float(-50, 50), 12, CANVAS_W - 12),
                        clamp(ay + Rng.float(-50, 50), 12, PLAYFIELD_BOTTOM - 12));
                }
                this._spawnTimer = this.BATCH_INTERVAL;
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
                        this._intermissionTimer = 1.5;
                    }
                } else {
                    this.state = 'intermission';
                    this._intermissionTimer = 1.5;
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
        this._activeMutations = []; this._spawnBatches = []; this._spawnTimer = 0;
        this._bossPending = false; this._bossMirror = false;
    }
}
