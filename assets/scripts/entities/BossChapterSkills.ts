// ============================================================
//  BossChapterSkills.ts — ch1~ch4 章节大Boss技能库（敌人技能优化方案）
// ============================================================
// 结构与三只文档Boss（_updateDocBossSkills）同构：普攻节奏 + 技能固定轮转
// （P1 出前2招 → P2 出4招 → P3 先强制终技再全池轮转），简单难度技能削减
// （bossSkillCut）由 BossController 调度器统一处理。
// 技能全部由现有基础设施拼装：warn_circle/warn_line 通用预警、acid hazard
// 地面危险区、blastCountdown 自爆通道、EnemyBase.randomEdgePos 边缘出生；
// 不依赖任何 testRoom 门槛接口，正式局与测试房行为一致。
// 与方案文档的两处实现折衷（记录于此）：
//  1. ch4「镜像分身」→「混沌回响」：三分身实体成本过高，改为三组扇形幻影弹幕；
//  2. ch4「门扉洞开」→「终焉洪流」：可击破门实体需要专属机制物通道，改为
//     上下边缘持续弹幕墙 + 少量精英涌出的压迫型终技。
import { Vec, Rng, clamp } from '../core/MathUtils';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';
import { EnemyBase } from './EnemyBase';

export interface ChapterBossSkill {
    name: string;
    /** 技能名浮字颜色取 boss.glowColor；exec 只负责机制，浮字/签名粒子由调度器统一发。 */
    exec: (boss: any, player: any, game: any) => void;
}

/** 玩家半径兜底（headless 测试里 player 可能是最小 mock）。 */
function pr(player: any): number { return player.radius ?? 16; }

// ── ch1 废土领主·腐肉：腐肉孵化 / 酸雨弹幕 / 蛮牛冲撞 / 尸潮共振 ──
const CH1_SKILLS: ChapterBossSkill[] = [
    {
        name: '腐肉孵化', exec(boss, player, game) {
            const count = boss.phase >= 3 ? 3 : 2;
            for (let i = 0; i < count; i++) {
                const a = Rng.float(0, Math.PI * 2);
                const d = Rng.float(120, 240);
                const x = clamp(boss.x + Math.cos(a) * d, 60, CANVAS_W - 60);
                const y = clamp(boss.y + Math.sin(a) * d, 60, PLAYFIELD_BOTTOM - 60);
                game.spawnWarnCircle?.(x, y, 44, 0.8, '#7dff6a', () => {
                    if (!boss.alive) return;
                    const n = boss.phase >= 3 ? 2 : 1;
                    for (let k = 0; k < n; k++) game.spawnEnemy?.('rust_biter', x, y);
                    game.particles?.enemyBurst?.(x, y, 'acid', 30);
                });
            }
            game.audio?.playSfx?.('skill_e', 0.5);
        },
    },
    {
        name: '酸雨弹幕', exec(boss, player, game) {
            for (let i = 0; i < 5; i++) {
                const spread = 60 + i * 110;
                const a = Rng.float(0, Math.PI * 2);
                const d = Rng.float(0, spread);
                const tx = clamp(player.x + Math.cos(a) * d, 52, CANVAS_W - 52);
                const ty = clamp(player.y + Math.sin(a) * d, 52, PLAYFIELD_BOTTOM - 52);
                game.spawnEnemyAcidHazard?.(boss.x, boss.y, tx, ty);
            }
            game.audio?.playSfx?.('skill_e', 0.55);
        },
    },
    {
        name: '蛮牛冲撞', exec(boss, player, game) {
            // 正在冲锋/蓄力时本轮空放：不留 _rockBurstPending 残留标记，
            // 否则下一次任意冲锋结束会误发碎石环。
            if (boss.isCharging || boss.chargeWindup > 0) return;
            boss.triggerChapterCharge(player, game);
            boss._rockBurstPending = true; // 冲锋结束时由 BossController 发8向碎石环
        },
    },
    {
        name: '尸潮共振', exec(boss, player, game) {
            game.screenShake?.shake?.(8, 0.3);
            game.audio?.playSfx?.('boss_roar', 0.7);
            const foes = (game.enemies || []).filter((e: any) =>
                e.alive && !e.isBoss && !e.isMiniBoss);
            if (foes.length) {
                // 点燃全场小怪（复用熔爆蜱倒计时通道）：1.2s 后各自爆炸——
                // 反制方式是远离怪群或提前清场。
                for (const e of foes) {
                    e.blastCountdown = 1.2;
                    e.blastCountdownMax = 1.2;
                    game.particles?.spawnSpriteFx?.(e.x, e.y, 'fx_enemy_ember_brand', 1.2, 1.2,
                        undefined, { follow: e, motion: 'aura', baseAlpha: 0.85 });
                }
            } else {
                // 场上无小怪：退化为自身三环腐臭波。
                for (let ring = 0; ring < 3; ring++) {
                    const r = 150 + ring * 90;
                    game.spawnWarnCircle?.(boss.x, boss.y, r + 20, 1.5, '#ff6a3d', () => {
                        if (!player.alive) return;
                        const dist = Vec.dist(boss.x, boss.y, player.x, player.y);
                        if (Math.abs(dist - r) <= 22 + pr(player)) {
                            player.takeDamage(boss.damage * boss.buffDmgMult * 0.6, game,
                                { impact: { source: boss.hitSource, kind: 'explosion' } });
                        }
                    });
                }
            }
        },
    },
];

