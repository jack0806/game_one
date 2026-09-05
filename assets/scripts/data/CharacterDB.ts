// ============================================================
//  CharacterDB.ts — 6 角色定义（纯数据 + 技能函数引用）
// ============================================================
import { Vec, Rng, clamp } from '../core/MathUtils';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';

// CHARS 数组在文件末尾由 CHARACTERS 派生，方便按索引迭代

export interface CharStats {
    maxHp: number;
    speed: number;
    damage: number;
    attackSpeed: number;
    armor: number;
    critRate: number;
    critDmg: number;
    pierce: number;
    [key: string]: any;
}

export interface CharDef {
    id: string;
    name: string;
    icon: string;
    color: string;
    unlocked: boolean;
    unlockHint?: string;
    attackType: 'ranged' | 'melee';
    attackRange: number;
    /** 可选：Q/E 技能冷却秒数（缺省 Q=4 / E=10，供个别角色定制）。 */
    qCd?: number;
    eCd?: number;
    /** 大招R固定冷却秒数。按大招强度分档15-20s：强爆发/全场伤害20s，
     *  功能型18s，持续输出17s，依赖已装备词条(空装弱)15s。 */
    ultCd: number;
    desc: string;
    skills: { q: string; e: string; r: string };
    /** 技能环(Q/E/R)显示的图标key，取自 ui_icon_* 共享图标模板集（见 ArtRemap 同名key）。 */
    skillIcons: { q: string; e: string; r: string };
    stats: CharStats;
    passive?: (p: any, game: any) => void;
    qSkill: (p: any, game: any) => void;
    eSkill: (p: any, game: any) => void;
    ultimate: (p: any, game: any) => void;
}

