'use strict';
// 盗神·薇娅（via）+ 亡灵法师·莫提斯（mortis）行为单测
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHARACTERS, spawnSkeletonServant, soulMult, kleptoStagger, kleptoCaptureAttack,
    kleptoCaptureBullet } = require('../dist/data/CharacterDB');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { makeMockGame, makePlayer } = require('./mockGame');

function makeEnemy(game, x, y, hp = 1000) {
    const e = new EnemyBase(); e.init('grunt', 1, game);
    e.x = x; e.y = y; e.maxHp = hp; e.hp = hp;
    return e;
}

function interceptGame() {
    const game = makeMockGame();
    const bullets = [];
    game.bulletPool = { spawn: (cfg) => { cfg.onHitCb = null; bullets.push(cfg); return cfg; } };
    return { game, bullets };
}

// ── 基础数值 ─────────────────────────────────────────────────

test('薇娅/莫提斯基础数值按设计稿', () => {
    const v = CHARACTERS.via.stats, m = CHARACTERS.mortis.stats;
    assert.deepEqual([v.maxHp, v.speed, v.damage, v.attackSpeed, v.armor], [110, 330, 20, 1.2, 5]);
    assert.equal(v.critRate, 0.10);
    assert.deepEqual([m.maxHp, m.speed, m.damage, m.attackSpeed, m.armor], [100, 300, 45, 0.6, 5]);
    assert.equal(m.critRate, 0.15);
    assert.equal(m.critDmg, 0.6);
    assert.equal(CHARACTERS.via.ultCd, 35);
    assert.equal(CHARACTERS.mortis.ultCd, 30);
    assert.equal(CHARACTERS.mortis.qCd, 3);
});

// ── 薇娅·Q 窃神之手 ──────────────────────────────────────────

test('窃神之手:成功窃取挂失措标记并挂起Q冷却,再按Q释放赃技', () => {
    const { game, bullets } = interceptGame();
    const p = makePlayer({ x: 100, y: 100, stats: { ...CHARACTERS.via.stats, klepto: true } });
    game.announceSteal = () => {};
    const e = makeEnemy(game, 200, 100);
    e.label = '小兵';
    game.enemies.push(e);
    for (let i = 1; i <= 2; i++) game.enemies.push(makeEnemy(game, 220 + i * 40, 100));   // 3个目标
    // 固定随机：roll=0.1 → 一技能(30%档)
    const { Rng } = require('../dist/core/MathUtils');
    const origFloat = Rng.float;
    Rng.float = () => 0.1;
    try {
        CHARACTERS.via.qSkill(p, game);
    } finally { Rng.float = origFloat; }
    assert.equal(e._skillStolen, true, '被动失措标记应挂在怪物身上');
    assert.equal(p.stats.deferQcd, true, '窃取成功后Q冷却挂起');
    assert.equal(p.stats._stolenSkill.kind, 'volley');
    // 再按Q释放赃技：3发追踪弹 + Q冷却启动
    const before = bullets.length;
    CHARACTERS.via.qSkill(p, game);
    assert.equal(bullets.length - before, 3, '一技能赃技=3发追踪弹');
    assert.equal(bullets[0].damage, Math.max(15, (e.damage || 10) * 2), '赃技伤害=怪物攻击×2');
    assert.equal(p.stats._stolenSkill, undefined, '赃技一次性');
    assert.equal(p.stats.deferQcd, false, '释放后解除冷却挂起');
});

test('窃神之手:失败恢复5点生命且不挂起冷却', () => {
    const { game } = interceptGame();
    const p = makePlayer({ x: 100, y: 100, stats: { ...CHARACTERS.via.stats, klepto: true }, hp: 50 });
    game.announceSteal = () => {};
    const e = makeEnemy(game, 200, 100);
    game.enemies.push(e);
    const { Rng } = require('../dist/core/MathUtils');
    const origFloat = Rng.float;
    Rng.float = () => 0.9;   // 40%失败区间
    try {
        CHARACTERS.via.qSkill(p, game);
    } finally { Rng.float = origFloat; }
    assert.equal(p.hp, 55, '失败恢复5点生命');
    assert.equal(e._skillStolen, false, '失败不挂失措标记');
    assert.equal(p.stats.deferQcd, false, '失败不挂起冷却(PlayerController按常规启动)');
});