// ── ch2 钢铁之王·熔炉：熔火喷发 / 磁轨狙击 / 装配流水线 / 熔毁带 ──
const CH2_SKILLS: ChapterBossSkill[] = [
    {
        name: '熔火喷发', exec(boss, player, game) {
            const spots: [number, number][] = [[boss.x, boss.y]];
            for (let i = 0; i < 2; i++) {
                const a = Rng.float(0, Math.PI * 2);
                spots.push([
                    clamp(player.x + Math.cos(a) * Rng.float(80, 280), 60, CANVAS_W - 60),
                    clamp(player.y + Math.sin(a) * Rng.float(80, 280), 60, PLAYFIELD_BOTTOM - 60),
                ]);
            }
            for (const [x, y] of spots) {
                game.spawnWarnCircle?.(x, y, 64, 1.0, '#ff7a24', () => {
                    game.particles?.enemyBurst?.(x, y, 'metal', 56);
                    game.particles?.ignite?.(x, y);
                    if (player.alive && Vec.dist(x, y, player.x, player.y) <= 64 + pr(player)) {
                        player.takeDamage(boss.damage * boss.buffDmgMult * 0.6, game,
                            { impact: { source: boss.hitSource, kind: 'fire' } });
                    }
                });
            }
            game.audio?.playSfx?.('explode', 0.5);
        },
    },
    {
        name: '磁轨狙击', exec(boss, player, game) {
            const angle = Math.atan2(player.y - boss.y, player.x - boss.x);
            game.spawnWarnLine?.(boss.x, boss.y, angle, 1200, 0.9, '#ff9b46', () => {
                if (!boss.alive) return;
                game.enemyBullets?.push({ hitSource: boss.hitSource,
                    x: boss.x + Math.cos(angle) * 40, y: boss.y + Math.sin(angle) * 40,
                    vx: Math.cos(angle) * 980, vy: Math.sin(angle) * 980,
                    damage: boss.damage * boss.buffDmgMult * 0.55, radius: 10, color: '#ff4fb9',
                    life: 1.6, lifeTime: 1.6, owner: 'enemy', isEnemyBullet: true, enemyFx: 'rail',
                });
                // 发射后坐：与磁轨屠夫同款100px位移表现。
                boss.x = clamp(boss.x - Math.cos(angle) * 100, boss.radius, CANVAS_W - boss.radius);
                boss.y = clamp(boss.y - Math.sin(angle) * 100, boss.radius, PLAYFIELD_BOTTOM - boss.radius);
                game.particles?.impact?.(boss.x, boss.y, angle + Math.PI, 1.1, '#ff4fb9');
                game.audio?.playSfx?.('skill_q', 0.7);
            });
        },
    },
    {
        name: '装配流水线', exec(boss, player, game) {
            const rivets = boss.phase >= 3 ? 2 : 1;
            for (let i = 0; i < rivets; i++) {
                const [x, y] = EnemyBase.randomEdgePos(30);
                game.spawnEnemy?.('rivet_beast', x, y);
            }
            for (let i = 0; i < 2; i++) {
                const [x, y] = EnemyBase.randomEdgePos(22);
                game.spawnEnemy?.('shield', x, y);
            }
            game.particles?.enemySignature?.(boss.hitSource, 'summon', boss.x, boss.y);
        },
    },
    {
        name: '熔毁带', exec(boss, player, game) {
            // 2横1竖危险带：相邻预警圆相切拼合成带（r=80、间距160），1.6s后整带喷发。
            const rows = [200, 380, 560];
            const cols = [CANVAS_W / 3, CANVAS_W * 2 / 3];
            const pickedRows = rows.slice().sort(() => Rng.float(-1, 1)).slice(0, 2);
            const pickedCol = cols[Rng.int(0, cols.length - 1)];
            const lane = (x: number, y: number) => game.spawnWarnCircle?.(x, y, 80, 1.6, '#ff7a24', () => {
                game.particles?.enemyBurst?.(x, y, 'metal', 40);
                if (player.alive && Vec.dist(x, y, player.x, player.y) <= 80 + pr(player)) {
                    player.takeDamage(boss.damage * boss.buffDmgMult * 0.7, game,
                        { ignoreIframe: game?.state === 'testRoom', impact: { source: boss.hitSource, kind: 'fire' } });
                }
            });
            for (const y of pickedRows) for (let k = 0; k < 8; k++) lane(80 + k * 160, y);
            // 竖带覆盖 0~PLAYFIELD_BOTTOM(648)：5 圆间距130(相切无缝)，末圆不越界
            for (let k = 0; k < 5; k++) lane(pickedCol, 64 + k * 130);
            game.audio?.playSfx?.('explode', 0.6);
        },
    },
];

