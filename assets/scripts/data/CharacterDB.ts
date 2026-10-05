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
        desc: '穿甲义肢炮，子弹额外穿透1个敌人，暴击伤害+5%',
        skills: {
            q: '高爆射击 — 朝鼠标方向发射高爆弹，伤害×4，命中或落点半径90爆炸',
            e: '弱点狙击 — 引导1.25秒后随机锁定5个敌人必暴击；目标不足5个全弹+25%伤害，单目标逐发+25%（上限100%）',
            r: '核心过载 — 30发爆裂弹沿自身弹道飞行(2秒后加速,命中或脱靶均半径50爆炸)+8秒伤害×2',
        },
        skillIcons: { q: 'pierce', e: 'bounce', r: 'explosion' },
        stats: { maxHp: 120, speed: 330, damage: 25, attackSpeed: 2, armor: 10, critRate: 0.05, critDmg: 0.5, pierce: 1 },
        passive(p: any) {
            p.stats.pierce += 1;
            p.stats.critDmg = (p.stats.critDmg ?? 0.5) + 0.05;   // 被动:额外+5%暴击伤害
        },
        qSkill(p: any, game: any) {
            const [mx, my] = p.getMuzzlePosition?.() ?? [p.x, p.y];
            // 鼠标模式判定：收到过真实鼠标事件（InputManager.mouse.active）。
            // 不用 sys 的 INPUT_TOUCH 能力探测——原生模拟器/带触屏的桌面机会
            // 误报触控，导致 Q 永远走朝向回退、不朝鼠标射击。
            const mouse = game.input?.mouse;
            let nx: number, ny: number;
            if (mouse?.active) {
                [nx, ny] = Vec.normalize(mouse.x - mx, mouse.y - my);
                if (!nx && !ny) nx = 1;   // 鼠标恰在枪口：保底朝右，避免零速弹
            } else {
                [nx, ny] = p.getCastDirection?.() ?? Vec.normalize(p.facingX ?? 1, p.facingY ?? 0);
            }
            // 高爆弹：不再穿透，命中第一个目标或到达射程终点都会半径 90 爆炸
            game.bulletPool.spawn({
                x: mx, y: my, vx: nx * 700, vy: ny * 700,
                damage: p.stats.damage * 4, radius: 18, color: '#ff8800',
                pierceLeft: 0, lifeTime: 2, owner: 'player', charKey: p.charId,
                isCrit: Rng.chance(p.stats.critRate || 0),   // 技能伤害参与暴击（联动元素暴击）
                explodeOnExpire: true, explodeRadius: 90,
            });
            game.particles.hexActivate(p.x, p.y, '#00ffcc');
            if (game.particles.weaponFlash) game.particles.weaponFlash(mx, my, nx, ny, 'charged');
            else game.particles.explode(mx, my, '#ff8800', 20);
        },
        eSkill(p: any, game: any) {
            // 弱点狙击：引导 1.25 秒（期间定身）后发射 5 发必暴击弱点弹。
            // 引导结束时重新校验目标与自身存活——战场在引导期间可能已变化。
            // 伤害规则：≥5 目标各锁一个基础伤害；不足 5 个全弹 ×1.25；
            // 场上只剩 1 个敌人逐发递增 +25%（×1~×2，上限 +100%）。
            const fire = () => {
                if (!p.alive) return;
                const targets = ((game.enemies || []) as any[]).filter(e =>
                    e.alive && !e.dead && !e.invisible && !((e.mechSkyT ?? 0) > 0));
                if (!targets.length) return;
                const [mx, my] = p.getMuzzlePosition?.() ?? [p.x, p.y];
                const picks: any[] = [];
                if (targets.length >= 5) {
                    const pool = [...targets];
                    while (picks.length < 5) picks.push(pool.splice(Rng.int(0, pool.length - 1), 1)[0]);
                } else {
                    for (let i = 0; i < 5; i++) picks.push(Rng.pick(targets));
                }
                const solo = targets.length === 1;
                picks.forEach((target, i) => {
                    const mult = solo
                        ? 1 + Math.min(1, 0.25 * i)
                        : (targets.length < 5 ? 1.25 : 1);
                    const a = Math.atan2(target.y - my, target.x - mx);
                    game.bulletPool.spawn({
                        x: mx, y: my, vx: Math.cos(a) * 650, vy: Math.sin(a) * 650,
                        damage: p.stats.damage * mult, radius: 6, color: '#ffe066',
                        pierceLeft: 0, lifeTime: 2, owner: 'player', charKey: p.charId,
                        isCrit: true,                        // 弱点射击必定暴击
                        homing: true, _homingTarget: target, // 预锁定目标，确保命中
                        keepLock: true,   // 目标中途死亡不重锁：一个目标只吃一枚弱点弹
                    });
                });
                game.audio?.playSfx?.('skill_e', 0.8);
                game.floatingText?.spawn?.(p.x, p.y - 60, '弱点狙击！', '#ffe066', 18, true);
            };
            const targets = ((game.enemies || []) as any[]).filter(e =>
                e.alive && !e.dead && !e.invisible && !((e.mechSkyT ?? 0) > 0));
            if (!targets.length) {
                game.floatingText?.spawn?.(p.x, p.y - 60, '弱点狙击：无目标', '#9fb4c8', 14, true);
                return;
            }
            p.applyBuff('weakpoint_aim', 1.25, { noMove: true });   // 引导期间定身
            game.particles.hexActivate(p.x, p.y, '#ffe066');
            game.floatingText?.spawn?.(p.x, p.y - 60, '弱点狙击引导…', '#ffe066', 16, true);
            if (game.after) game.after(1.25, fire);
            else fire();   // 桩环境无延时器时立即发射（保持可测）
        },
        ultimate(p: any, game: any) {
            // 炮弹沿自身发射弹道直飞、不追踪（2026-09-21 玩家反馈：360° 散射+追踪
            // 转向速率跟不上弹速，背向目标的炮弹到过期都拐不回来，观感"锁不上Boss"）。
            // 2 秒后弹速翻倍加速；命中(穿透耗尽)或脱靶(到期/出界)时每个炮弹
            // 都会造成半径 50 的爆炸伤害。
            const [mx, my] = p.getMuzzlePosition?.() ?? [p.x, p.y];
            for (let i = 0; i < 30; i++) {
                const a = Rng.float(0, Math.PI * 2);
                game.bulletPool.spawn({
                    x: mx, y: my, vx: Math.cos(a) * 500, vy: Math.sin(a) * 500,
                    damage: p.stats.damage * 2, radius: 7, color: '#ff4400',
                    pierceLeft: 2, lifeTime: 4, owner: 'player', charKey: p.charId,
                    isCrit: Rng.chance(p.stats.critRate || 0),   // 技能暴击联动元素暴击
                    speedUpAfter: 2, speedUpMult: 2, // 2秒后加速到 1000 码/秒
                    explodeOnExpire: true, explodeRadius: 50, // 最终每个炮弹半径50爆炸
                });
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
        // 持鞭近战：攻击距离=鞭长170（狂战士斧70 / 延展力场词条可继续加宽）
        attackType: 'melee', attackRange: 170, ultCd: 15,
        desc: '近战鞭击：普攻二段(75%伤害)在0.5秒后落下；洞察：每2.5秒标记周围500码怪物，命中消耗标记追加20%穿甲伤害',
        skills: {
            q: '混沌脉冲 — 朝鼠标位置甩出混沌长鞭，形成长200/宽100码的混沌间隙，存在3秒，每秒造成20点伤害',
            e: '混沌冲击 — 眩晕周围450码的所有怪物2秒',
            r: '混沌爆发 — 向四周发射震荡波造成30点伤害，并同时触发所有已装备词条的击杀效果；携带死神之瞳时小怪直接秒杀、Boss受600点固定伤害',
        },
        skillIcons: { q: 'chaos', e: 'lightning', r: 'explosion' },
        stats: { maxHp: 150, speed: 310, damage: 30, attackSpeed: 0.8, armor: 15, critRate: 0.1, critDmg: 0.5, pierce: 0 },
        passive(p: any) {
            // 洞察：标记计时在 PlayerController.tick 驱动，命中消耗见 consumeInsightMark
            p.stats.insightMark = true;
            // 荆棘刺鞭：普攻二段在子弹命中链路(BulletController)/近战命中(_meleeAttack)结算
            p.stats.thornWhip = true;
        },
        qSkill(p: any, game: any) {
            // 朝鼠标目标位置甩出长鞭：沿鞭向形成长200/宽100码的混沌间隙（锚定
            // 施放时的鞭根位置，不随玩家移动），存在3秒，每秒对间隙内怪物造成
            // 20点伤害（鞭子落地瞬间结算第一跳）。走 applyAttackDamage 让
            // 洞察标记在间隙持续伤害中同样可被消耗。
            const mouse = game.input?.mouse;
            let nx: number, ny: number;
            if (mouse?.active) {
                [nx, ny] = Vec.normalize(mouse.x - p.x, mouse.y - p.y);
                if (!nx && !ny) nx = 1;
            } else {
                [nx, ny] = p.getCastDirection?.() ?? Vec.normalize(p.facingX ?? 1, p.facingY ?? 0);
            }
            const gap: any = {
                x: p.x, y: p.y, r: 26, alive: true, kind: 'chaosGap',
                dirX: nx, dirY: ny, len: 200, halfW: 50,
                _t: 3, _tick: 0, owner: p,
            };
            gap.update = (dt: number, g: any) => {
                gap._t -= dt;
                if (gap._t <= 0) { gap.alive = false; return; }   // 3秒寿命内恰好3跳(0/1/2秒)
                gap._tick -= dt;
                if (gap._tick <= 0) {
                    gap._tick = 1;
                    const px = -gap.dirY, py = gap.dirX;
                    for (const e of (g.enemies || [])) {
                        if (!e.alive || e.dead) continue;
                        const dx = e.x - gap.x, dy = e.y - gap.y;
                        const along = dx * gap.dirX + dy * gap.dirY;
                        if (along < -e.radius || along > gap.len + e.radius) continue;
                        if (Math.abs(dx * px + dy * py) > gap.halfW + e.radius) continue;
                        if (p.applyAttackDamage) p.applyAttackDamage(e, g, 20);
                        else e.takeDamage(20, p, g);
                    }
                }
            };
            if (game.turrets) game.turrets.push(gap);
            else game.turrets = [gap];
            if (game.particles.grafWhipLash) game.particles.grafWhipLash(p.x, p.y, nx, ny);
            else game.particles.hexActivate(p.x, p.y, '#cc44ff');
        },
        eSkill(p: any, game: any) {
            // 混沌冲击：眩晕周围450码的所有怪物2秒（Boss自有机动不受 stunned 影响）
            let stunned = 0;
            for (const e of (game.enemies || [])) {
                if (!e.alive || e.dead) continue;
                if (Vec.dist(e.x, e.y, p.x, p.y) <= 450) {
                    e.stunned = Math.max(e.stunned || 0, 2);
                    stunned++;
                }
            }
            if (game.particles.grafChaosStun) game.particles.grafChaosStun(p.x, p.y);
            else game.particles.hexActivate(p.x, p.y, '#cc44ff');
            game.screenShake?.shake?.(10, 0.35);
            if (stunned > 0) game.floatingText?.spawn?.(p.x, p.y - 50, `眩晕×${stunned}`, '#cc44ff', 16, true);
        },
        ultimate(p: any, game: any) {
            // 混沌爆发：以自身为中心向四周发射震荡波（波前扩散、逐个命中，
            // 造成30点伤害），同时触发所有已装备词条的击杀效果（统一走
            // dispatchKill 分发，与怪物死亡路径共用同一入口）。
            // 死神之瞳(hex06)联动：震荡波转化为处决——小怪直接秒杀，
            // Boss受600点固定伤害（结算方式对齐词条本体 onHit 的 takeDamage）。
            const reaperEye = !!game.augmentManager?.ownedOf?.('hex06');
            const wave: any = {
                x: p.x, y: p.y, r: 10, alive: true, kind: 'chaosBurst',
                _speed: 900, _maxR: 500, _hit: new Set(), owner: p,
            };
            wave.update = (dt: number, g: any) => {
                // 波前半径钳制在上限内：单帧大步长不会越过500误伤波及圈外目标
                wave.r = Math.min(wave._maxR, wave.r + wave._speed * dt);
                for (const e of (g.enemies || [])) {
                    if (!e.alive || e.dead || wave._hit.has(e)) continue;
                    if (Math.hypot(e.x - wave.x, e.y - wave.y) <= wave.r + e.radius) {
                        wave._hit.add(e);
                        if (reaperEye) {
                            if (e.isBoss) {
                                e.takeDamage(600, p, g);
                                g.floatingText?.spawn?.(e.x, e.y - 30, '死神·600', '#ff5ad8', 16, true);
                            } else {
                                e.takeDamage(1e9, p, g);
                                g.floatingText?.spawn?.(e.x, e.y - 30, '死神·秒杀！', '#ff5ad8', 18, true);
                            }
                            g.particles?.hexActivate?.(e.x, e.y, '#ff5ad8');
                        } else if (p.applyAttackDamage) p.applyAttackDamage(e, g, 30);
                        else e.takeDamage(30, p, g);
                    }
                }
                if (wave.r >= wave._maxR) wave.alive = false;
            };
            if (game.turrets) game.turrets.push(wave);
            else game.turrets = [wave];
            game.augmentManager?.dispatchKill?.(p, { x: p.x, y: p.y, alive: false }, p.stats.damage * 5, game);
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
            const b = game.bulletPool.spawn({ x: mx, y: my, vx: nx * 900, vy: ny * 900, damage: p.stats.damage * 3, radius: 8, color: '#00ccff', pierceLeft: 999, lifeTime: 2, owner: 'player', charKey: p.charId, isCrit: Rng.chance(p.stats.critRate || 0) });
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
    via: {
        id: 'via',
        name: '盗神·薇娅', icon: '🎭', color: '#f0c04a', unlocked: true,
        attackType: 'ranged', attackRange: 550, ultCd: 35, qCd: 15, eCd: 10,
        desc: '失主还没发现：被盗技能的怪物下次施法只空放动作，并失措2秒（无法移动和攻击）',
        skills: {
            q: '窃神之手 — 盗取鼠标选中500码内怪物的技能（一/二/三技能概率30%/30%/10%），得一次性赃技；再按Q释放赃技后Q才开始冷却；失败恢复5点生命并立即冷却',
            e: '这招我收下了 — 截取周围150码敌方普攻至多5份（弹幕保留特征/近战化斩击/范围化爆核），再按E向怪群释放；超过6秒自动释放，全部释放后才开始冷却',
            r: '此刻，归我所有 — 展开450码掠夺领域5秒：夺取敌方子弹/陷阱/召唤物与近战攻击（化为残影反击），结束时释放收账冲击，造成30+夺取次数×10点伤害（上限150）',
        },
        skillIcons: { q: 'gold', e: 'bounce', r: 'chaos' },
        stats: { maxHp: 110, speed: 330, damage: 20, attackSpeed: 1.2, armor: 5, critRate: 0.1, critDmg: 0.5, pierce: 0 },
        passive(p: any) { p.stats.klepto = true; },
        qSkill(p: any, game: any) {
            // 双模式：持有赃技→释放（一次性，之后Q才开始冷却）；否则→窃取
            const loaded = p.stats._stolenSkill;
            if (loaded) {
                const pool = game.bulletPool ?? game.bullets;
                if (loaded.kind === 'volley') {
                    // 一技能：三发追踪弹，各带赃技伤害
                    const targets = (game.enemies || []).filter((e: any) => e.alive && !e.dead && !e.invisible)
                        .sort((a: any, b: any) => Vec.dist(a.x, a.y, p.x, p.y) - Vec.dist(b.x, b.y, p.x, p.y))
                        .slice(0, 3);
                    for (const t of targets) {
                        const a = Math.atan2(t.y - p.y, t.x - p.x);
                        pool?.spawn?.({ x: p.x, y: p.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420,
                            damage: loaded.dmg, radius: 8, color: loaded.color, owner: 'player',
                            lifeTime: 2.5, charKey: 'via', homing: true, _homingTarget: t, pierceLeft: 0 });
                    }
                } else if (loaded.kind === 'nova') {
                    // 二技能：八向弹幕
                    for (let i = 0; i < 8; i++) {
                        const a = (i / 8) * Math.PI * 2;
                        pool?.spawn?.({ x: p.x, y: p.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380,
                            damage: loaded.dmg, radius: 7, color: loaded.color, owner: 'player',
                            lifeTime: 2, charKey: 'via', pierceLeft: 0 });
                    }
                } else {
                    // 三技能（杀招）：在敌群中心引爆
                    const c = game.getEnemyClusterPoint?.() ?? game.getNearestEnemy?.(p.x, p.y);
                    if (c) game.spawnExplosion?.(p, c.x, c.y, loaded.dmg, 130, game);
                }
                game.announceSteal?.(`赃技·${loaded.name}！`);
                game.particles.hexActivate(p.x, p.y, '#f0c04a');
                p.stats._stolenSkill = undefined;
                p.stats.deferQcd = false;
                // 使用赃技后 Q 才开始冷却
                p._qCd = (p._charDef?.qCd ?? 15) * (1 - (p.stats.cdReduction || 0));
                return;
            }
            // 窃取模式：鼠标选中（距鼠标最近且在玩家500码内）的怪物
            const mouse = game.input?.mouse;
            const mx = mouse?.x ?? p.x, my = mouse?.y ?? p.y;
            const cands = (game.enemies || []).filter((e: any) =>
                e.alive && !e.dead && !e.invisible && Vec.dist(e.x, e.y, p.x, p.y) <= 500);
            if (!cands.length) {
                p.heal(5, false);
                game.announceSteal?.('窃取失败：500码内无可窃目标，恢复5点生命');
                p.stats.deferQcd = false;
                return;   // PlayerController 按常规启动 Q 冷却
            }
            cands.sort((a: any, b: any) =>
                Vec.dist(a.x, a.y, mx, my) - Vec.dist(b.x, b.y, mx, my));
            const target = cands[0];
            const slots = target.isBoss || target.isElite ? 3 : 2;
            const roll = Rng.float(0, 1);
            const slot = roll < 0.3 ? 1 : roll < 0.6 ? 2 : roll < 0.7 ? 3 : 0;   // 30/30/10，其余失败
            if (!slot || slot > slots) {
                p.heal(5, false);
                game.announceSteal?.('窃取失败：对方捂紧了技能，恢复5点生命');
                game.particles.hexActivate(target.x, target.y, '#8a8f9a');
                p.stats.deferQcd = false;
                return;
            }
            // 成功：怪物标记失措被动 + 获得一次性赃技（Q 挂起冷却直到赃技被使用）
            target._skillStolen = true;
            p.stats._stolenSkill = {
                name: `${target.label || target.type || '怪物'}·${['普攻', '特技', '杀招'][slot - 1]}`,
                kind: (['volley', 'nova', 'nuke'] as const)[slot - 1],
                dmg: slot === 3
                    ? Math.max(60, Math.round((target.maxHp || 100) * (target.isBoss ? 0.02 : 0.06)))
                    : Math.max(15, Math.round((target.damage || 10) * (slot === 1 ? 2 : 1.2))),
                color: target.glowColor || target.color || '#ff9d5c',
            };
            p.stats.deferQcd = true;
            game.announceSteal?.(`窃取成功：${p.stats._stolenSkill.name}（再按Q释放）`);
            game.particles.hexActivate(target.x, target.y, '#f0c04a');
        },
        eSkill(p: any, game: any) {
            // 双模式：无截取状态→进入截取（E冷却挂起）；有→立即释放全部
            if (!p.stats._intercept) {
                p.stats._intercept = { stored: [], t: 6 };
                p.stats.deferEcd = true;
                game.particles.hexActivate(p.x, p.y, '#f0c04a');
            } else {
                fireStoredAttacks(p, game);
            }
        },
        ultimate(p: any, game: any) {
            // 掠夺领域：锚定施放位置（450码/5秒）。子弹与近战的截取在
            // BulletController/EnemyBase 挂点读取 _plunderDomain；陷阱/召唤物
            // 由领域自身周期性没收（计入夺取次数）。结束时释放收账冲击。
            const domain: any = {
                x: p.x, y: p.y, r: 26, alive: true, kind: 'plunderDomain',
                _t: 5, _captures: 0, _confiscT: 0, _maxR: 450, owner: p,
            };
            domain.update = (dt: number, g: any) => {
                domain._t -= dt;
                if (domain._t <= 0) {
                    domain.alive = false;
                    if ((g as any)._plunderDomain === domain) (g as any)._plunderDomain = null;
                    // 收账冲击：30 + 夺取次数×10（上限150），扩散波前逐个结算
                    const dmg = Math.min(150, 30 + domain._captures * 10);
                    const wave: any = {
                        x: domain.x, y: domain.y, r: 10, alive: true, kind: 'debtWave',
                        _speed: 900, _maxR: 450, _hit: new Set(), _dmg: dmg, owner: p,
                    };
                    wave.update = (wdt: number, wg: any) => {
                        wave.r = Math.min(wave._maxR, wave.r + wave._speed * wdt);
                        for (const e of (wg.enemies || [])) {
                            if (!e.alive || e.dead || wave._hit.has(e)) continue;
                            if (Math.hypot(e.x - wave.x, e.y - wave.y) <= wave.r + e.radius) {
                                wave._hit.add(e);
                                if (p.applyAttackDamage) p.applyAttackDamage(e, wg, wave._dmg);
                                else e.takeDamage(wave._dmg, p, wg);
                            }
                        }
                        if (wave.r >= wave._maxR) wave.alive = false;
                    };
                    if (g.turrets) g.turrets.push(wave); else g.turrets = [wave];
                    game.floatingText.spawn(640, 200, `收账冲击 ${dmg}`, '#f0c04a', 26, true);
                    game.screenShake.shake(15, 0.5);
                    return;
                }
                // 没收领域内的敌方陷阱/召唤物（0.4秒节流，计入夺取次数）
                domain._confiscT -= dt;
                if (domain._confiscT > 0) return;
                domain._confiscT = 0.4;
                for (const t of (g.turrets || [])) {
                    if (!t.alive || t === domain) continue;
                    if (t.owner && (t.owner.isBoss || t.owner.isElite)
                        && Vec.dist(t.x, t.y, domain.x, domain.y) <= domain._maxR) {
                        t.alive = false;
                        domain._captures++;
                        g.particles?.hexActivate?.(t.x, t.y, '#f0c04a');
                    }
                }
                for (const arrName of ['_railSaws', '_pillars']) {
                    const arr = (g as any)[arrName];
                    for (let i = (arr || []).length - 1; i >= 0; i--) {
                        const o = arr[i];
                        if (Vec.dist(o.x ?? domain.x, o.y ?? domain.y, domain.x, domain.y) <= domain._maxR) {
                            arr.splice(i, 1);
                            domain._captures++;
                            g.particles?.hexActivate?.(o.x ?? domain.x, o.y ?? domain.y, '#f0c04a');
                        }
                    }
                }
            };
            if (game.turrets) game.turrets.push(domain); else game.turrets = [domain];
            (game as any)._plunderDomain = domain;
            game.particles.hexActivate(p.x, p.y, '#f0c04a');
            game.screenShake.shake(10, 0.4);
        },
    },
    mortis: {
        id: 'mortis',
        name: '亡灵法师·莫提斯', icon: '💀', color: '#a8e06e', unlocked: true,
        attackType: 'ranged', attackRange: 550, ultCd: 30, qCd: 3, eCd: 10,
        desc: '骸骨军团：600码内死亡的怪物25%化为仆从(至多8具)挡刀；灵魂收割：击杀吸1层灵魂，每层技能伤害+1%(上限60层)，每满20层E冷却-1秒，被怪物命中损失2层',
        skills: {
            q: '白骨之矛 — 向鼠标方向刺出白骨长矛，穿透700码直线上所有怪物，造成45点伤害并减速30%持续1.5秒；每命中1个怪物吸取1个灵魂',
            e: '腐雾领域 — 在鼠标位置生成半径350码的死亡腐雾，存在5秒：雾内怪物每秒受12点伤害并减速20%；骸骨仆从在雾内攻速+50%且每秒回复5点生命',
            r: '亡者天灾 — 引爆场上所有骸骨仆从，每具造成一次半径300码的尸爆(60点伤害，可叠加)，随后立即从周围复苏8具仆从(可超上限，持续15秒)，并触发所有已装备词条的击杀效果',
        },
        skillIcons: { q: 'pierce', e: 'poison', r: 'summon' },
        stats: { maxHp: 100, speed: 300, damage: 45, attackSpeed: 0.6, armor: 5, critRate: 0.15, critDmg: 0.6, pierce: 0 },
        passive(p: any) {
            p.stats.skeletonRaiser = true;
            p.stats.soulHarvest = true;
            p.stats._souls = 0;
            p.stats.eCdFlatReduction = 0;
        },
        qSkill(p: any, game: any) {
            // 白骨之矛：鼠标/朝向方向的穿透长矛，命中减速30%并各吸1个灵魂
            const mouse = game.input?.mouse;
            let nx: number, ny: number;
            if (mouse?.active) {
                [nx, ny] = Vec.normalize(mouse.x - p.x, mouse.y - p.y);
                if (!nx && !ny) nx = 1;
            } else {
                [nx, ny] = p.getCastDirection?.() ?? Vec.normalize(p.facingX ?? 1, p.facingY ?? 0);
            }
            const [mx, my] = p.getMuzzlePosition?.() ?? [p.x, p.y];
            const b = game.bulletPool.spawn({
                x: mx, y: my, vx: nx * 800, vy: ny * 800,
                damage: 45 * soulMult(p), radius: 9, color: '#e8e2d0',
                pierceLeft: 999, lifeTime: 0.9, owner: 'player', charKey: p.charId,
                isCrit: Rng.chance(p.stats.critRate || 0),
            });
            b.onHitCb = (_bullet: any, enemy: any) => {
                enemy.slowMult = Math.min(enemy.slowMult ?? 1, 0.7);
                enemy._slowTimer = Math.max(enemy._slowTimer ?? 0, 1.5);
                game.grantSoul?.(p);
            };
            game.particles.hexActivate(mx, my, '#e8e2d0');
        },
        eSkill(p: any, game: any) {
            // 腐雾领域：鼠标位置（无鼠标回落敌群中心），雾内怪物持续掉血减速
            const mouse = game.input?.mouse;
            const cluster = game.getEnemyClusterPoint?.();
            const fx = mouse?.active ? mouse.x : (cluster?.x ?? p.x);
            const fy = mouse?.active ? mouse.y : (cluster?.y ?? p.y);
            const fog: any = {
                x: fx, y: fy, r: 350, alive: true, kind: 'rotFog', _t: 5, _tick: 0, owner: p,
            };
            fog.update = (dt: number, g: any) => {
                fog._t -= dt;
                if (fog._t <= 0) { fog.alive = false; return; }
                fog._tick -= dt;
                if (fog._tick > 0) return;
                fog._tick = 1;
                const dmg = 12 * soulMult(p);
                for (const e of (g.enemies || [])) {
                    if (!e.alive || e.dead) continue;
                    if (Vec.dist(e.x, e.y, fog.x, fog.y) > fog.r) continue;
                    if (p.applyAttackDamage) p.applyAttackDamage(e, g, dmg);
                    else e.takeDamage(dmg, p, g);
                    e.slowMult = Math.min(e.slowMult ?? 1, 0.8);
                    e._slowTimer = Math.max(e._slowTimer ?? 0, 1.2);
                }
            };
            if (game.turrets) game.turrets.push(fog); else game.turrets = [fog];
            game.particles.hexActivate(fx, fy, '#a8e06e');
        },
        ultimate(p: any, game: any) {
            // 亡者天灾：引爆所有骸骨仆从（每具300码尸爆60点，可叠加），
            // 随后立即复苏8具（可超上限，持续15秒），并触发全部词条击杀效果
            const bones = (game.turrets || []).filter((t: any) => t.kind === 'skeleton' && t.alive);
            for (const sk of bones) {
                sk.alive = false;
                game.spawnExplosion?.(p, sk.x, sk.y, 60 * soulMult(p), 300, game);
            }
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                spawnSkeletonServant(game, p, p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60, 15, true);
            }
            game.augmentManager?.dispatchKill?.(p, { x: p.x, y: p.y, alive: false }, p.stats.damage * 3, game);
            game.particles.hexActivate(p.x, p.y, '#a8e06e');
            game.screenShake.shake(18, 0.7);
            game.floatingText.spawn(640, 200, '亡者天灾！', '#a8e06e', 28, true);
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

// ── 亡灵法师·莫提斯（mortis）共享辅助 ──────────────────────

/** 灵魂层数的技能伤害乘区：1 + min(60,层数)×1%。 */
export function soulMult(p: any): number {
    return 1 + Math.min(60, p?.stats?._souls || 0) * 0.01;
}

/**
 * 骸骨仆从：HP50/移速350/伤害15/攻速1.0，存在 duration 秒。
 * 追击最近怪物（伤害走 takeDamage 正常结算→击杀计灵魂/词条）；
 * 围堵它的敌人每秒造成接触磨损（让 HP 有意义）；身处腐雾内攻速+50%、
 * 每秒回5血。noCap=true（亡者天灾复苏的）不计入8具上限。
 */
export function spawnSkeletonServant(game: any, player: any, x: number, y: number,
                                     duration = 25, noCap = false): any {
    const sk: any = {
        x, y, r: 12, alive: true, kind: 'skeleton',
        hp: 50, maxHp: 50, _t: duration, _atkCd: 0, _frenzyT: 0, _noCap: noCap, owner: player,
    };
    sk.update = (dt: number, g: any) => {
        sk._t -= dt;
        if (sk._t <= 0 || sk.hp <= 0 || !player.alive) { sk.alive = false; return; }
        sk._atkCd = Math.max(0, sk._atkCd - dt);
        sk._frenzyT = Math.max(0, sk._frenzyT - dt);
        // 腐雾领域加成：攻速+50% + 每秒回5点
        for (const t of (g.turrets || [])) {
            if (t.kind === 'rotFog' && t.alive && Vec.dist(sk.x, sk.y, t.x, t.y) <= t.r) {
                sk._frenzyT = Math.max(sk._frenzyT, 0.5);
                sk.hp = Math.min(sk.maxHp, sk.hp + 5 * dt);
                break;
            }
        }
        // 围堵磨损：邻接敌人按攻击力累计接触伤害（系数0.35，围3只约3秒磨掉一具）
        let wear = 0;
        for (const e of (g.enemies || [])) {
            if (e.alive && !e.dead && Vec.dist(e.x, e.y, sk.x, sk.y) <= (e.radius ?? 12) + sk.r + 6) {
                wear += e.damage || 10;
            }
        }
        if (wear > 0) sk.hp -= wear * 0.35 * dt;
        // 追击最近怪物并攻击
        let best: any = null, bd = 1e9;
        for (const e of (g.enemies || [])) {
            if (!e.alive || e.dead || e.invisible) continue;
            const d = Vec.dist(e.x, e.y, sk.x, sk.y);
            if (d < bd) { bd = d; best = e; }
        }
        if (best) {
            if (bd > (best.radius ?? 12) + sk.r + 14) {
                const [nx, ny] = Vec.normalize(best.x - sk.x, best.y - sk.y);
                sk.x = clamp(sk.x + nx * 350 * dt, 16, CANVAS_W - 16);
                sk.y = clamp(sk.y + ny * 350 * dt, 16, PLAYFIELD_BOTTOM - 16);
            } else if (sk._atkCd <= 0) {
                sk._atkCd = 1 / (1.0 * (sk._frenzyT > 0 ? 1.5 : 1));
                best.takeDamage(15, player, g);
                g.particles?.hit?.(best.x, best.y, '#a8e06e');
            }
        }
    };
    (game.turrets || (game.turrets = [])).push(sk);
    return sk;
}

// ── 盗神·薇娅（via）共享辅助 ───────────────────────────────

/**
 * 被动·失主还没发现：被盗技能的怪物下次施法只空放动作——消耗标记并
 * 陷入2秒失措（stunned 跳过整个AI：无法移动和攻击）。
 * 返回 true 表示本次施法被失措取代（调用方跳过原有攻击结算）。
 */
export function kleptoStagger(e: any, game: any): boolean {
    if (!e?._skillStolen) return false;
    e._skillStolen = false;
    e.stunned = Math.max(e.stunned || 0, 2);
    game?.particles?.hexActivate?.(e.x, e.y, '#f0c04a');
    game?.floatingText?.spawn?.(e.x, e.y - 30, '失措！', '#f0c04a', 13, false);
    return true;
}

/** 腐雾/范围型敌人的攻击在截取时转化为爆炸核心，其余近战化为斩击。 */
const KLEPTO_AOE_TYPES = ['acid_sac', 'ember_acolyte', 'blast_tick'];

/**
 * E 这招我收下了 / R 此刻归我所有：在敌人出手前截获其攻击。
 *  · melee：R掠夺领域内化为残影反击附近怪物（计入夺取次数）；
 *  · ranged/melee：E截取状态150码内收入囊中（近战→斩击，范围→爆核）。
 * 返回 true 表示攻击已被收走（调用方跳过本次出手）。
 */
export function kleptoCaptureAttack(e: any, player: any, game: any, kind: 'ranged' | 'melee'): boolean {
    // R 掠夺领域：近战攻击转化为残影，反击附近怪物
    const domain = (game as any)?._plunderDomain;
    if (domain?.alive && kind === 'melee' && Vec.dist(e.x, e.y, domain.x, domain.y) <= domain._maxR) {
        domain._captures++;
        game?.particles?.meleeSlash?.(e.x, e.y, Rng.float(0, Math.PI * 2), '#f0c04a', 60, 1.1);
        const victims = (game?.enemies || []).filter((t: any) =>
            t !== e && t.alive && !t.dead && Vec.dist(t.x, t.y, e.x, e.y) <= 140);
        if (victims.length) (Rng.pick(victims) as any).takeDamage(e.damage || 10, player, game);
        return true;
    }
    // E 截取状态：150码内普攻收入囊中（至多5份）
    const icpt = player?.stats?._intercept;
    if (icpt && icpt.stored.length < 5 && Vec.dist(e.x, e.y, player.x, player.y) <= 150) {
        const aoe = KLEPTO_AOE_TYPES.indexOf(e.type) >= 0;
        icpt.stored.push({
            kind: kind === 'melee' ? (aoe ? 'core' : 'slash') : (aoe ? 'core' : 'bullet'),
            dmg: e.damage || 10,
            color: e.glowColor || e.color || '#ff9d5c',
        });
        game?.particles?.hexActivate?.(e.x, e.y, '#f0c04a');
        return true;
    }
    return false;
}

/**
 * 敌方子弹的截取/掠夺（BulletController 敌弹循环逐发调用）：
 *  · E截取状态150码内：收入囊中（保留伤害/颜色特征）→ 'captured'（子弹销毁）；
 *  · R掠夺领域内：夺取控制权——就地折转为射向最近怪物的玩家弹
 *    （保留伤害/速度/半径等原有特征）→ 'plundered'（原敌弹销毁）。
 * 返回 'pass' 表示不处理。
 */
export function kleptoCaptureBullet(b: any, player: any, game: any): 'pass' | 'captured' | 'plundered' {
    const icpt = player?.stats?._intercept;
    if (icpt && icpt.stored.length < 5 && Vec.dist(b.x, b.y, player.x, player.y) <= 150) {
        icpt.stored.push({ kind: 'bullet', dmg: b.damage || 10, color: b.color || '#ff9d5c' });
        game?.particles?.hexActivate?.(b.x, b.y, '#f0c04a');
        return 'captured';
    }
    const domain = (game as any)?._plunderDomain;
    if (domain?.alive && Vec.dist(b.x, b.y, domain.x, domain.y) <= domain._maxR) {
        domain._captures++;
        let best: any = null, bd = 1e9;
        for (const e of (game?.enemies || [])) {
            if (!e.alive || e.dead) continue;
            const d = Vec.dist(e.x, e.y, b.x, b.y);
            if (d < bd) { bd = d; best = e; }
        }
        const spd = Math.max(120, Math.hypot(b.vx, b.vy));
        const a = best ? Math.atan2(best.y - b.y, best.x - b.x) : Rng.float(0, Math.PI * 2);
        const pool = game.bulletPool ?? game.bullets;
        pool?.spawn?.({
            x: b.x, y: b.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            damage: b.damage || 10, radius: b.radius || 6, color: '#f0c04a',
            owner: 'player', lifeTime: 2.5, pierceLeft: 0, charKey: 'via',
        });
        game?.particles?.hexActivate?.(b.x, b.y, '#f0c04a');
        return 'plundered';
    }
    return 'pass';
}

/**
 * 释放截取的全部攻击（E再按 / 6秒超时共用）：
 * 子弹保留特征射向最近怪物；斩击对近身怪结算；爆核在敌群中心引爆。
 * 释放完成后才启动 E 冷却（deferEcd 解除）。
 */
export function fireStoredAttacks(p: any, game: any): void {
    const icpt = p.stats?._intercept;
    if (!icpt) return;
    const pool = game.bulletPool ?? game.bullets;
    const target = game.getNearestEnemy?.(p.x, p.y);
    for (const s of icpt.stored) {
        if (s.kind === 'bullet') {
            const a = target ? Math.atan2(target.y - p.y, target.x - p.x)
                : Math.atan2(p.facingY ?? 0, p.facingX ?? 1);
            pool?.spawn?.({ x: p.x, y: p.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420,
                damage: s.dmg, radius: 6, color: s.color, owner: 'player', lifeTime: 2.2,
                pierceLeft: 0, charKey: 'via' });
        } else if (s.kind === 'slash') {
            const v = target && Vec.dist(target.x, target.y, p.x, p.y) <= 180 ? target : null;
            if (v) {
                v.takeDamage(s.dmg, p, game);
                game.particles?.meleeSlash?.(v.x, v.y, Rng.float(0, Math.PI * 2), '#f0c04a', 70, 1.2);
            }
        } else {   // core：范围攻击转化为爆炸核心，在敌群中心引爆
            const c = game.getEnemyClusterPoint?.() ?? target;
            if (c) game.spawnExplosion?.(p, c.x, c.y, s.dmg, 110, game);
        }
    }
    icpt.stored.length = 0;
    p.stats._intercept = undefined;
    p.stats.deferEcd = false;
    // 全部释放后才开始冷却
    p._eCd = Math.max(1, ((p._charDef?.eCd ?? SKILL_E_CD) - (p.stats.eCdFlatReduction || 0))
        * (1 - (p.stats.cdReduction || 0)));
}