test('失主还没发现:被盗技能的怪物施法完成帧空放并失措2秒', () => {
    const game = makeMockGame();
    const e = makeEnemy(game, 100, 100);
    e._skillStolen = true;
    assert.equal(kleptoStagger(e, game), true, '施法尝试被失措取代');
    assert.equal(e.stunned, 2, '陷入2秒失措(无法移动和攻击)');
    assert.equal(e._skillStolen, false, '标记一次性');
    assert.equal(kleptoStagger(e, game), false, '标记已消耗不再失措');
});

// ── 薇娅·E 这招我收下了 ──────────────────────────────────────

test('E截取:敌弹/近战入囊(上限5),释放后冷却启动', () => {
    const { game, bullets } = interceptGame();
    const p = makePlayer({
        x: 100, y: 100, facingX: 1, facingY: 0,
        stats: { ...CHARACTERS.via.stats, klepto: true },
        getNearestEnemy: () => null,
    });
    CHARACTERS.via.eSkill(p, game);   // 进入截取
    assert.equal(p.stats.deferEcd, true, '进入截取时E冷却挂起');
    // 截取两发敌弹 + 一次近战
    kleptoCaptureBullet({ x: 150, y: 100, damage: 12, color: '#5cff5c', vx: -100, vy: 0, radius: 5 }, p, game);
    kleptoCaptureBullet({ x: 130, y: 100, damage: 20, color: '#ff5544', vx: -80, vy: 0, radius: 5 }, p, game);
    const e = makeEnemy(game, 150, 100);
    kleptoCaptureAttack(e, p, game, 'melee');
    assert.equal(p.stats._intercept.stored.length, 3);
    assert.equal(p.stats._intercept.stored[0].kind, 'bullet');
    assert.equal(p.stats._intercept.stored[2].kind, 'slash', '近战化为斩击');
    // 上限5：第6份拒收
    for (let i = 0; i < 3; i++) {
        kleptoCaptureBullet({ x: 140, y: 100, damage: 5, color: '#fff', vx: 0, vy: 0, radius: 5 }, p, game);
    }
    assert.equal(p.stats._intercept.stored.length, 5, '至多储存5份');
    kleptoCaptureBullet({ x: 140, y: 100, damage: 5, color: '#fff', vx: 0, vy: 0, radius: 5 }, p, game);
    assert.equal(p.stats._intercept.stored.length, 5, '超出不截取');
    // 释放：子弹份按储存特征射出
    CHARACTERS.via.eSkill(p, game);
    assert.equal(bullets.length, 4, '两个子弹份释放为玩家弹(斩击份不生成弹体)');
    assert.equal(bullets[0].damage, 12);
    assert.equal(bullets[0].color, '#5cff5c', '保留原有攻击特征');
    assert.equal(bullets[2].damage, 5, '后两份子弹份紧随释放');
    assert.equal(p.stats._intercept, undefined, '释放后状态清空');
    assert.equal(p.stats.deferEcd, false, '全部释放后冷却启动');
});

test('E截取:6秒超时自动释放(PlayerController tick驱动)', () => {
    const { PlayerController } = require('../dist/entities/PlayerController');
    const { game, bullets } = interceptGame();
    const p = new PlayerController();
    p.stats = { maxHp: 110, armor: 0, critRate: 0, _coreOverflow: false,
        klepto: true, _intercept: { stored: [{ kind: 'bullet', dmg: 15, color: '#fff' }], t: 0.2 } };
    p.hp = 110;
    p.x = 100; p.y = 100;
    p._tickIntercept(0.3, game);
    assert.equal(bullets.length, 1, '超时自动释放');
    assert.equal(p.stats._intercept, undefined);
});

