'use strict';
// 角色技能调整（炮击手/薇薇安/狂战士）行为单测
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHARACTERS, CHARS, SKILL_Q_CD, SKILL_E_CD, splitSkillText } = require('../dist/data/CharacterDB');
const { makeMockGame, makePlayer } = require('./mockGame');
const { PlayerController } = require('../dist/entities/PlayerController');

test('炮击手Q弹头放大50%(radius 18),R弹头全部自动追踪', () => {
    const kai = CHARACTERS.kai;
    const game = makeMockGame();
    const pool = [];
    game.bulletPool = { spawn: (cfg) => pool.push(cfg) };
    const p = makePlayer({ charId: 'kai', stats: { ...kai.stats }, applyBuff() {} });

    kai.qSkill(p, game);
    assert.equal(pool[0].radius, 18, 'Q弹头应为原12的1.5倍');
    assert.equal(pool[0].pierceLeft, 999, 'Q仍为超大穿透弹');

    pool.length = 0;
    kai.ultimate(p, game);
    assert.equal(pool.length, 30, 'R应发射30发');
    assert.ok(pool.every(b => b.homing === true), 'R弹头全部自动追踪敌人');
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

test('狂战士基础伤害为40,大招4秒无敌+45%吸血+50%攻速且仍牺牲半血', () => {
    const reik = CHARACTERS.reik;
    assert.equal(reik.stats.damage, 40, '基础伤害加到40');

    const game = makeMockGame();
    let buff = null;
    const p = makePlayer({
        charId: 'reik',
        hp: 200,
        stats: { ...reik.stats, lifestealRate: 0 },
        applyBuff(id, dur, mods) { buff = { id, dur, mods }; },
    });
    reik.ultimate(p, game);
    assert.ok(buff, '应施加死亡意志buff');
    assert.equal(buff.id, 'death_will');
    assert.equal(buff.dur, 4, '大招时长4秒');
    assert.equal(buff.mods.invincible, true, '保留无敌');
    assert.equal(buff.mods.lifestealRate, 0.45, '增加45%伤害吸血');
    assert.equal(buff.mods.atkSpd, 1.5, '增加50%攻速');
    assert.equal(p.hp, 100, '仍牺牲半血');
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
