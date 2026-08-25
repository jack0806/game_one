'use strict';
// 时空行者重做 + 薇薇安E重做（文档：英雄重做 和调整.docx）行为单测
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHARACTERS } = require('../dist/data/CharacterDB');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { makeMockGame, makePlayer } = require('./mockGame');

// ── 时空行者·奥莉亚 ──────────────────────────────────────────

test('奥莉亚基础属性与被动(15%真实伤害)按文档重做', () => {
    const olia = CHARACTERS.olia;
    const s = olia.stats;
    assert.deepEqual([s.maxHp, s.speed, s.damage, s.attackSpeed, s.armor], [100, 320, 20, 1.0, 20], 'HP100/移速320/伤害20/攻速1.0/护甲20');
    assert.equal(s.critRate, 0.10, '暴击10%');
    assert.equal(s.critDmg, 0.5, '暴伤+50%');
    assert.equal(olia.qCd, 7, 'Q技能CD 7秒');
    const p = makePlayer({ stats: { ...s } });
    olia.passive(p, makeMockGame());
    assert.equal(p.stats.trueDamageRate, 0.35, '被动:额外35%真实伤害');
    assert.equal(p.stats.castShield, 20, '被动:释放技能获得20点护盾');
});

test('施法护盾:释放技能获得castShield点临时护盾,2秒后自动回收', () => {
    const { PlayerController } = require('../dist/entities/PlayerController');
    const p = new PlayerController();
    p.stats = { maxHp: 100, armor: 0, _coreOverflow: false, trueDamageRate: 0.35, castShield: 20 };
    p.hp = 100;
    p.shield = 0;
    p.maxShield = 0;
    p._grantCastShield({});
    assert.equal(p.shield, 20, '施法应获得20点临时护盾');
    assert.equal(p.maxShield, 20, '护盾上限同步抬高');
    p._grantCastShield({});
    assert.equal(p.shield, 40, '连续施法可叠加临时护盾');

    // 2秒后未被消耗的部分自动回收
    const input = {
        getAxis: () => [0, 0], isDashPressed: () => false,
        isKeyQPressed: () => false, isKeyEPressed: () => false,
        isKeyRPressed: () => false, mouse: { x: 0, y: 0 },
    };
    p.tick(2.2, input, {});
    assert.equal(p.shield, 0, '临时护盾到期应全部回收');

    // 被打掉的部分不返还：先消耗10再等到期,只回收剩余10
    const p2 = new PlayerController();
    p2.stats = { maxHp: 100, armor: 0, _coreOverflow: false, castShield: 20 };
    p2.hp = 100; p2.shield = 0; p2.maxShield = 0;
    p2._grantCastShield({});
    p2.shield = 10; // 被打掉10
    p2.tick(2.2, input, {});
    assert.equal(p2.shield, 0, '到期只回收未消耗部分(剩余10被回收,不为负)');
});

test('时空奇点引导期间:周围100码每只怪提供10点临时护盾', () => {
    const game = makeMockGame();
    game.getEnemyClusterPoint = () => ({ x: 400, y: 300 });
    const grants = [];
    const p = makePlayer({
        x: 100, y: 100,
        shield: 0, maxShield: 0,
        stats: { ...CHARACTERS.olia.stats },
        applyBuff() {},
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
        grantTempShield(amount, dur) { grants.push({ amount, dur }); this.shield += amount; },
    });
    CHARACTERS.olia.ultimate(p, game);
    const orb = game.turrets[0];
    // 玩家(100,100)周围100码内放2只怪
    for (let i = 0; i < 2; i++) {
        const e = new EnemyBase(); e.init('grunt', 1, game);
        e.x = 120 + i * 20; e.y = 110;
        game.enemies.push(e);
    }
    orb.update(0.3, game); // 引导阶段推进
    assert.equal(p.shield, 20, '2只怪×10=20点临时护盾');
    assert.ok(grants.length >= 1 && grants.every(gg => gg.dur === 2), '护盾为2秒临时份额');
    assert.equal(orb._phase, 'channel', '仍在引导阶段');
    // 差额补足：已有20盾时不再叠加
    const grantsBefore = grants.length;
    orb.update(0.3, game);
    assert.equal(p.shield, 20, '护盾已达标时差额补足不叠加');
    assert.equal(grants.length, grantsBefore, '不重复授予');
});

