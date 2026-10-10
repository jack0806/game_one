'use strict';
// 角色技能调整（炮击手/薇薇安/狂战士）行为单测
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHARACTERS, CHARS, SKILL_Q_CD, SKILL_E_CD, splitSkillText } = require('../dist/data/CharacterDB');
const { makeMockGame, makePlayer } = require('./mockGame');
const { PlayerController } = require('../dist/entities/PlayerController');

test('炮击手Q为高爆弹(命中或落点半径90爆炸),R直飞2秒后加速并全场爆炸', () => {
    const kai = CHARACTERS.kai;
    const game = makeMockGame();
    const pool = [];
    game.bulletPool = { spawn: (cfg) => pool.push(cfg) };
    const p = makePlayer({ charId: 'kai', stats: { ...kai.stats }, applyBuff() {} });

    kai.qSkill(p, game);
    assert.equal(pool[0].radius, 18, 'Q弹头应为原12的1.5倍');
    assert.equal(pool[0].pierceLeft, 0, 'Q高爆弹不穿透,命中第一个目标即爆炸');
    assert.equal(pool[0].explodeOnExpire, true, 'Q命中或到达射程终点都会爆炸');
    assert.equal(pool[0].explodeRadius, 90, 'Q爆炸半径90');

    pool.length = 0;
    kai.ultimate(p, game);
    assert.equal(pool.length, 30, 'R应发射30发');
    // 2026-09-21 玩家调整：R炮弹沿弹道直飞不追踪（旧版360°散射+追踪转向跟不上弹速）
    assert.ok(pool.every(b => !b.homing), 'R弹头不追踪,沿发射弹道直飞');
    // 2026-08-26：R炮弹打不着怪不再消失——2秒后加速，命中/脱靶最终半径50爆炸
    assert.ok(pool.every(b => b.speedUpAfter === 2 && b.speedUpMult === 2), 'R弹头2秒后弹速翻倍');
    assert.ok(pool.every(b => b.explodeOnExpire === true && b.explodeRadius === 50), 'R弹头最终半径50爆炸');
    assert.ok(pool.every(b => b.lifeTime === 4), 'R弹头寿命延长到4秒(加速后仍有飞行时间)');
});

test('薇薇安被动砍掉永久炮台,只保留炮台词条加成×1.5', () => {
    const vivian = CHARACTERS.vivian;
    const game = makeMockGame();
    let turretSpawns = 0;
    game.spawnTurret = () => { turretSpawns++; };
    const p = makePlayer({ charId: 'vivian', stats: { ...vivian.stats } });

    vivian.passive(p, game);
    assert.equal(turretSpawns, 0, '被动应不再生成永久炮台');
    assert.equal(p.stats.turretBonus, 1.5, '炮台类词条效果×1.5保留');
    assert.equal(vivian.desc, '炮台类词条效果×1.5', '描述同步更新');
});

test('狂战士基础伤害为30,大招牺牲当前80%生命换3秒无敌+8秒攻速30%', () => {
    const reik = CHARACTERS.reik;
    assert.equal(reik.stats.damage, 30, '基础伤害调整为30');
    assert.equal(reik.ultCd, 20, '死亡意志冷却20秒');
    assert.equal(reik.eCd, 15, '血之护盾冷却15秒');

    const game = makeMockGame();
    const buffs = [];
    const p = makePlayer({
        charId: 'reik',
        hp: 200,
        stats: { ...reik.stats, lifestealRate: 0 },
        applyBuff(id, dur, mods) { buffs.push({ id, dur, mods }); },
    });
    reik.ultimate(p, game);
    const will = buffs.find(b => b.id === 'death_will');
    const frenzy = buffs.find(b => b.id === 'death_will_frenzy');
    assert.ok(will && frenzy, '无敌与攻速增益分两条buff挂载');
    assert.equal(will.dur, 3, '无敌3秒');
    assert.equal(will.mods.invincible, true, '保留无敌');
    assert.equal(frenzy.dur, 8, '攻速增益8秒');
    assert.equal(frenzy.mods.atkSpd, 1.3, '攻速+30%');
    assert.equal(frenzy.mods.lifestealRate, undefined, '大招不再附带吸血');
    assert.equal(p.hp, 40, '牺牲当前80%生命值(200→40)');
});

test('Q/E冷却常量与技能文案拆分：选人介绍与实际战斗共用一套数值', () => {
    assert.equal(SKILL_Q_CD, 4, 'Q技能基础冷却4秒');
    assert.equal(SKILL_E_CD, 10, 'E技能基础冷却10秒');
    // 全部角色的技能文案都能按「名称 — 说明」拆出两段
    for (const c of CHARS) {
        for (const slot of ['q', 'e', 'r']) {
            const [name, desc] = splitSkillText(c.skills[slot]);
            assert.ok(name.length > 0, `${c.id} ${slot} 应有技能名`);
            assert.ok(desc.length > 0, `${c.id} ${slot} 应有说明文字`);
            assert.ok(!name.includes('—'), `${c.id} ${slot} 名称不应残留破折号`);
        }
    }
});

test('死亡意志的45%吸血通过buff叠加进吸血结算', () => {
    const p = new PlayerController();
    p.stats = { maxHp: 200, armor: 0, _coreOverflow: false, lifestealRate: 0 };
    p.hp = 100;
    p.applyBuff('death_will', 4, { invincible: true, atkSpd: 1.5, lifestealRate: 0.45 });
    p.applyAttackLifesteal(100, { floatingText: { spawn() {} } });
    assert.ok(p.hp >= 145, '100实际伤害×45%应回45血(加上被动0则为45)');
});
