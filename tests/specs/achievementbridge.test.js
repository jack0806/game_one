// ============================================================
//  achievementbridge.test.js — 成就桥接跨局安全（2026-11-12 购买失败根因回归）
//  根因：AugmentManager 等跨局单例的 equip 包装闭包捕获第一局 player；
//  第一局结束玩家销毁（Cocos destroy 将组件属性置 null）后，第二局购买强化
//  在包装层读 player.stats.armor 抛 TypeError——金币已扣而 equip 本体未执行。
// ============================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { AugmentManager } = require('../dist/systems/AugmentManager');
const { AchievementTracker } = require('../dist/systems/AchievementTracker');
const { bindAchievementGame } = require('../dist/systems/AchievementGameBridge');
const { freshAchievementStats } = require('../dist/data/AchievementDB');

function makeGame() {
    const game = {
        state: 'playing', wave: 1, enemies: [], turrets: [], achievementIncoming: '',
        runId: 0, comboCount: 0,
        bulletPool: { spawn: (c) => c, updateEnemyBullets() {} },
        _augUI: { show() {} },
        _persistAchievementProgress() {},
        _player: null,
    };
    Object.defineProperty(game, 'player', { get() { return game._player; } });
    const am = new AugmentManager();
    game.augmentManager = am;
    return game;
}

const mkPlayer = (hero) => ({
    x: 0, y: 0, alive: true, hp: 100, shield: 0,
    stats: { maxHp: 100, damage: 20, armor: 0 },
    _charDef: { id: hero, qSkill() {}, eSkill() {}, ultimate() {} },
    heal() {}, grantTempShield() {},
});

function startRun(game, hero) {
    game._player = mkPlayer(hero);
    game.achievementTracker = new AchievementTracker({
        hero, chapter: 1, difficulty: 'normal', equipment: [],
        stats: JSON.parse(JSON.stringify(freshAchievementStats())),
    });
    bindAchievementGame(game);
}

test('跨局安全:第一局玩家销毁(stats被引擎置null)后,第二局购买强化不再抛错', () => {
    const game = makeGame();
    const am = game.augmentManager;

    // 第一局：正常购买（此时 equip 包装闭包捕获第一局 player）
    startRun(game, 'kai');
    const p1 = game._player;
    assert.equal(am.equip({ id: 'hex01', level: 1, _price: 10 }, p1, game), true, '第一局购买正常');

    // 第一局结束：模拟 Cocos destroy 把玩家组件属性置 null（真实引擎行为）
    p1.stats = null;

    // 第二局：新玩家 + 新 tracker；am 为同一实例（wrap 幂等，不会重新包裹）
    startRun(game, 'via');
    const p2 = game._player;
    let threw = null;
    try {
        assert.equal(am.equip({ id: 'hex02', level: 1, _price: 10 }, p2, game), true, '第二局购买应成功');
    } catch (e) { threw = e.message; }
    assert.ok(!threw, '第二局购买不得抛错（金币已扣强化未入列的根因）: ' + threw);
    assert.ok(am.all().some(a => a.id === 'hex02'), '第二局强化应已入列');
});

test('跨局安全:第一局玩家销毁后,元素海克斯命中分发(dispatchHit)不再抛错', () => {
    const game = makeGame();
    const am = game.augmentManager;
    startRun(game, 'kai');
    am.equip({ id: 'hex21', level: 1 }, game._player, game);   // 火元素 onHit
    game._player.stats = null;                                  // 模拟销毁

    startRun(game, 'kai');                                      // 第二局
    const enemy = { x: 100, y: 0, alive: true, dead: false, hp: 100, maxHp: 100,
        dots: [], radius: 10, taken: [], takeDamage(d) { this.taken.push(d); return d; } };
    game.enemies = [enemy];
    let threw = null;
    try {
        am.dispatchHit(game._player, enemy, 50, game);
    } catch (e) { threw = e.message; }
    assert.ok(!threw, '命中分发不得抛错: ' + threw);
});
