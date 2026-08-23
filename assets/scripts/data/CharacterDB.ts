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
            const [nx, ny] = Vec.normalize(p.facingX ?? 1, p.facingY ?? 0);
            game.bulletPool.spawn({ x: p.x, y: p.y, vx: nx * 700, vy: ny * 700, damage: p.stats.damage * 4, radius: 12, color: '#ff8800', pierceLeft: 999, lifeTime: 2, owner: 'player', charKey: p.charId, isCrit: false });
            game.particles.hexActivate(p.x, p.y, '#00ffcc');
            game.particles.explode(p.x, p.y, '#ff8800', 20);
        },
        eSkill(p: any, game: any) {
            p.applyBuff('barrage_mode', 4, { atkSpd: 3, noMove: true });
            game.particles.hexActivate(p.x, p.y, '#00ffcc');
        },
        ultimate(p: any, game: any) {
            for (let i = 0; i < 30; i++) {
                const a = Rng.float(0, Math.PI * 2);
                game.bulletPool.spawn({ x: p.x, y: p.y, vx: Math.cos(a) * 500, vy: Math.sin(a) * 500, damage: p.stats.damage * 2, radius: 7, color: '#ff4400', pierceLeft: 2, lifeTime: 1.8, owner: 'player', charKey: p.charId });
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
        desc: '炮台类词条效果×1.5，始终有2个跟随炮台',
        skills: { q: '部署炮台 — 召唤强化炮台持续攻击', e: '网络连接 — 所有炮台锁定最近敌人', r: '炮台风暴 — 召唤6座轨道炮台环绕旋转' },
        skillIcons: { q: 'summon', e: 'lightning', r: 'summon' },
        stats: { maxHp: 90, speed: 300, damage: 18, attackSpeed: 1.5, armor: 8, critRate: 0.05, critDmg: 0.5, pierce: 0 },
        passive(p: any, game: any) { game.spawnTurret(p, 0.6, true); game.spawnTurret(p, 0.6, true); p.stats.turretBonus = 1.5; },
        qSkill(p: any, game: any) { game.spawnTurret(p, 1.5); game.particles.hexActivate(p.x, p.y, '#00aaff'); },
        eSkill(p: any, game: any) {
            for (const t of game.turrets) t.focusTarget = game.getNearestEnemy(p.x, p.y);
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
        skills: { q: '怒冲 — 向前冲刺200距离并击飞沿途敌人', e: '战吼 — 10秒攻速+50%/伤害+30%', r: '死亡意志 — 牺牲半血换取10秒无敌' },
        skillIcons: { q: 'speed', e: 'fire', r: 'shield' },
        stats: { maxHp: 200, speed: 300, damage: 30, attackSpeed: 1.8, armor: 20, critRate: 0.1, critDmg: 0.5, pierce: 0 },
        passive(p: any) { p.stats._reikPassive = true; p.stats.lifestealRate = 0.05; },
        qSkill(p: any, game: any) {
            // 冲锋方向 = 角色朝向（不再追鼠标）
            const [nx, ny] = Vec.normalize(p.facingX ?? 1, p.facingY ?? 0);
            const startX = p.x, startY = p.y;
            p.x = clamp(p.x + nx * 200, p.radius, CANVAS_W - p.radius);
            p.y = clamp(p.y + ny * 200, p.radius, PLAYFIELD_BOTTOM - p.radius);
            game.screenShake.shake(8, 0.25);
            // 冲锋剑气：从起点向冲刺方向斩出长刃（覆盖整条冲锋路径）
            game.particles.meleeSlash?.(startX, startY, Math.atan2(ny, nx), '#ff4444', 200, 1.35);
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
            game.particles.hexActivate(p.x, p.y, '#ff4444');
        },
        ultimate(p: any, game: any) {
            p.hp *= 0.5;
            p.applyBuff('death_will', 10, { invincible: true });
            game.particles.hexActivate(p.x, p.y, '#ff0000');
            game.floatingText.spawn(p.x, p.y - 50, '死亡意志！', '#ff0000', 22, true);
            game.screenShake.shake(15, 0.5);
        },
    },
    olia: {
        id: 'olia',
        name: '时空行者·奥莉亚', icon: '🕰️', color: '#aaddff', unlocked: true,
        attackType: 'ranged', attackRange: 550, ultCd: 18,
        desc: '预知直觉：可预览下次词条选项',
        skills: { q: '时间倒流 — 回到上次记录位置并恢复HP', e: '时间膨胀 — 范围减速敌人+3秒攻速×2', r: '时空裂缝 — 冻结全场敌人5秒' },
        skillIcons: { q: 'heart', e: 'speed', r: 'ice' },
        stats: { maxHp: 100, speed: 360, damage: 20, attackSpeed: 2.2, armor: 6, critRate: 0.08, critDmg: 0.5, pierce: 0 },
        passive(p: any) { p.stats.previewAugments = true; },
        qSkill(p: any, game: any) {
            const saved = (game as any)._oliaSavedState;
            if (saved) {
                p.x = saved.x; p.y = saved.y; p.hp = Math.max(1, saved.hp);
                game.particles.hexActivate(p.x, p.y, '#aaddff');
            }
            (game as any)._oliaSavedState = { x: p.x, y: p.y, hp: p.hp };
        },
        eSkill(p: any, game: any) {
            game.slowEnemiesAround(p.x, p.y, 300, 0.1, 3);
            p.applyBuff('time_expand', 3, { atkSpd: 2 });
            game.particles.hexActivate(p.x, p.y, '#aaddff');
        },
        ultimate(p: any, game: any) {
            game.freezeAllEnemies(5);
            game.screenShake.shake(10, 0.4);
            game.particles.hexActivate(p.x, p.y, '#aaddff');
            game.floatingText.spawn(640, 200, '时空裂缝', '#aaddff', 28, true);
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
            game.particles.hexActivate(p.x, p.y, '#cc44ff');
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
            game.particles.hexActivate(p.x, p.y, '#cc44ff');
        },
        ultimate(p: any, game: any) {
            const am = game.augmentManager;
            if (am) am.active.forEach((a: any) => { if (a.onKill) a.onKill(p, { x: p.x, y: p.y, alive: false }, p.stats.damage * 5, game); });
            game.particles.hexActivate(p.x, p.y, '#cc44ff');
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
            const [nx, ny] = Vec.normalize(p.facingX ?? 1, p.facingY ?? 0);
            const b = game.bulletPool.spawn({ x: p.x, y: p.y, vx: nx * 900, vy: ny * 900, damage: p.stats.damage * 3, radius: 8, color: '#00ccff', pierceLeft: 999, lifeTime: 2, owner: 'player', charKey: p.charId });
            b.onHitCb = (_bullet: any, enemy: any) => {
                enemy.slowMult = 0.3; enemy.frozen = Math.max(enemy.frozen || 0, 0.8);
                game.particles?.coldImpact(enemy.x, enemy.y);
            };
            game.particles.hexActivate(p.x, p.y, '#00ccff');
        },
        eSkill(p: any, game: any) {
            // 放置类技能：冰场释放在敌人最密集的位置；场上没有敌人时退回鼠标位置
            const c  = game.getEnemyClusterPoint?.();
            const cx = c ? c.x : game.input.mouse.x;
            const cy = c ? c.y : game.input.mouse.y;
            game.spawnIceZone(cx, cy, 100, 12);
            game.particles.hexActivate(cx, cy, '#00ccff');
        },
        ultimate(p: any, game: any) {
            game.freezeAllEnemies(5);
            for (const e of game.enemies) { if (e.alive) e.takeDamage(p.stats.damage * 3, p, game); }
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