// ── ch3 海克斯异变体·无限核：增殖 / 相位滑移 / 辐照池 / 基因风暴 ──
const CH3_SKILLS: ChapterBossSkill[] = [
    {
        name: '增殖', exec(boss, player, game) {
            const hatchlings = (game.enemies || []).filter((e: any) =>
                e.alive && e.type === 'vespa_hatchling').length;
            if (hatchlings < 4) {
                const a = Rng.float(0, Math.PI * 2);
                const x = clamp(boss.x + Math.cos(a) * 110, 40, CANVAS_W - 40);
                const y = clamp(boss.y + Math.sin(a) * 110, 40, PLAYFIELD_BOTTOM - 40);
                game.spawnWarnCircle?.(x, y, 36, 0.7, '#7dff4a', () => {
                    if (!boss.alive) return;
                    game.spawnEnemy?.('vespa_hatchling', x, y);
                    game.particles?.enemyBurst?.(x, y, 'acid', 26);
                });
            } else {
                // 触手上限已满：退化为一次辐照池，保持轮转不空转。
                const a0 = Rng.float(0, Math.PI * 2);
                for (let i = 0; i < 3; i++) {
                    const a = a0 + i * (Math.PI * 2 / 3);
                    game.spawnEnemyAcidHazard?.(boss.x, boss.y,
                        clamp(player.x + Math.cos(a) * 90, 52, CANVAS_W - 52),
                        clamp(player.y + Math.sin(a) * 90, 52, PLAYFIELD_BOTTOM - 52));
                }
            }
        },
    },
    {
        name: '相位滑移', exec(boss, player, game) {
            const base = Math.atan2(player.y - boss.y, player.x - boss.x);
            const a = base + (Rng.chance(0.5) ? 1 : -1) * (80 * Math.PI / 180);
            const lx = clamp(player.x + Math.cos(a) * 260, 60, CANVAS_W - 60);
            const ly = clamp(player.y + Math.sin(a) * 260, 60, PLAYFIELD_BOTTOM - 60);
            game.spawnWarnCircle?.(lx, ly, 40, 0.45, '#7dff4a', () => {
                if (!boss.alive) return;
                game.particles?.explode?.(boss.x, boss.y, '#7dff4a', 36);
                boss.x = lx; boss.y = ly;
                game.particles?.enemyBurst?.(lx, ly, 'acid', 36);
            });
        },
    },
    {
        name: '辐照池', exec(boss, player, game) {
            const a0 = Rng.float(0, Math.PI * 2);
            for (let i = 0; i < 3; i++) {
                const a = a0 + i * (Math.PI * 2 / 3);
                game.spawnEnemyAcidHazard?.(boss.x, boss.y,
                    clamp(player.x + Math.cos(a) * Rng.float(30, 130), 52, CANVAS_W - 52),
                    clamp(player.y + Math.sin(a) * Rng.float(30, 130), 52, PLAYFIELD_BOTTOM - 52));
            }
            game.audio?.playSfx?.('skill_e', 0.45);
        },
    },
    {
        name: '基因风暴', exec(boss, player, game) {
            // 每场随机固定2种变异弹幕（存 _genePatterns），终技时交替释放——
            // 体现「无限核」的不可预测，且每局体验不同。
            if (!boss._genePatterns) {
                const all = [0, 1, 2];
                all.sort(() => Rng.float(-1, 1));
                boss._genePatterns = all.slice(0, 2);
                boss._geneCursor = 0;
            }
            const pattern = boss._genePatterns[boss._geneCursor % boss._genePatterns.length];
            boss._geneCursor++;
            const dmg = boss.damage * boss.buffDmgMult * 0.5;
            if (pattern === 0) {
                // 螺旋弹：双旋臂12发
                const base = Rng.float(0, Math.PI);
                for (let i = 0; i < 12; i++) {
                    const a = base + (i / 6) * Math.PI;
                    game.enemyBullets?.push({ hitSource: boss.hitSource,
                        x: boss.x, y: boss.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
                        damage: dmg, radius: 10, color: '#66ff9e',
                        life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'homing',
                    });
                }
            } else if (pattern === 1) {
                // 交叉三连追踪
                const base = Math.atan2(player.y - boss.y, player.x - boss.x);
                for (const off of [-0.5, 0, 0.5]) {
                    const a = base + off;
                    game.enemyBullets?.push({ hitSource: boss.hitSource,
                        x: boss.x, y: boss.y, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280,
                        damage: dmg, radius: 12, color: '#7dffd4',
                        life: 4, lifeTime: 4, owner: 'enemy', isEnemyBullet: true,
                        homing: true, enemyFx: 'homing',
                    });
                }
            } else {
                // 扩散蠕虫弹：8发慢速大弹，撞边反弹1次
                for (let i = 0; i < 8; i++) {
                    const a = Rng.float(0, Math.PI * 2);
                    game.enemyBullets?.push({ hitSource: boss.hitSource,
                        x: boss.x, y: boss.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130,
                        damage: dmg, radius: 14, color: '#9fff5c',
                        life: 4, lifeTime: 4, owner: 'enemy', isEnemyBullet: true,
                        bounceLeft: 1, enemyFx: 'chaos',
                    });
                }
            }
            game.audio?.playSfx?.('skill_e', 0.6);
        },
    },
];