export const CHARACTERS: Record<string, CharDef> = {
    kai: {
        id: 'kai',
        name: '炮击手·凯尔', icon: '⚙️', color: '#00ffcc', unlocked: true,
        attackType: 'ranged', attackRange: 550, ultCd: 20,
        desc: '穿甲义肢炮，子弹额外穿透1个敌人',
        skills: { q: '强化射击 — 发射超大穿透弹，伤害×4', e: '弹幕模式 — 4秒内三连发，无法移动', r: '核心过载 — 全方向30发爆炸弹+8秒伤害×2' },
        skillIcons: { q: 'pierce', e: 'bounce', r: 'explosion' },
        stats: { maxHp: 120, speed: 330, damage: 25, attackSpeed: 2, armor: 10, critRate: 0.05, critDmg: 0.5, pierce: 1 },
        passive(p: any) { p.stats.pierce += 1; },
        qSkill(p: any, game: any) {
            // 方向性技能沿角色朝向释放（facing 随移动输入更新），不再追鼠标
            const [nx, ny] = p.getCastDirection?.() ?? Vec.normalize(p.facingX ?? 1, p.facingY ?? 0);
            const [mx, my] = p.getMuzzlePosition?.() ?? [p.x, p.y];
            // 弹头放大50%（radius 12 → 18）
            game.bulletPool.spawn({ x: mx, y: my, vx: nx * 700, vy: ny * 700, damage: p.stats.damage * 4, radius: 18, color: '#ff8800', pierceLeft: 999, lifeTime: 2, owner: 'player', charKey: p.charId, isCrit: false });
            game.particles.hexActivate(p.x, p.y, '#00ffcc');
            if (game.particles.weaponFlash) game.particles.weaponFlash(mx, my, nx, ny, 'charged');
            else game.particles.explode(mx, my, '#ff8800', 20);
        },
        eSkill(p: any, game: any) {
            p.applyBuff('barrage_mode', 4, { atkSpd: 3, noMove: true });
            game.particles.hexActivate(p.x, p.y, '#00ffcc');
        },
        ultimate(p: any, game: any) {
            // 弹头自动追踪敌人（homing 由 BulletPool.update 朝最近敌人转向）
            const [mx, my] = p.getMuzzlePosition?.() ?? [p.x, p.y];
            for (let i = 0; i < 30; i++) {
                const a = Rng.float(0, Math.PI * 2);
                game.bulletPool.spawn({ x: mx, y: my, vx: Math.cos(a) * 500, vy: Math.sin(a) * 500, damage: p.stats.damage * 2, radius: 7, color: '#ff4400', pierceLeft: 2, lifeTime: 1.8, owner: 'player', charKey: p.charId, homing: true });
            }
            p.applyBuff('overload', 8, { dmgMult: 2 });
            game.screenShake.shake(15, 0.5);
            game.particles.hexActivate(p.x, p.y, '#ff6600');
        },
    },
    vivian: {
        id: 'vivian',
        name: '工程师·薇薇安', icon: '🤖', color: '#00aaff', unlocked: true,
        attackType: 'ranged', attackRange: 550, ultCd: 17,
        eCd: 12, // 超频指令 CD 12 秒（文档：英雄重做）
        desc: '炮台类词条效果×1.5',
        skills: { q: '部署炮台 — 召唤强化炮台持续攻击', e: '超频指令 — 8秒内自身与所有炮台伤害+20%/攻速+150%', r: '炮台风暴 — 召唤6座轨道炮台环绕旋转' },
        skillIcons: { q: 'summon', e: 'lightning', r: 'summon' },
        stats: { maxHp: 90, speed: 300, damage: 18, attackSpeed: 1.5, armor: 8, critRate: 0.05, critDmg: 0.5, pierce: 0 },
        // 被动砍掉永久跟随炮台：只保留"炮台类词条效果×1.5"，炮台全部改为
        // 技能/词条限时召唤（不再开局自带 2 座无限寿命炮台）
        passive(p: any, _game: any) { p.stats.turretBonus = 1.5; },
        qSkill(p: any, game: any) { game.spawnTurret(p, 1.5); game.particles.hexActivate(p.x, p.y, '#00aaff'); },
        eSkill(p: any, game: any) {
            // 超频指令：自身与场上全部炮台 8 秒内伤害+20%、攻速+150%
            const DUR = 8;
            p.applyBuff('overclock', DUR, { dmgMult: 1.2, atkSpd: 2.5 });
            for (const t of (game.turrets || [])) {
                if (!t.alive) continue;
                t.dmgMult = 1.2;
                t.spdMult = 2.5;
                t._buffTimer = DUR;
                game.particles?.hexActivate?.(t.x, t.y, '#00aaff');
            }
            game.particles.hexActivate(p.x, p.y, '#00aaff');
        },
        ultimate(p: any, game: any) {
            // spawnOrbitTurret(player, count) 内部已按 count 均分角度环绕生成，
            // 之前误写成外层再循环6次、每次count=10，实际会叠出60座炮台（bug）。
            // 技能描述是"召唤6座轨道炮台环绕旋转"，改为单次调用 count=6。
            game.spawnOrbitTurret(p, 6);
            game.particles.hexActivate(p.x, p.y, '#00aaff');
            game.floatingText.spawn(p.x, p.y - 40, '炮台风暴！', '#00aaff', 20, true);
        },
    },
    reik: {
        id: 'reik',
        name: '狂战士·雷克', icon: '⚔️', color: '#ff4444', unlocked: true,
        attackType: 'melee', attackRange: 70, ultCd: 18,
        desc: '每损失10% HP，伤害+8%（最高+80%）；攻击吸血5%',
        skills: { q: '怒冲 — 向前冲刺200距离并击飞沿途敌人', e: '战吼 — 10秒攻速+50%/伤害+30%', r: '死亡意志 — 牺牲半血，4秒无敌+45%吸血+50%攻速' },
        skillIcons: { q: 'speed', e: 'fire', r: 'shield' },
        stats: { maxHp: 200, speed: 300, damage: 40, attackSpeed: 1.8, armor: 20, critRate: 0.1, critDmg: 0.5, pierce: 0 },
        passive(p: any) { p.stats._reikPassive = true; p.stats.lifestealRate = 0.05; },
        qSkill(p: any, game: any) {
            // 冲锋方向 = 角色朝向（不再追鼠标）
            const [nx, ny] = p.getCastDirection?.() ?? Vec.normalize(p.facingX ?? 1, p.facingY ?? 0);
            const startX = p.x, startY = p.y;
            p.x = clamp(p.x + nx * 200, p.radius, CANVAS_W - p.radius);
            p.y = clamp(p.y + ny * 200, p.radius, PLAYFIELD_BOTTOM - p.radius);
            game.screenShake.shake(8, 0.25);
            // 冲锋撕裂：三段双斧弧刃沿实际位移路径推进；旧 mock/兼容环境回落通用剑气。
            if (game.particles.reikChargeCleave) game.particles.reikChargeCleave(startX, startY, p.x, p.y);
            else game.particles.meleeSlash?.(startX, startY, Math.atan2(ny, nx), '#ff4444', 200, 1.35);
            const mult = p.hp / p.stats.maxHp < 0.5 ? 2 : 1;
            const pathDx = p.x - startX, pathDy = p.y - startY;
            const pathLen2 = pathDx * pathDx + pathDy * pathDy || 1;
            for (const e of game.enemies) {
                if (!e.alive) continue;
                // 路径命中：敌人到冲锋线段的最近点在刃宽内即算命中
                // （旧版只判终点80半径圆，从敌人头顶冲过时不造成伤害）
                const t = Math.max(0, Math.min(1, ((e.x - startX) * pathDx + (e.y - startY) * pathDy) / pathLen2));
                const cx = startX + pathDx * t, cy = startY + pathDy * t;
                if (Math.hypot(e.x - cx, e.y - cy) <= e.radius + 28 || Vec.dist(e.x, e.y, p.x, p.y) < 80 + e.radius) {
                    if (p.applyAttackDamage) p.applyAttackDamage(e, game, p.stats.damage * mult);
                    else e.takeDamage(p.stats.damage * mult, p, game);
                    e.knockbackX += (e.x - startX) * 0.3;
                    e.knockbackY += (e.y - startY) * 0.3;
                }
            }
        },
        eSkill(p: any, game: any) {
            p.applyBuff('warcry', 10, { atkSpd: 1.5, dmgMult: 1.3 });
            if (game.particles.reikWarcry) game.particles.reikWarcry(p.x, p.y);
            else game.particles.hexActivate(p.x, p.y, '#ff4444');
        },
        ultimate(p: any, game: any) {
            // 大招改为4秒：无敌 + 45%伤害吸血 + 50%攻速（吸血由
            // PlayerController.applyAttackLifesteal 累加 buffs 的 lifestealRate）
            p.hp *= 0.5;
            p.applyBuff('death_will', 4, { invincible: true, atkSpd: 1.5, lifestealRate: 0.45 });
            if (game.particles.reikDeathWill) game.particles.reikDeathWill(p, 4);
            else game.particles.hexActivate(p.x, p.y, '#ff0000');
            game.floatingText.spawn(p.x, p.y - 50, '死亡意志！', '#ff0000', 22, true);
            game.screenShake.shake(15, 0.5);
        },
    },
    olia: {
        id: 'olia',
        name: '时空行者·奥莉亚', icon: '🕰️', color: '#aaddff', unlocked: true,
        attackType: 'ranged', attackRange: 550, ultCd: 18,
        qCd: 7, // 时空切割 CD 7 秒（文档：英雄重做）
        desc: '时空之力：对敌人额外造成35%真实伤害；释放技能获得20点临时护盾(2秒)',
        skills: {
            q: '时空切割 — 在至多5个敌人间突刺,锁定越少每段伤害越高(30~10),结束回到原位',
            e: '切换形态 — 远程↔攻击形态:近战+30%伤害(附加到所有技能)与+50%攻速',
            r: '时空奇点 — 引导2秒(周围每只怪+10临时护盾)射出能量球,把敌人拉向球心,3秒后爆炸(每拉1只+5%,最高+20%)',
        },
        skillIcons: { q: 'speed', e: 'chaos', r: 'explosion' },
        stats: { maxHp: 100, speed: 320, damage: 20, attackSpeed: 1.0, armor: 20, critRate: 0.10, critDmg: 0.5, pierce: 0 },
        passive(p: any) {
            p.stats.trueDamageRate = 0.35;
            p.stats.castShield = 20; // 释放技能获得20点护盾
        },
        qSkill(p: any, game: any) {
            // 阿尔法突袭式时空切割：锁定最近的至多5个敌人，依次突刺到敌人
            // 脸上攻击（真实位移表现），全程无敌且不可控，结束后回到起点。
            const alive = (game.enemies || []).filter((e: any) => e.alive && !e.dead);
            if (alive.length === 0) return;
            alive.sort((a: any, b: any) => Vec.dist(a.x, a.y, p.x, p.y) - Vec.dist(b.x, b.y, p.x, p.y));
            const targets = alive.slice(0, Math.min(5, alive.length));
            const n = targets.length;
            // 锁定的敌人越少，每段伤害越高：n=1→30 … n=4→15, n=5→10（文档 10~30）
            const dmgPer = (30 - (n - 1) * 5) * (p.formDamageMult ?? 1);
            const startX = p.x, startY = p.y;
            const strike: any = {
                x: p.x, y: p.y, r: 10, alive: true, kind: 'alphaStrike',
                _i: 0, _t: 0.15, owner: p,
            };
            strike.update = (dt: number, g: any) => {
                if (!strike.alive) return;
                // 突刺序列期间：不可选中（无敌）且不可移动（对齐剑圣阿尔法突袭）
                p.applyBuff?.('alpha_strike', 0.3, { invincible: true, noMove: true });
                strike._t -= dt;
                if (strike._t > 0) return;
                strike._t = 0.15;
                // 跳过序列期间已死亡的目标
                while (strike._i < targets.length && (targets[strike._i].dead || !targets[strike._i].alive)) {
                    strike._i++;
                }
                if (strike._i < targets.length) {
                    const e = targets[strike._i++];
                    // 突刺到敌人脸上：贴到目标身位边缘（真实位移，渲染层跟随）
                    const [bx, by] = Vec.normalize(p.x - e.x, p.y - e.y);
                    p.x = e.x + bx * (e.radius + (p.radius ?? 16));
                    p.y = e.y + by * (e.radius + (p.radius ?? 16));
                    g.particles?.meleeSlash?.(e.x, e.y, Math.atan2(by, bx) + Math.PI, p.color, 70, 1.2);
                    if (p.applyAttackDamage) p.applyAttackDamage(e, g, dmgPer);
                    else e.takeDamage(dmgPer, p, g);
                    g.audio?.playSfx?.('skill_q', 0.5);
                } else {
                    // 全部目标处理完：回到突刺起点，结束序列
                    p.x = startX; p.y = startY;
                    strike.alive = false;
                }
            };
            // 序列启动瞬间先给一格无敌，随后由序列对象每帧刷新
            p.applyBuff?.('alpha_strike', 0.3, { invincible: true, noMove: true });
            if (game.turrets) game.turrets.push(strike);
            else (game as any).turrets = [strike];
        },
        eSkill(p: any, game: any) {
            // 切换形态：远程 ↔ 攻击形态（近战伤害+30% 附加到所有技能、攻速+50%）
            // 技能名由 PlayerController 统一显示；形态变化靠攻击方式本身可感知
            const toMelee = p.attackForm !== 'melee';
            p.attackForm = toMelee ? 'melee' : 'ranged';
            p.formDamageMult = toMelee ? 1.3 : 1;
            p.formAtkSpdMult = toMelee ? 1.5 : 1;
            game.particles?.hexActivate?.(p.x, p.y, p.color);
        },
        ultimate(p: any, game: any) {
            // 时空奇点：引导2秒（站定蓄能）→ 能量球飞向敌群 → 每帧把附近敌人
            // 拉向球心聚团，3秒后爆炸。拉扯的怪物越多伤害越高：每只+5%，最高+20%。
            p.applyBuff?.('singularity_channel', 2, { noMove: true });
            game.floatingText?.spawn(p.x, p.y - 55, '聚集时空能量…', p.color, 16, true);
            const orb: any = {
                x: p.x, y: p.y, r: 26, alive: true, kind: 'timeOrb',
                _phase: 'channel', _t: 2, _pull: 0, _tx: 0, _ty: 0,
                _pulled: new Set(), _shieldTick: 0, owner: p,
            };
            orb.update = (dt: number, g: any) => {
                if (!orb.alive) return;
                if (orb._phase === 'channel') {
                    orb._t -= dt;
                    orb.x = p.x; orb.y = p.y - 60; // 悬浮头顶蓄能
                    // 引导期间：周围100码内每只怪提供10点临时护盾（2秒，差额补足不叠加）
                    orb._shieldTick -= dt;
                    if (orb._shieldTick <= 0) {
                        orb._shieldTick = 0.25;
                        let near = 0;
                        for (const e of (g.enemies || [])) {
                            if (e.alive && !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 100) near++;
                        }
                        if (near > 0) {
                            const add = near * 10 - (p.shield ?? 0);
                            if (add > 0) p.grantTempShield?.(add, 2, g);
                        }
                    }
                    if (orb._t <= 0) {
                        const c = g.getEnemyClusterPoint?.();
                        orb._phase = 'active';
                        orb._t = 3;
                        orb._tx = c ? c.x : p.x;
                        orb._ty = c ? c.y : p.y;
                    }
                    return;
                }
                // active：飞向敌群中心悬停（步长钳制避免大步长过冲）
                const dx = orb._tx - orb.x, dy = orb._ty - orb.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 30) {
                    const move = Math.min(260 * dt, Math.max(0, dist - 20));
                    orb.x += (dx / dist) * move;
                    orb.y += (dy / dist) * move;
                }
                orb._t -= dt;
                orb._pull -= dt;
                if (orb._pull <= 0) {
                    orb._pull = 0.25;
                    g.particles?.hexActivate?.(orb.x, orb.y, '#aaddff');
                }
                // 每帧把附近敌人拉向能量球中心聚团（不再是击退式的轻推）
                for (const e of (g.enemies || [])) {
                    if (!e.alive || e.dead) continue;
                    const d = Math.hypot(e.x - orb.x, e.y - orb.y);
                    if (d >= 260) continue;
                    orb._pulled.add(e);
                    if (d > 4) {
                        const pull = Math.min(1, dt * 5);
                        e.x += (orb.x - e.x) * pull;
                        e.y += (orb.y - e.y) * pull;
                    }
                }
                if (orb._t <= 0) {
                    orb.alive = false;
                    // 拉扯的怪物越多伤害越高：每只+5%，最高+20%
                    const pulledCount = orb._pulled.size;
                    const mult = 1 + Math.min(0.20, pulledCount * 0.05);
                    const dmg = p.stats.damage * 2 * (p.formDamageMult ?? 1) * mult;
                    g.particles?.explode?.(orb.x, orb.y, '#aaddff', 120);
                    g.screenShake?.shake?.(12, 0.4);
                    g.audio?.playSfx?.('explode', 0.9);
                    g.floatingText?.spawn(orb.x, orb.y - 40, `时空奇点 ×${mult.toFixed(2)}！`, p.color, 22, true);
                    for (const e of (g.enemies || [])) {
                        if (e.alive && !e.dead && Math.hypot(e.x - orb.x, e.y - orb.y) < 200) {
                            if (p.applyAttackDamage) p.applyAttackDamage(e, g, dmg);
                            else e.takeDamage(dmg, p, g);
                        }
                    }
                }
            };
            // 能量球作为自定义场景对象挂进 turrets（由 GameManager 每帧驱动与渲染）
            if (game.turrets) game.turrets.push(orb);
            else (game as any).turrets = [orb];
        },
    },
    graf: {
        id: 'graf',
        name: '混沌傀儡·格雷夫', icon: '🌀', color: '#cc44ff', unlocked: false,
        unlockHint: '无尽模式撑过第50波',
        attackType: 'ranged', attackRange: 550, ultCd: 15,
        desc: '获得词条时额外随机一个，混沌本质',
        skills: { q: '混沌脉冲 — 随机触发爆炸/传送/吸引/闪电之一', e: '词条重组 — 移除最后词条并随机获得2个新词条', r: '混沌爆发 — 同时触发所有词条的击杀效果' },
        skillIcons: { q: 'chaos', e: 'chaos', r: 'chaos' },
        stats: { maxHp: 150, speed: 310, damage: 28, attackSpeed: 1.8, armor: 15, critRate: 0.1, critDmg: 0.5, pierce: 0 },
        passive(p: any) { p.stats.chaosBonus = true; },
        qSkill(p: any, game: any) {
            const effects = ['explode', 'lightning', 'attract', 'teleport'];
            const ef = Rng.pick(effects);
            if (ef === 'explode') game.spawnExplosion(p, p.x, p.y, p.stats.damage * 3, 120);
            else if (ef === 'teleport') {
                // 传送沿角色朝向闪现260距离（不再跳鼠标位置）
                p.x = clamp(p.x + (p.facingX ?? 1) * 260, 16, CANVAS_W - 16);
                p.y = clamp(p.y + (p.facingY ?? 0) * 260, 16, PLAYFIELD_BOTTOM - 16);
            }
            else if (ef === 'attract') game.attractEnemies(p.x, p.y, 200);
            else if (ef === 'lightning') game.laserSweep(p);
            if (game.particles.grafChaosPulse) game.particles.grafChaosPulse(p.x, p.y, ef);
            else game.particles.hexActivate(p.x, p.y, '#cc44ff');
        },
        eSkill(p: any, game: any) {
            // 对齐 hexblast-py data/characters.py 的 _graf_e：移除最后一个词条后，
            // 立即随机重新装备2个新词条（之前只做了pop，缺了补词条这一半，是移植漏掉的逻辑）。
            const am = game.augmentManager;
            if (am && am.active && am.active.length > 0) {
                am.active.pop();
                const opts = am.rollOptions(2, game.wave, p.charId);
                for (const o of opts) am.equip(o, p, game);
            }
            if (game.particles.grafReforge) game.particles.grafReforge(p.x, p.y);
            else game.particles.hexActivate(p.x, p.y, '#cc44ff');
        },
        ultimate(p: any, game: any) {
            const am = game.augmentManager;
            if (am) am.active.forEach((a: any) => { if (a.onKill) a.onKill(p, { x: p.x, y: p.y, alive: false }, p.stats.damage * 5, game); });
            if (game.particles.grafCataclysm) game.particles.grafCataclysm(p.x, p.y);
            else game.particles.hexActivate(p.x, p.y, '#cc44ff');
            game.screenShake.shake(20, 0.8);
            game.floatingText.spawn(640, 200, '混沌爆发', '#cc44ff', 28, true);
        },
    },
    liana: {
        id: 'liana',
        name: '冰霜狙击手·利亚娜', icon: '🔵', color: '#00ccff', unlocked: false,
        unlockHint: '通关噩梦难度',
        attackType: 'ranged', attackRange: 550, ultCd: 20,
        desc: '低攻速超高单发，冻结要害×2.5伤害',
        skills: { q: '冰晶穿刺 — 发射无限穿透冰弹并冻结命中目标', e: '冰场领域 — 在鼠标位置创造减速冰冻区域', r: '绝对零度 — 冻结全场5秒并对所有敌人造成×3伤害' },
        skillIcons: { q: 'pierce', e: 'ice', r: 'ice' },
        stats: { maxHp: 80, speed: 285, damage: 120, attackSpeed: 0.5, armor: 5, critRate: 0.15, critDmg: 1.0, pierce: 0 },
        passive(p: any) { p.stats.freezeBonus = 2.5; },
        qSkill(p: any, game: any) {
            // 方向性技能沿角色朝向释放（不再追鼠标）
            const [nx, ny] = p.getCastDirection?.() ?? Vec.normalize(p.facingX ?? 1, p.facingY ?? 0);
            const [mx, my] = p.getMuzzlePosition?.() ?? [p.x, p.y];
            const b = game.bulletPool.spawn({ x: mx, y: my, vx: nx * 900, vy: ny * 900, damage: p.stats.damage * 3, radius: 8, color: '#00ccff', pierceLeft: 999, lifeTime: 2, owner: 'player', charKey: p.charId });
            b.onHitCb = (_bullet: any, enemy: any) => {
                enemy.slowMult = 0.3; enemy.frozen = Math.max(enemy.frozen || 0, 0.8);
                game.particles?.coldImpact(enemy.x, enemy.y);
            };
            game.particles.weaponFlash?.(mx, my, nx, ny, 'ice');
            game.particles.hexActivate(p.x, p.y, '#00ccff');
        },
        eSkill(p: any, game: any) {
            // 放置类技能：冰场释放在敌人最密集的位置；场上没有敌人时退回鼠标位置
            const c  = game.getEnemyClusterPoint?.();
            const cx = c ? c.x : game.input.mouse.x;
            const cy = c ? c.y : game.input.mouse.y;
            game.spawnIceZone(cx, cy, 100, 12);
            if (game.particles.frostField) game.particles.frostField(cx, cy, 100);
            else game.particles.hexActivate(cx, cy, '#00ccff');
        },
        ultimate(p: any, game: any) {
            game.freezeAllEnemies(5);
            for (const e of game.enemies) { if (e.alive) e.takeDamage(p.stats.damage * 3, p, game); }
            game.particles.frostField?.(p.x, p.y, 160);
            game.screenShake.shake(12, 0.5);
            game.particles.hexActivate(p.x, p.y, '#00ccff');
            game.floatingText.spawn(640, 200, '绝对零度', '#00ccff', 28, true);
        },
    },
};

/** Ordered array of all characters — use for UI iteration. */
// Object.keys().map() instead of Object.values() — the project's tsconfig
// targets ES2015 and doesn't include the ES2017 lib that Object.values needs.
export const CHARS: CharDef[] = Object.keys(CHARACTERS).map(k => CHARACTERS[k]);

/** Q/E 技能固定冷却秒数（受 cdReduction 缩短；R 大招为各角色 ultCd 充能）。
 *  PlayerController 的实际冷却与选人页介绍弹窗的展示文案共用，避免两处数值漂移。 */
export const SKILL_Q_CD = 4;
export const SKILL_E_CD = 10;

/** 技能描述文案统一为「名称 — 说明」，按首个破折号拆成 [名称, 说明]。 */
export function splitSkillText(text: string): [string, string] {
    const idx = text.indexOf('—');
    if (idx < 0) return [text.trim(), ''];
    return [text.slice(0, idx).trim(), text.slice(idx + 1).trim()];
}
