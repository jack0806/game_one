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
    assert.equal(p.stats.trueDamageRate, 0.15, '被动:额外15%真实伤害');
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

test('时空切割:至多5目标依次突刺,锁定越少每段伤害越高,回到原位', () => {
    const game = makeMockGame();
    // 5个敌人 → 每段10伤
    for (let i = 0; i < 5; i++) {
        const e = new EnemyBase(); e.init('grunt', 1, game);
        e.x = 100 + i * 60; e.y = 100;
        game.enemies.push(e);
    }
    const p = makePlayer({
        x: 50, y: 50,
        stats: { ...CHARACTERS.olia.stats },
        applyBuff() {},
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    CHARACTERS.olia.qSkill(p, game);
    for (const e of game.enemies) {
        assert.ok(e.hp < e.maxHp, '每个锁定敌人都应受伤');
    }
    assert.equal(p.x, 50, '突刺结束回到原位');
    assert.equal(p.y, 50);

    // 1个敌人 → 每段30伤（锁定越少伤害越多）
    const game2 = makeMockGame();
    const solo = new EnemyBase(); solo.init('grunt', 1, game2);
    solo.x = 150; solo.y = 150;
    game2.enemies.push(solo);
    const hp0 = solo.hp;
    const p2 = makePlayer({
        x: 100, y: 100,
        stats: { ...CHARACTERS.olia.stats },
        applyBuff() {},
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    CHARACTERS.olia.qSkill(p2, game2);
    assert.equal(hp0 - solo.hp, 30, '单目标每段30伤害');
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

    // 形态伤害加成附加到Q：单目标近战形态 30×1.3=39
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
    assert.equal(solo.maxHp - solo.hp, 39, 'Q吃形态30%加成');
});

test('时空奇点:引导2秒→能量球飞向敌群拉取3秒→爆炸200%伤害', () => {
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

    // 拉取3秒 → 爆炸：范围内敌人吃 200% 基础伤害(20×2=40)
    const victim = new EnemyBase(); victim.init('grunt', 1, game);
    victim.x = 400; victim.y = 300;
    game.enemies.push(victim);
    const hp0 = victim.hp;
    orb.update(3.1, game);
    assert.equal(orb.alive, false, '3秒后能量球消散');
    assert.equal(hp0 - victim.hp, 40, '爆炸造成200%基础伤害');
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