// ── ch4 混沌深渊·终焉之门：奇点 / 混沌回响 / 空间折叠 / 终焉洪流 ──
const CH4_SKILLS: ChapterBossSkill[] = [
    {
        name: '奇点', exec(boss, player, game) {
            const a = Math.atan2(player.y - boss.y, player.x - boss.x);
            game.enemyBullets?.push({ hitSource: boss.hitSource,
                x: boss.x, y: boss.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
                damage: boss.damage * boss.buffDmgMult * 0.3, radius: 16, color: '#b06bff',
                life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'chaos',
                attract: { radius: 180, pullSpeed: 130, absorbRadius: 70 },
                burstDmg: boss.damage * boss.buffDmgMult * 0.15,
            });
            game.audio?.playSfx?.('skill_e', 0.6);
        },
    },
    {
        name: '混沌回响', exec(boss, player, game) {
            // 三分身齐射：三个发射点绕本体120°均布，各自朝玩家扇形开火
            //（分身实体成本过高，以幻影弹幕表达，见文件头折衷记录）。
            const base = Math.atan2(player.y - boss.y, player.x - boss.x);
            for (let g = 0; g < 3; g++) {
                const ga = g * (Math.PI * 2 / 3);
                const gx = boss.x + Math.cos(ga) * 70;
                const gy = boss.y + Math.sin(ga) * 70;
                for (let k = -2; k <= 2; k++) {
                    const a = base + k * 0.14;
                    game.enemyBullets?.push({ hitSource: boss.hitSource,
                        x: gx, y: gy, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230,
                        damage: boss.damage * boss.buffDmgMult * 0.45, radius: 9, color: '#c991ff',
                        life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'chaos',
                    });
                }
                game.particles?.enemyBurst?.(gx, gy, 'chaos', 20);
            }
            game.audio?.playSfx?.('skill_e', 0.55);
        },
    },
    {
        name: '空间折叠', exec(boss, player, game) {
            const px = player.x, py = player.y;
            const bx = boss.x, by = boss.y;
            // 双圈预警（Boss当前位 + 玩家锁定位）→ 交换双方位置，交换后附带撕裂伤。
            game.spawnWarnCircle?.(bx, by, 60, 0.6, '#c991ff');
            game.spawnWarnCircle?.(px, py, 60, 0.6, '#c991ff', () => {
                if (!boss.alive || !player.alive) return;
                boss.x = clamp(px, boss.radius, CANVAS_W - boss.radius);
                boss.y = clamp(py, boss.radius, PLAYFIELD_BOTTOM - boss.radius);
                const r = pr(player);
                const next = game.moveInArena?.(bx, by, 0, 0, r)
                    ?? { x: clamp(bx, r, CANVAS_W - r), y: clamp(by, r, PLAYFIELD_BOTTOM - r) };
                player.x = next.x; player.y = next.y;
                game.particles?.explode?.(boss.x, boss.y, '#c991ff', 56);
                game.screenShake?.shake?.(9, 0.28);
                player.takeDamage(boss.damage * boss.buffDmgMult * 0.35, game,
                    { ignoreIframe: game?.state === 'testRoom', impact: { source: boss.hitSource, kind: 'chaos' } });
                // 交换后立即接一发普攻，兑现"被拉到Boss脸上"的压迫。
                chapterBossBasicAttack(boss.chapter, boss, player, game);
            });
            game.audio?.playSfx?.('skill_q', 0.6);
        },
    },
    {
        name: '终焉洪流', exec(boss, player, game) {
            // 6秒持续终技：每1.2s上下边缘各一排预警线→弹幕（见 chapterBossPassives
            // 的推进器），每次排弹有概率从边缘涌入精英（场上上限4）。
            boss._floodLeft = 5;
            boss._floodCd = 0.9;
            game.audio?.playSfx?.('boss_roar', 0.7);
        },
    },
];

