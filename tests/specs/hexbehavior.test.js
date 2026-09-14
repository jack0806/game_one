'use strict';
// 海克斯技能行为：不灭协议免死、制导蜂群/无人机计时、刷新定价与章节金币倍率
const test = require('node:test');
const assert = require('node:assert/strict');
const { AugmentManager } = require('../dist/systems/AugmentManager');
const { GOLD_STAGE_MULT, nextAugRefreshCost, Economy } = require('../dist/systems/Economy');
const { PlayerController } = require('../dist/entities/PlayerController');
const { makeMockGame, makePlayer } = require('./mockGame');

/** 用原型构造可跑 takeDamage 的最小玩家（不触引擎渲染路径）。 */
function makeRealPlayer() {
    const p = Object.create(PlayerController.prototype);
    p.alive = true; p.godMode = false;
    p._invincible = 0; p._iframeTimer = 0;
    p.x = 100; p.y = 100; p.radius = 16;
    p.stats = {
        maxHp: 100, armor: 0, maxShield: 0,
        hasHexGuard: true, _hexGuardShieldMult: 2, _hexGuardCd: 0,
    };
    p.hp = 100; p.shield = 0;
    p._tempShields = []; p._buffs = [];
    p.applyBuff = function (id, duration, mods) { this._buffs.push({ id, duration, mods }); };
    p.playVisualAction = () => true;
    p.beginDefeat = () => {};
    return p;
}

test('不灭协议：致命伤触发护盾+吸血并保底1滴血，75秒冷却内不重复触发', () => {
    const game = makeMockGame();
    const p = makeRealPlayer();

    p.takeDamage(200, game);   // 100-200 致命 → 触发
    assert.equal(p.alive, true, '致命伤被拦截');
    assert.equal(p.hp, 1, '保底剩 1 滴血');
    assert.equal(p.shield, 200, '2 倍最大生命护盾');
    assert.equal(p.stats._hexGuardCd, 75, '进入 75 秒冷却');
    assert.ok(p._buffs.find(b => b.id === 'hex_guard_lifesteal' && b.mods.lifestealRate === 0.25),
        '10 秒 25% 吸血增益');

    p.shield = 0;              // 护盾被打掉后冷却期内再次致命 → 死亡
    p._iframeTimer = 0;        // 跳过首次触发的受击无敌帧
    p.takeDamage(50, game);
    assert.equal(p.alive, false, '冷却期内不重复触发');
});

test('不灭协议：生命剩余1滴时受到任意伤害也触发（文档：致命伤或剩1滴血）', () => {
    const game = makeMockGame();
    const p = makeRealPlayer();
    p.hp = 1;                  // 已经只剩 1 滴
    p.takeDamage(1, game);
    assert.equal(p.alive, true);
    assert.equal(p.hp, 1);
    assert.ok(p.shield > 0);
});

test('制导蜂群（海克斯10）：每3秒按档位发射追踪导弹', () => {
    const am = new AugmentManager();
    const spawned = [];
    const game = makeMockGame();
    game.bullets = { spawn: (cfg) => spawned.push(cfg) };
    const p = makePlayer();

    am.equip({ id: 'hex10', level: 2 }, p, game);   // Lv2：2 枚 × 20 伤
    am.dispatchUpdate(p, 3.1, game);
    assert.equal(spawned.length, 2);
    assert.ok(spawned.every(b => b.homing === true && b.damage === 20));
});

test('猎杀无人机（海克斯13）：15秒召唤攻击无人机并受上限约束', () => {
    const am = new AugmentManager();
    const drones = [];
    const game = makeMockGame();
    game.spawnHexDrone = (_p, kind, level) => drones.push({ kind, level });
    const p = makePlayer();

    am.equip({ id: 'hex13', level: 3 }, p, game);
    am.dispatchUpdate(p, 3.1, game);   // 首次 3 秒即召唤一架
    assert.deepEqual(drones[0], { kind: 'attack', level: 3 });
    am.dispatchUpdate(p, 15.1, game);  // 之后每 15 秒一架（上限由 GameManager 内部裁剪）
    assert.equal(drones.length, 2);
});

test('刷新定价：前3次5金币，之后每次溢价75%', () => {
    assert.equal(nextAugRefreshCost(0), 5);
    assert.equal(nextAugRefreshCost(1), 5);
    assert.equal(nextAugRefreshCost(2), 5);
    assert.equal(nextAugRefreshCost(3), 9);    // 5 × 1.75
    assert.equal(nextAugRefreshCost(4), 15);   // 5 × 1.75²
    assert.equal(nextAugRefreshCost(5), 27);   // 5 × 1.75³
});

test('章节金币倍率单调递增且第五章最高（越到后面爆率越高）', () => {
    for (let i = 1; i < GOLD_STAGE_MULT.length; i++) {
        assert.ok(GOLD_STAGE_MULT[i] > GOLD_STAGE_MULT[i - 1], `第${i + 1}章应高于第${i}章`);
    }
    assert.equal(GOLD_STAGE_MULT.length, 5);
});

test('点金手乘区作用于 Economy.addGold', () => {
    const eco = new Economy();
    eco.addGold(100);
    assert.equal(eco.gold, 100);
    eco.gainMult = 1.5;      // 海克斯16 Lv1
    eco.addGold(100);
    assert.equal(eco.gold, 250);
    assert.equal(eco.earnedThisRun, 250);
});
