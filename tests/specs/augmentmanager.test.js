'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AugmentManager } = require('../dist/systems/AugmentManager');
const { AUGMENT_DB } = require('../dist/data/AugmentDB');
const { makeMockGame, makePlayer } = require('./mockGame');

test('rollOptions返回指定数量且不重复的词条(未满格场景)', () => {
    const am = new AugmentManager();
    const opts = am.rollOptions(3, 1);
    assert.equal(opts.length, 3);
    const ids = opts.map(o => o.id);
    assert.equal(new Set(ids).size, ids.length, '同一次roll不应出现重复词条id');
    for (const o of opts) assert.equal(o.tier, 1);
});

test('rollOptions低波次几乎不出金色词条(goldW<=0在wave<15时)', () => {
    const am = new AugmentManager();
    let sawGold = false;
    for (let i = 0; i < 200; i++) {
        const opts = am.rollOptions(3, 1);
        if (opts.some(o => o.rarity === 'gold')) sawGold = true;
    }
    assert.equal(sawGold, false, 'wave=1时goldWeight应为0,不应抽到金色');
});

test('rollOptions高波次(wave>=15)才可能出现金色词条', () => {
    const am = new AugmentManager();
    let sawGold = false;
    for (let i = 0; i < 500; i++) {
        const opts = am.rollOptions(3, 20);
        if (opts.some(o => o.rarity === 'gold')) { sawGold = true; break; }
    }
    assert.equal(sawGold, true, 'wave=20多次尝试应至少出现一次金色词条');
});

test('equip新词条:加入active数组并调用onEquip(mult=1)', () => {
    const am = new AugmentManager();
    const player = makePlayer();
    const game = makeMockGame();
    const aug = AUGMENT_DB.find(a => a.id === 'hp_up');
    const ok = am.equip(aug, player, game);
    assert.equal(ok, true);
    assert.equal(am.active.length, 1);
    assert.equal(player.stats.maxHp, 150); // 100+50
});

test('active满格(maxSlots)时equip新词条应失败返回false', () => {
    const am = new AugmentManager();
    am.maxSlots = 2;
    const player = makePlayer();
    const game = makeMockGame();
    am.equip(AUGMENT_DB[0], player, game);
    am.equip(AUGMENT_DB[1], player, game);
    assert.equal(am.active.length, 2);
    const ok = am.equip(AUGMENT_DB[2], player, game);
    assert.equal(ok, false, '满格后不应能再装备新词条');
    assert.equal(am.active.length, 2);
});

test('升级卡equip:找到已有同id词条并提升tier,调用onEquip(tierMult)', () => {
    const am = new AugmentManager();
    const player = makePlayer();
    const game = makeMockGame();
    const aug = AUGMENT_DB.find(a => a.id === 'hp_up');
    am.equip(aug, player, game); // tier1, +50
    const upgradeCard = am._makeUpgradeCard(am.active[0]);
    const ok = am.equip(upgradeCard, player, game);
    assert.equal(ok, true);
    assert.equal(am.active[0].tier, 2);
    // tier2 mult=0.8 → 再+50*0.8=40 → 100+50+40=190
    assert.equal(player.stats.maxHp, 190);
});

test('dispatchHit/dispatchKill/dispatchWaveStart/dispatchSkill 正确转发给拥有对应钩子的词条', () => {
    const am = new AugmentManager();
    const player = makePlayer();
    const game = makeMockGame();
    let hitCalled = false, killCalled = false, waveCalled = false, skillCalled = false;
    am.active.push({
        id: 'test', rarity: 'blue', icon: '', name: '', tags: [], desc: '',
        onHit() { hitCalled = true; },
        onKill() { killCalled = true; },
        onWaveStart() { waveCalled = true; },
        onSkill() { skillCalled = true; },
    });
    am.dispatchHit(player, {}, 10, game);
    am.dispatchKill(player, {}, 10, game);
    am.dispatchWaveStart(player, game);
    am.dispatchSkill(player, game);
    assert.ok(hitCalled && killCalled && waveCalled && skillCalled);
});

test('removeRandom在active为空时不抛错,不为空时移除一个', () => {
    const am = new AugmentManager();
    assert.doesNotThrow(() => am.removeRandom());
    am.active.push({ id: 'a' }, { id: 'b' });
    am.removeRandom();
    assert.equal(am.active.length, 1);
});

test('reset()恢复maxSlots=6并清空active', () => {
    const am = new AugmentManager();
    am.maxSlots = 10;
    am.active.push({ id: 'a' });
    am.reset();
    assert.equal(am.maxSlots, 6);
    assert.equal(am.active.length, 0);
});

test('被动chaosBonus:获得词条时额外随机装备一个(对齐graf描述),不会无限递归', () => {
    const am = new AugmentManager();
    const player = makePlayer({ stats: { chaosBonus: true, armor: 0 } });
    const game = makeMockGame();
    const aug = AUGMENT_DB.find(a => a.id === 'hp_up');
    const bonus = AUGMENT_DB.find(a => a.id === 'armor_up');
    am._rollOneFromPool = () => bonus;
    am.equip(aug, player, game);
    assert.deepEqual(am.active.map(a => a.id), ['hp_up', 'armor_up']);
});

test('被动chaosBonus:关闭时装备词条只增加1个,不触发额外随机', () => {
    const am = new AugmentManager();
    const player = makePlayer({ stats: { chaosBonus: false } });
    const game = makeMockGame();
    const aug = AUGMENT_DB.find(a => a.id === 'hp_up');
    am.equip(aug, player, game);
    assert.equal(am.active.length, 1, 'chaosBonus关闭时不应触发额外词条');
});

test('被动chaosBonus:已满格时额外触发的装备应静默失败,不抛错', () => {
    const am = new AugmentManager();
    am.maxSlots = 1;
    const player = makePlayer({ stats: { chaosBonus: true } });
    const game = makeMockGame();
    const aug = AUGMENT_DB.find(a => a.id === 'hp_up');
    assert.doesNotThrow(() => am.equip(aug, player, game));
    assert.equal(am.active.length, 1, '满格时即使chaosBonus生效也不应超过maxSlots');
});

test('AUGMENT_DB中50个词条id全部唯一', () => {
    const ids = AUGMENT_DB.map(a => a.id);
    assert.equal(new Set(ids).size, ids.length, '词条数据库中存在重复id');
});