test('真实伤害直接扣血:无视护盾/护甲/隐身/无敌,打空正常死亡', () => {
    const game = makeMockGame();
    const e = new EnemyBase();
    e.init('grunt', 1, game);
    e.x = 100; e.y = 100;
    const hp0 = e.hp;
    e.takeTrueDamage(10, {}, game);
    assert.equal(e.hp, hp0 - 10, '真实伤害应全额扣血(不吃护甲)');

    // 无敌+隐身目标同样吃真伤
    e.invulnerable = true;
    e.invisible = true;
    e.takeTrueDamage(10, {}, game);
    assert.equal(e.hp, hp0 - 20, '真伤无视无敌与隐身');

    // 打空血走正常死亡
    e.takeTrueDamage(e.hp + 100, {}, game);
    assert.equal(e.alive, false, '真伤致死应结算死亡');
});

test('时空切割:多段延时突刺到敌人脸上,期间无敌不可控,结束回到原位', () => {
    const game = makeMockGame();
    // 2个敌人：每段 30-5=25 伤
    for (let i = 0; i < 2; i++) {
        const e = new EnemyBase(); e.init('grunt', 1, game);
        e.x = 200 + i * 120; e.y = 100;
        game.enemies.push(e);
    }
    const buffs = [];
    const p = makePlayer({
        x: 50, y: 50,
        stats: { ...CHARACTERS.olia.stats },
        applyBuff(id, dur, mods) { buffs.push({ id, dur, mods }); },
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    CHARACTERS.olia.qSkill(p, game);
    const strike = game.turrets[0];
    assert.ok(strike, '突刺序列应挂载到场景');
    assert.equal(strike.kind, 'alphaStrike');
    // 释放瞬间即获得无敌+禁移动
    assert.ok(buffs.some(b => b.id === 'alpha_strike' && b.mods.invincible === true && b.mods.noMove === true),
        '突刺期间应进入无敌且不可移动');

    // 第一段：0.15s 后突刺到第一个敌人脸上（位移+伤害）
    strike.update(0.16, game);
    const first = game.enemies[0];
    assert.ok(first.hp < first.maxHp, '第一段应造成伤害');
    const distToFirst = Math.hypot(p.x - first.x, p.y - first.y);
    assert.ok(distToFirst < first.radius + p.radius + 4, '玩家应突刺到第一个敌人脸上');
    // 无敌 buff 在序列期间持续刷新
    assert.ok(buffs.filter(b => b.id === 'alpha_strike').length >= 2, '序列每帧刷新无敌');

    // 第二段 + 收尾回起点
    strike.update(0.16, game);
    const second = game.enemies[1];
    assert.ok(second.hp < second.maxHp, '第二段应造成伤害');
    strike.update(0.16, game);
    assert.equal(strike.alive, false, '全部目标处理完序列结束');
    assert.equal(p.x, 50, '突刺结束回到原位');
    assert.equal(p.y, 50);
    assert.equal(first.maxHp - first.hp, 25, '两目标时每段25伤(30-5)');
});

test('时空切割:单目标30伤,锁定越少伤害越高;序列中死亡的目标被跳过', () => {
    const game = makeMockGame();
    const solo = new EnemyBase(); solo.init('grunt', 1, game);
    solo.x = 150; solo.y = 150;
    game.enemies.push(solo);
    const p = makePlayer({
        x: 100, y: 100,
        stats: { ...CHARACTERS.olia.stats },
        applyBuff() {},
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    CHARACTERS.olia.qSkill(p, game);
    const strike = game.turrets[0];
    strike.update(0.16, game);
    assert.equal(solo.maxHp - solo.hp, 30, '单目标每段30伤害');
    // 目标死亡后序列直接收尾回起点
    strike.update(0.16, game);
    assert.equal(strike.alive, false);
    assert.equal(p.x, 100, '无剩余目标时回到原位');
});

test('所有技能都吃35%真伤:Q/R经applyAttackDamage结算真伤,子弹命中同样结算', () => {
    // 真实 PlayerController 的 applyAttackDamage 链路（近战/Q/R 共用）
    const { PlayerController } = require('../dist/entities/PlayerController');
    const game = makeMockGame();
    const e = new EnemyBase(); e.init('grunt', 1, game);
    e.x = 100; e.y = 100; e.armor = 50; // 高护甲也挡不住真伤
    game.enemies.push(e);
    const p = new PlayerController();
    p.stats = { maxHp: 100, armor: 0, critRate: 0, _coreOverflow: false, trueDamageRate: 0.35, damage: 20 };
    p.hp = 100;
    p.x = 90; p.y = 100;
    const hp0 = e.hp;
    p.applyAttackDamage(e, game, 20); // 技能/近战伤害入口
    // 常规伤害被护甲减免(<20) + 真伤 20×0.35=7 全额
    assert.ok(e.hp < hp0, '应造成伤害');
    const expectedTrue = 20 * 0.35;
    assert.ok(hp0 - e.hp > expectedTrue - 0.01, `至少包含${expectedTrue}点无视护甲的真伤`);

    // 子弹路径（远程普攻）同样吃真伤
    const { BulletPool } = require('../dist/entities/BulletController');
    const pool = new BulletPool(4);
    const e2 = new EnemyBase(); e2.init('grunt', 1, game);
    e2.x = 20; e2.y = 0; e2.armor = 0;
    game.enemies.push(e2);
    const p2 = new PlayerController();
    p2.stats = { maxHp: 100, armor: 0, critRate: 0, _coreOverflow: false, trueDamageRate: 0.35 };
    p2.hp = 100;
    pool.spawn({ x: 10, y: 0, vx: 0, vy: 0, damage: 20, radius: 5, pierceLeft: 0, hitEnemies: new Set() });
    const hp2 = e2.hp;
    pool.update(0.016, game.enemies, p2, game);
    // 常规 20(无甲全额) + 真伤 7 = 27
    assert.equal(hp2 - e2.hp, 27, '子弹命中应结算常规伤害+35%真伤');
});

test('切换形态:攻击形态近战+30%伤害(附加到技能)+50%攻速,可切回', () => {
    const game = makeMockGame();
    const p = makePlayer({
        x: 100, y: 100,
        stats: { ...CHARACTERS.olia.stats },
        applyBuff() {},
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    CHARACTERS.olia.eSkill(p, game);
    assert.equal(p.attackForm, 'melee', '切入攻击形态(近战)');
    assert.equal(p.formDamageMult, 1.3, '+30%伤害加成');
    assert.equal(p.formAtkSpdMult, 1.5, '+50%攻速加成');
    CHARACTERS.olia.eSkill(p, game);
    assert.equal(p.attackForm, 'ranged', '可切回远程形态');
    assert.equal(p.formDamageMult, 1, '切回后伤害加成还原');
    assert.equal(p.formAtkSpdMult, 1, '切回后攻速加成还原');

    // 形态伤害加成附加到Q：单目标近战形态 30×1.3=39（延时序列，推进后结算）
    const game2 = makeMockGame();
    const solo = new EnemyBase(); solo.init('grunt', 1, game2);
    solo.x = 150; solo.y = 150;
    game2.enemies.push(solo);
    const p2 = makePlayer({
        x: 100, y: 100,
        stats: { ...CHARACTERS.olia.stats },
        applyBuff() {},
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    p2.attackForm = 'melee'; p2.formDamageMult = 1.3;
    CHARACTERS.olia.qSkill(p2, game2);
    game2.turrets[0].update(0.16, game2);
    assert.equal(solo.maxHp - solo.hp, 39, 'Q吃形态30%加成');
});

test('时空奇点:引导2秒→拉扯敌人到球心聚团→按拉取数增伤爆炸', () => {
    const game = makeMockGame();
    game.getEnemyClusterPoint = () => ({ x: 400, y: 300 });
    const p = makePlayer({
        x: 100, y: 100,
        stats: { ...CHARACTERS.olia.stats },
        applyBuff() {},
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    CHARACTERS.olia.ultimate(p, game);
    const orb = game.turrets[0];
    assert.ok(orb, '能量球应挂载到场景');
    assert.equal(orb.kind, 'timeOrb');
    // 引导阶段：2秒内悬停头顶
    orb.update(1.0, game);
    assert.equal(orb._phase, 'channel', '前2秒为引导');
    orb.update(1.1, game);
    assert.equal(orb._phase, 'active', '引导结束进入拉取阶段');

    // 3只怪：1只在球心附近，2只在100px外（将被拉向球心）
    const victims = [];
    for (let i = 0; i < 3; i++) {
        const v = new EnemyBase(); v.init('grunt', 1, game);
        v.x = 400 + (i === 0 ? 0 : 100); v.y = 300 + (i === 1 ? 80 : 0);
        game.enemies.push(v);
        victims.push(v);
    }
    // 推进拉取阶段：外围怪物应被持续拉向球心
    for (let k = 0; k < 40; k++) orb.update(0.08, game);
    // 爆炸：3只被拉取 → 增伤 1+3×5%=1.15 → 伤害 20×2×1.15=46
    assert.equal(orb.alive, false, '3秒后能量球消散');
    for (const v of victims) {
        assert.equal(v.maxHp - v.hp, 46, '每只被拉怪物受 200%×1.15 爆炸伤害');
    }
    const d2 = Math.hypot(victims[1].x - 400, victims[1].y - 300);
    assert.ok(d2 < 60, '外围怪物应被拉向球心聚团');
});

test('时空奇点增伤上限20%:拉取超过4只按4只计算', () => {
    const game = makeMockGame();
    game.getEnemyClusterPoint = () => ({ x: 400, y: 300 });
    const p = makePlayer({
        x: 100, y: 100,
        stats: { ...CHARACTERS.olia.stats },
        applyBuff() {},
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    CHARACTERS.olia.ultimate(p, game);
    const orb = game.turrets[0];
    orb.update(2.1, game); // 进入 active
    for (let i = 0; i < 6; i++) {
        const v = new EnemyBase(); v.init('grunt', 1, game);
        v.x = 400 + (i - 3) * 30; v.y = 300;
        game.enemies.push(v);
    }
    orb.update(3.1, game); // 拉取并爆炸
    // 6只被拉取但增伤封顶：1+20%=1.2 → 20×2×1.2=48
    for (const v of game.enemies) {
        assert.equal(v.maxHp - v.hp, 48, '增伤上限20%(按4只计算)');
    }
});

// ── 薇薇安·超频指令 ─────────────────────────────────────────

test('薇薇安E超频指令:自身buff+场上炮台获得限时伤害/攻速乘区,CD12秒', () => {
    const vivian = CHARACTERS.vivian;
    assert.equal(vivian.eCd, 12, 'E技能CD改为12秒');
    const game = makeMockGame();
    const buffs = [];
    const p = makePlayer({
        x: 100, y: 100,
        stats: { ...vivian.stats },
        applyBuff(id, dur, mods) { buffs.push({ id, dur, mods }); },
    });
    const turret = { x: 200, y: 100, alive: true, dmg: 10 };
    game.turrets = [turret, { x: 300, y: 100, alive: false }];
    vivian.eSkill(p, game);
    assert.ok(buffs.some(b => b.id === 'overclock' && b.mods.dmgMult === 1.2 && b.mods.atkSpd === 2.5),
        '自身获得伤害+20%/攻速+150% buff');
    assert.equal(turret.dmgMult, 1.2, '存活炮台获得伤害乘区');
    assert.equal(turret.spdMult, 2.5, '存活炮台获得攻速乘区');
    assert.equal(turret._buffTimer, 8, '炮台乘区限时8秒');
    assert.equal(game.turrets[1].dmgMult, undefined, '已消亡炮台不吃超频');
});
