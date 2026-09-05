'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PlayerController } = require('../dist/entities/PlayerController');
const { CHARACTERS } = require('../dist/data/CharacterDB');
const { makeMockGame } = require('./mockGame');

function makeController(charId) {
    const player = new PlayerController();
    player.x = 0;
    player.y = 0;
    player.radius = 16;
    player.alive = true;
    player.charId = charId;
    player.spriteKey = 'char_token_' + charId;
    player._charDef = CHARACTERS[charId];
    player.stats = {
        ...CHARACTERS[charId].stats,
        extraBullets: 0,
        bulletBounce: 0,
        barrageMode: false,
        novaMode: false,
        allInBullets: 0,
        goldPickupRange: 60,
        cdReduction: 0,
        ultChargeRate: 1,
        eliteBonus: 0,
        critRate: 0,
        maxAugments: 6,
        previewAugments: false,
        phaseDash: false,
        freezeBonus: 0,
    };
    return player;
}

test('狂战士近战普攻命中近处敌人且不生成远程子弹', () => {
    const player = makeController('reik');
    let damage = 0;
    let dispatched = 0;
    const enemy = {
        x: 0, y: 50, radius: 10, alive: true,
        takeDamage(value) { damage = value; },
    };
    const game = makeMockGame({
        getNearestEnemy() { return enemy; },
        bulletPool: { spawn() { throw new Error('近战不应生成子弹'); } },
        augmentManager: { dispatchHit() { dispatched++; } },
    });

    player._shoot({ mouse: { x: 1, y: 0 } }, game);
    assert.equal(damage, 0, '抬斧前摇不能提前扣血');
    player.updateVisualAnimation(0.05);
    player.updateVisualAnimation(0.02);
    assert.equal(damage, CHARACTERS.reik.stats.damage);
    assert.equal(dispatched, 1);
});

test('远程角色普攻在动作开火帧生成子弹', () => {
    const player = makeController('kai');
    let spawned = 0;
    const game = makeMockGame({
        getNearestEnemy() { return { x: 100, y: 0, radius: 10, alive: true }; },
        bulletPool: { spawn() { spawned++; } },
    });

    player._shoot({ mouse: { x: 100, y: 0 } }, game);
    assert.equal(spawned, 0, '瞄准前摇不能提前出弹');
    player.updateVisualAnimation(0.05);
    player.updateVisualAnimation(0.02);
    assert.equal(spawned, 1);
});

test('挥斧前摇后目标离开范围或绕到身后只播放挥击，不隔空扣血', () => {
    for (const targetY of [1000, -50]) {
        const player = makeController('reik');
        let damage = 0, slashes = 0;
        const enemy = { x: 0, y: 50, radius: 10, alive: true, takeDamage() { damage++; } };
        const game = makeMockGame({ getNearestEnemy: () => enemy });
        game.particles.reikCleave = () => slashes++;
        player._shoot({ mouse: enemy }, game);
        enemy.y = targetY;
        player.updateVisualAnimation(0.05); player.updateVisualAnimation(0.02);
        assert.equal(damage, 0);
        assert.equal(slashes, 1, '挥空时动作和刃光仍完成');
    }
});

test('受击打断挥斧前摇后不再结算伤害或补播刃光', () => {
    const player = makeController('reik');
    let damage = 0, slashes = 0;
    const enemy = { x: 0, y: 50, radius: 10, alive: true, takeDamage() { damage++; } };
    const game = makeMockGame({ getNearestEnemy: () => enemy });
    game.particles.reikCleave = () => slashes++;
    player._shoot({ mouse: enemy }, game);
    player.playVisualAction('hit');
    for (let i = 0; i < 12; i++) player.updateVisualAnimation(0.05);
    assert.equal(damage, 0);
    assert.equal(slashes, 0);
});