export const CHAPTER_BOSS_SKILLS: Record<number, ChapterBossSkill[]> = {
    1: CH1_SKILLS,
    2: CH2_SKILLS,
    3: CH3_SKILLS,
    4: CH4_SKILLS,
};

/** 普攻（原 _useSkill 的 ch1~ch4 弹型保留为基础轮；ch3 弹数随阶段增长=被动「进化」）。 */
export function chapterBossBasicAttack(chapter: number, boss: any, player: any, game: any): void {
    if (chapter === 1) {
        for (let i = -1; i <= 1; i++) {
            const a = Math.atan2(player.y - boss.y, player.x - boss.x) + i * 0.3;
            game.enemyBullets?.push({ hitSource: boss.hitSource,
                x: boss.x, y: boss.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
                damage: boss.damage * boss.buffDmgMult * 0.6, radius: 10, color: '#44ff00',
                life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'poison',
            });
        }
    } else if (chapter === 2) {
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + boss._animTime;
            game.enemyBullets?.push({ hitSource: boss.hitSource,
                x: boss.x, y: boss.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200,
                damage: boss.damage * boss.buffDmgMult * 0.5, radius: 10, color: '#ffad42',
                life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'gear',
            });
        }
    } else if (chapter === 3) {
        // 被动·进化：每损失一档血（进入新阶段）普攻弹数+1。
        const count = 1 + Math.max(0, boss.phase - 1);
        for (let i = 0; i < count; i++) {
            const [dx, dy] = Vec.normalize(player.x - boss.x, player.y - boss.y);
            const off = count > 1 ? (i - (count - 1) / 2) * 0.35 : 0;
            const a = Math.atan2(dy, dx) + off;
            game.enemyBullets?.push({ hitSource: boss.hitSource,
                x: boss.x, y: boss.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
                damage: boss.damage * boss.buffDmgMult * 0.8, radius: 13, color: '#ff4da6',
                life: 4, lifeTime: 4, owner: 'enemy', isEnemyBullet: true,
                homing: true, enemyFx: 'homing',
            });
        }
    } else {
        for (let i = 0; i < 12; i++) {
            const a = Rng.float(0, Math.PI * 2);
            game.enemyBullets?.push({ hitSource: boss.hitSource,
                x: boss.x, y: boss.y,
                vx: Math.cos(a) * Rng.float(150, 350), vy: Math.sin(a) * Rng.float(150, 350),
                damage: boss.damage * boss.buffDmgMult * 0.7, radius: 11, color: '#ffe066',
                life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'chaos',
            });
        }
    }
}

