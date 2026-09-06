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

test('角色亲和词条权重会影响抽取结果', () => {
    const am = new AugmentManager();
    const plain = { id: 'plain', rarity: 'blue', affinity: [] };
    const vivian = { id: 'vivian', rarity: 'blue', affinity: ['vivian'] };
    const originalRandom = Math.random;
    Math.random = () => 0.4;
    try {
        const picked = am._rollOneFromPool([plain, vivian], { blue: 1 }, 'vivian');
        assert.equal(picked.id, 'vivian', '固定随机值下应优先落到工程师亲和词条');
        const unweighted = am._rollOneFromPool([plain, vivian], { blue: 1 });
        assert.equal(unweighted.id, 'plain', '未指定角色时应按普通均匀权重抽取');
    } finally {
        Math.random = originalRandom;
    }
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

test('active满格(maxSlots)时equip新词条改为替换最旧词条(FIFO),返回true', () => {
    const am = new AugmentManager();
    am.maxSlots = 2;
    const player = makePlayer();
    const game = makeMockGame();
    const texts = [];
    game.floatingText = { spawn: (x, y, text) => texts.push(text) };
    am.equip(AUGMENT_DB[0], player, game);
    am.equip(AUGMENT_DB[1], player, game);
    assert.equal(am.active.length, 2);
    const ok = am.equip(AUGMENT_DB[2], player, game);
    // 旧版这里静默return false：玩家选了新词条不生效也不进M面板(用户反馈的bug)。
    // 现在满员时替换最早装备的词条，新选择一定生效。
    assert.equal(ok, true, '满格后装备新词条应通过替换最旧词条成功');
    assert.equal(am.active.length, 2, '替换后词条数不应超过maxSlots');
    assert.deepEqual(am.active.map(a => a.id), [AUGMENT_DB[1].id, AUGMENT_DB[2].id],
        '最早装备的词条应被替换掉');
    assert.equal(texts.length, 1, '替换时应给出一条浮字提示');
    assert.ok(texts[0].includes(AUGMENT_DB[0].name) && texts[0].includes(AUGMENT_DB[2].name),
        '浮字应同时提及被换下与换上的词条名');
});

test('rollOptions不再刷出已装备的词条(强化走升级卡,避免M面板出现重复行)', () => {
    const am = new AugmentManager();
    const player = makePlayer();
    const game = makeMockGame();
    // 装备两个不同词条（选无onEquip副作用的，避免污染player stats断言）
    const first = AUGMENT_DB.find(a => a.id === 'combo_dmg');
    const second = AUGMENT_DB.find(a => a.id === 'elite_hunt');
    am.equip(first, player, game);
    am.equip(second, player, game);
    for (let i = 0; i < 200; i++) {
        const opts = am.rollOptions(3, 20); // 高波次让所有稀有度都可能出现
        for (const o of opts) {
            assert.ok(o.id !== first.id && o.id !== second.id,
                `已装备的词条(${o.id})不应再次出现在候选里`);
        }
    }
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

// ---- 黑洞引擎(2026-09-07重做:定时自动施放,不再替换E技能) ----------

test('黑洞引擎:装备不改写E技能,每5秒自动在最密敌群处生成黑洞', () => {
    const am = new AugmentManager();
    const def = AUGMENT_DB.find(a => a.id === 'black_hole');
    const p = makePlayer();
    const spawned = [];
    const game = makeMockGame({
        getEnemyClusterPoint: () => ({ x: 100, y: 200 }),
        spawnAutoBlackHole(pl, mult) { spawned.push({ pl, mult }); return true; },
    });
    am.equip(def, p, game);
    // 重做后不再替换 E 技能：stats 不应再被打上 eSkillUpgrade 标记
    assert.equal(p.stats.eSkillUpgrade, undefined, '黑洞引擎不得改写E技能');
    assert.equal(spawned.length, 0, '装备后立即不应施放');
    // 前5秒不施放（推进4.9秒）
    for (let i = 0; i < 49; i++) am.dispatchUpdate(p, 0.1, game);
    assert.equal(spawned.length, 0, '5秒周期未到不应施放');
    // 满5秒后施放一次，且传入玩家与升级倍率
    for (let i = 0; i < 11; i++) am.dispatchUpdate(p, 0.1, game); // 累计6秒
    assert.equal(spawned.length, 1, '满5秒应自动生成一个黑洞');
    assert.equal(spawned[0].pl, p, '应把玩家传给spawnAutoBlackHole(结算伤害用)');
    assert.equal(spawned[0].mult, 1, '1级词条倍率为1');
    // 再过5秒生成第二个（推进到11.5秒，避开恰好落在10.0秒边界的浮点误差）
    for (let i = 0; i < 55; i++) am.dispatchUpdate(p, 0.1, game); // 累计11.5秒
    assert.equal(spawned.length, 2, '周期5秒应再次生成');
});

test('黑洞引擎:场上没有敌人时不消耗周期,0.5秒后重试', () => {
    const am = new AugmentManager();
    const def = AUGMENT_DB.find(a => a.id === 'black_hole');
    const p = makePlayer();
    let calls = 0;
    const game = makeMockGame({
        spawnAutoBlackHole() { calls++; return false; }, // 模拟没有敌群可锚定
    });
    am.equip(def, p, game);
    for (let i = 0; i < 60; i++) am.dispatchUpdate(p, 0.1, game); // 6秒
    // 满5秒首次尝试后，每0.5秒重试一次：6秒内应有多次尝试而非只调一次
    assert.ok(calls >= 2, `无敌人期间应持续重试,实际尝试${calls}次`);
    assert.ok(calls <= 4, `重试间隔0.5秒,6秒内尝试次数应有限,实际${calls}次`);
});