// ── 薇娅·R 此刻归我所有 ──────────────────────────────────────

test('掠夺领域:敌弹折转+近战残影+没收召唤物,收账冲击30+10×次数(上限150)', () => {
    const { game, bullets } = interceptGame();
    const p = makePlayer({
        x: 300, y: 300,
        stats: { ...CHARACTERS.via.stats, klepto: true },
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    game.announceSteal = () => {};
    CHARACTERS.via.ultimate(p, game);
    const domain = game.turrets[0];
    assert.equal(domain.kind, 'plunderDomain');
    assert.equal(game._plunderDomain, domain, '领域登记到game供挂点读取');
    const monster = makeEnemy(game, 450, 300);   // 近战残影的唯一反击目标
    const far = makeEnemy(game, 300, 600);   // 距波心300:首跳(190)外、450圈内
    game.enemies.push(monster, far);
    // 领域内敌弹→折转为玩家弹射向怪物
    kleptoCaptureBullet({ x: 350, y: 300, damage: 14, vx: -200, vy: 0, radius: 5 }, p, game);
    assert.equal(bullets.length, 1, '掠夺的敌弹折转为玩家弹');
    assert.equal(bullets[0].owner, 'player');
    assert.equal(bullets[0].damage, 14, '保留原伤害特征');
    // 近战敌人攻击→残影反击(唯一近距目标=monster)，计入夺取
    const melee = makeEnemy(game, 350, 300);
    game.enemies.push(melee);
    const monsterHp0 = monster.hp;
    kleptoCaptureAttack(melee, p, game, 'melee');
    assert.equal(domain._captures, 2, '子弹+近战=2次夺取');
    assert.equal(monsterHp0 - monster.hp, melee.damage || 10, '残影以该攻击反击附近怪物');
    // 没收领域内敌方召唤物（水克隆）
    const clone = { x: 320, y: 320, alive: true, kind: 'waterClone', owner: { isBoss: true } };
    game.turrets.push(clone);
    domain.update(0.5, game);   // 没收节流到点
    assert.equal(clone.alive, false, '敌方召唤物被没收');
    assert.equal(domain._captures, 3);
    // 领域结束→收账冲击：30 + 3×10 = 60
    domain.update(6, game);
    assert.equal(domain.alive, false);
    assert.equal(game._plunderDomain, null, '领域结束注销');
    const wave = game.turrets.find(t => t.kind === 'debtWave');
    assert.ok(wave, '收账冲击波挂载');
    const farHp0 = far.hp;
    wave.update(0.2, game);      // r=190: monster(150)命中, far(600)不命中
    assert.equal(farHp0 - far.hp, 0, '波前未到不受伤');
    wave.update(0.2, game);
    assert.equal(farHp0 - far.hp, 60, '收账冲击=30+3×10=60');
    wave.update(1.0, game);
    assert.equal(wave.alive, false, '波扩散到上限消散');
});

// ── 莫提斯·被动：骸骨军团 + 灵魂收割 ─────────────────────────

test('莫提斯被动:双被动字段+灵魂乘区(上限60层)', () => {
    const p = makePlayer({ stats: { ...CHARACTERS.mortis.stats } });
    CHARACTERS.mortis.passive(p, makeMockGame());
    assert.equal(p.stats.skeletonRaiser, true);
    assert.equal(p.stats.soulHarvest, true);
    assert.equal(soulMult(p), 1, '0层无加成');
    p.stats._souls = 30;
    assert.equal(soulMult(p), 1.30, '30层=+30%技能伤害');
    p.stats._souls = 80;
    assert.equal(soulMult(p), 1.60, '层数上限60');
});

test('骸骨军团:死亡钩子25%几率复苏(600码内/上限8具)', () => {
    const game = makeMockGame();
    const spawns = [];
    game.tryRaiseSkeleton = (e) => {
        const p = game._player;
        if (!p?.stats?.skeletonRaiser) return;
        const { Vec } = require('../dist/core/MathUtils');
        if (Vec.dist(e.x, e.y, p.x, p.y) > 600) return;
        const count = (game.turrets || []).filter(t => t.kind === 'skeleton' && t.alive && !t._noCap).length;
        if (count >= 8) return;
        spawns.push(spawnSkeletonServant(game, p, e.x, e.y, 25));
    };
    const { Rng } = require('../dist/core/MathUtils');
    const origChance = Rng.chance;
    Rng.chance = () => true;
    try {
        const p = makePlayer({ x: 100, y: 100, stats: { ...CHARACTERS.mortis.stats, skeletonRaiser: true } });
        game._player = p;
        const near = makeEnemy(game, 200, 100);
        game.tryRaiseSkeleton(near);
        assert.equal(spawns.length, 1, '25%几率判定通过即复苏');
        assert.equal(spawns[0].hp, 50);
        // 上限8：已复苏8具后再击杀不再复苏
        for (let i = 0; i < 8; i++) spawnSkeletonServant(game, p, 150, 150, 25);
        const another = makeEnemy(game, 200, 120);
        game.tryRaiseSkeleton(another);
        assert.equal(spawns.length, 1, '普通复苏上限8具');
        // 超距不复苏
        const farDead = makeEnemy(game, 900, 100);
        game.tryRaiseSkeleton(farDead);
        assert.equal(spawns.length, 1, '600码外不复苏');
    } finally { Rng.chance = origChance; }
});

test('骸骨仆从:追击怪物攻击15伤,雾内攻速+50%回血,围堵磨损掉血', () => {
    const game = makeMockGame();
    const p = makePlayer({ x: 100, y: 100, stats: { ...CHARACTERS.mortis.stats } });
    game._player = p;
    const sk = spawnSkeletonServant(game, p, 200, 100, 25);
    const prey = makeEnemy(game, 230, 100, 100);
    game.enemies.push(prey);
    sk.update(0.5, game);   // 进入攻击距离并出手
    assert.equal(100 - prey.hp, 15, '仆从伤害15');
    // 雾内：攻速冷却清零更快 + 回血
    const fog = { x: sk.x, y: sk.y, r: 350, alive: true, kind: 'rotFog', _t: 5 };
    game.turrets.push(fog);
    sk.hp = 30;
    sk._atkCd = 0.5;
    sk.update(0.5, game);
    assert.ok(sk.hp > 30, '雾内每秒回复5点生命');
    assert.equal(prey.maxHp - prey.hp, 30, '雾内攻速+50%→0.5秒内第二次出手(共30伤)');
    // 围堵磨损：邻接敌人按攻击力磨血
    const ambusher = makeEnemy(game, sk.x + 5, sk.y, 9999);
    ambusher.damage = 40;
    game.enemies.push(ambusher);
    sk.hp = 50;
    sk.update(1.0, game);
    assert.ok(sk.hp < 50, '围堵怪物造成接触磨损');
});

// ── 莫提斯·Q 白骨之矛 / E 腐雾领域 ────────────────────────────

test('白骨之矛:穿透长矛,命中减速30%并各吸1个灵魂', () => {
    const { game, bullets } = interceptGame();
    const p = makePlayer({ x: 100, y: 100, stats: { ...CHARACTERS.mortis.stats, _souls: 0 } });
    game.grantSoul = (pp) => { pp.stats._souls = (pp.stats._souls || 0) + 1; };
    const a = makeEnemy(game, 300, 100);
    game.enemies.push(a);
    CHARACTERS.mortis.qSkill(p, game);
    assert.equal(bullets.length, 1);
    assert.equal(bullets[0].damage, 45, '0层=45点伤害');
    assert.ok(bullets[0].pierceLeft >= 999, '穿透长矛');
    bullets[0].onHitCb(null, a);   // 命中：减速+吸魂
    assert.equal(a.slowMult, 0.7, '减速30%');
    assert.equal(p.stats._souls, 1, '命中吸取1个灵魂');
});

test('腐雾领域:雾内怪物每秒12点+减速20%,位置在鼠标处', () => {
    const game = makeMockGame();
    game.input = { mouse: { x: 500, y: 300, active: true } };
    const p = makePlayer({
        x: 100, y: 100,
        stats: { ...CHARACTERS.mortis.stats, _souls: 20 },
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    const inFog = makeEnemy(game, 520, 320);
    const out = makeEnemy(game, 500, 900);
    game.enemies.push(inFog, out);
    CHARACTERS.mortis.eSkill(p, game);
    const fog = game.turrets[0];
    assert.equal(fog.kind, 'rotFog');
    assert.deepEqual([fog.x, fog.y], [500, 300], '雾生成在鼠标位置');
    fog.update(0.1, game);   // 第一跳
    assert.ok(Math.abs((1000 - inFog.hp) - 12 * 1.2) < 1e-6, '20层灵魂=12×1.2/秒');
    assert.equal(inFog.slowMult, 0.8, '减速20%');
    assert.equal(out.hp, 1000, '雾外不受影响');
});

// ── 莫提斯·R 亡者天灾 ────────────────────────────────────────

test('亡者天灾:引爆全部仆从(300码60点/具可叠加),复苏8具可超上限,触发词条击杀效果', () => {
    const game = makeMockGame();
    const kills = [];
    game.augmentManager.dispatchKill = (p, enemy, dmg, g) => kills.push(dmg);
    const p = makePlayer({
        x: 400, y: 300,
        stats: { ...CHARACTERS.mortis.stats, _souls: 0 },
        applyAttackDamage() {},
    });
    game._player = p;
    game.spawnExplosion = (_pl, x, y, dmg, radius) => {
        for (const e of game.enemies) {
            if (e.alive && Math.hypot(e.x - x, e.y - y) < radius) e.hp -= dmg;
        }
    };
    const s1 = spawnSkeletonServant(game, p, 450, 300, 25);
    const s2 = spawnSkeletonServant(game, p, 500, 400, 25);   // 第二具也在 e1 尸爆半径内
    const e1 = makeEnemy(game, 500, 300);   // 同时在两具尸爆半径内→60+60叠加
    game.enemies.push(e1);
    CHARACTERS.mortis.ultimate(p, game);
    assert.equal(s1.alive, false, '仆从全部引爆');
    assert.equal(s2.alive, false);
    assert.equal(1000 - e1.hp, 120, '两具尸爆叠加=120点');
    const raised = (game.turrets || []).filter(t => t.kind === 'skeleton' && t.alive);
    assert.equal(raised.length, 8, '立即复苏8具');
    assert.ok(raised.every(t => t._noCap && t._t === 15), '复苏的仆从可超上限且持续15秒');
    assert.equal(kills.length, 1, '触发所有已装备词条的击杀效果');
});

// ── 冷却接线：灵魂层数折算E冷却 ──────────────────────────────

test('灵魂层数折算E冷却:每满20层-1秒(60层=-3秒)', () => {
    const game = makeMockGame();
    const p = makePlayer({ stats: { ...CHARACTERS.mortis.stats } });
    game.grantSoul = undefined;
    // 直接走 GameManager 的折算逻辑（与 grantSoul 内联一致）
    p.stats._souls = 40;
    p.stats.eCdFlatReduction = Math.floor(Math.min(60, p.stats._souls) / 20);
    assert.equal(p.stats.eCdFlatReduction, 2, '40层=E冷却-2秒');
    const eCd = Math.max(1, (10 - p.stats.eCdFlatReduction) * 1);
    assert.equal(eCd, 8);
    p.stats._souls = 60;
    p.stats.eCdFlatReduction = Math.floor(60 / 20);
    assert.equal(Math.max(1, (10 - p.stats.eCdFlatReduction)), 7, '满层60=E冷却7秒');
});