/** 每帧被动（BossController 调度器调用）：食腐 / 炽热装甲 / 终焉洪流推进。 */
export function chapterBossPassives(boss: any, dt: number, player: any, game: any): void {
    const ch = boss.chapter;
    if (ch === 1) {
        // 食腐：每20s吞食300内一只小怪（直接消化，不掉落不计击杀）回5%血。
        boss._scavCd = (boss._scavCd ?? 12) - dt;
        if (boss._scavCd <= 0) {
            boss._scavCd = 20;
            const prey = (game.enemies || []).find((e: any) => e.alive && !e.isBoss &&
                !e.isMiniBoss && Vec.dist(e.x, e.y, boss.x, boss.y) <= 300);
            if (prey) {
                prey.hp = 0;
                prey.alive = false;
                boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * 0.05);
                game.particles?.heal?.(boss.x, boss.y);
                game.particles?.explode?.(prey.x, prey.y, '#7dff6a', 26);
                game.floatingText?.spawn?.(boss.x, boss.y - 90, '进食 +5%', '#7dff6a', 15, true);
            }
        }
    } else if (ch === 2) {
        // 炽热装甲：每损失25%血护甲+15（最多3档），炉温外化为可见的坦度增长。
        const ratio = boss.hp / boss.maxHp;
        const tier = ratio <= 0.25 ? 3 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 1 : 0;
        if (tier > (boss._heatTier ?? 0)) {
            boss._heatTier = tier;
            boss.armor += 15;
            game.particles?.enemyBurst?.(boss.x, boss.y, 'metal', 40);
            game.floatingText?.spawn?.(boss.x, boss.y - 90, `炽热装甲 +15（${tier}档）`, '#ff8b2c', 15, true);
        }
    } else if (ch === 4) {
        // 终焉洪流推进：剩余排数>0时每1.2s上下边缘各一排弹幕，穿插精英。
        if ((boss._floodLeft ?? 0) > 0) {
            boss._floodCd -= dt;
            if (boss._floodCd <= 0) {
                boss._floodLeft--;
                boss._floodCd = 1.2;
                const dmg = boss.damage * boss.buffDmgMult * 0.5;
                const row = (fromTop: boolean, x: number) => {
                    const y = fromTop ? 20 : PLAYFIELD_BOTTOM - 20;
                    const angle = fromTop ? Math.PI / 2 : -Math.PI / 2;
                    game.spawnWarnLine?.(x, y, angle, PLAYFIELD_BOTTOM, 0.8, '#c991ff', () => {
                        if (!boss.alive) return;
                        for (let k = -2; k <= 2; k++) {
                            const a = angle + k * 0.18;
                            game.enemyBullets?.push({ hitSource: boss.hitSource,
                                x, y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190,
                                damage: dmg, radius: 9, color: '#c991ff',
                                life: 4, lifeTime: 4, owner: 'enemy', isEnemyBullet: true,
                                enemyFx: 'chaos',
                            });
                        }
                        game.audio?.playSfx?.('skill_e', 0.4);
                    });
                };
                row(true, Rng.float(100, CANVAS_W - 100));
                row(false, Rng.float(100, CANVAS_W - 100));
                const elites = (game.enemies || []).filter((e: any) => e.alive && e.isElite).length;
                if (elites < 4 && Rng.chance(0.25)) {
                    const [x, y] = EnemyBase.randomEdgePos(22);
                    game.spawnEnemy?.('elite_grunt', x, y);
                }
            }
        }
    }
}
