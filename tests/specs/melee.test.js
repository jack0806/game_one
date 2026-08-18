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
        x: 50, y: 0, radius: 10, alive: true,
        takeDamage(value) { damage = value; },
    };
    const game = makeMockGame({
        getNearestEnemy() { return enemy; },
        bulletPool: { spawn() { throw new Error('近战不应生成子弹'); } },
        augmentManager: { dispatchHit() { dispatched++; } },
    });

    player._shoot({ mouse: { x: 1, y: 0 } }, game);

    assert.equal(damage, CHARACTERS.reik.stats.damage);
    assert.equal(dispatched, 1);
});

test('远程角色普攻仍生成子弹', () => {
    const player = makeController('kai');
    let spawned = 0;
    const game = makeMockGame({
        getNearestEnemy() { return { x: 100, y: 0, radius: 10, alive: true }; },
        bulletPool: { spawn() { spawned++; } },
    });

    player._shoot({ mouse: { x: 100, y: 0 } }, game);

    assert.equal(spawned, 1);
});
