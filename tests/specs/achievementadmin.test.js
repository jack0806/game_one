'use strict';
// 后台成就管理（AchievementAdmin）+ 合并列表（SaveSystem.allAchievements）单测：
// 覆盖/下架/自建/删除/分类扩展，合并列表驱动展示与判定，改动即生效。
const test = require('node:test');
const assert = require('node:assert/strict');
const { AchievementAdmin, DEFAULT_ACHIEVEMENT_CATEGORIES } = require('../dist/systems/AchievementAdmin');
const SaveSystem = require('../dist/systems/SaveSystem').SaveSystem;
const { ACHIEVEMENT_STAT_FIELDS } = require('../dist/systems/SaveSystem');

function makeStorage() {
    const map = new Map();
    return {
        getItem: k => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: k => map.delete(k),
    };
}

function fresh() {
    AchievementAdmin.storage = makeStorage();
    AchievementAdmin.resetAll();
    AchievementAdmin._reloadForTest();
}

test('默认分类三类恒在,可新增自建分类(重名/空名拒绝)', () => {
    fresh();
    assert.deepEqual(AchievementAdmin.categories(), DEFAULT_ACHIEVEMENT_CATEGORIES);
    assert.ok(AchievementAdmin.addCategory('剧情'), '新增分类成功');
    assert.ok(AchievementAdmin.categories().includes('剧情'));
    assert.equal(AchievementAdmin.addCategory('剧情'), false, '重名拒绝');
    assert.equal(AchievementAdmin.addCategory('  '), false, '空名拒绝');
    // 默认三类重读不丢
    AchievementAdmin._reloadForTest();
    assert.deepEqual(AchievementAdmin.categories().slice(0, 3), DEFAULT_ACHIEVEMENT_CATEGORIES);
});

test('内置成就覆盖:改目标/文案/稀有度即时生效,不下架不影响其他', () => {
    fresh();
    const before = SaveSystem.allAchievements().find(a => a.id === 'kills_100');
    assert.ok(before, '静态成就存在');
    assert.equal(before.goal, 100);
    AchievementAdmin.setOverride('kills_100', { goal: 1000, name: '千人斩' });
    const after = SaveSystem.allAchievements().find(a => a.id === 'kills_100');
    assert.equal(after.goal, 1000);
    assert.equal(after.name, '千人斩');
    assert.equal(after.category, '挑战', '未覆盖字段沿用静态定义');
    // 不存在的 id 覆盖不产生幽灵条目
    AchievementAdmin.setOverride('ghost', { goal: 1 });
    assert.equal(SaveSystem.allAchievements().some(a => a.id === 'ghost'), false);
});

test('下架:retired 从合并列表隐藏,恢复后回到列表', () => {
    fresh();
    AchievementAdmin.setOverride('joker_doll', { retired: true });
    assert.equal(SaveSystem.allAchievements().some(a => a.id === 'joker_doll'), false, '下架即隐藏');
    AchievementAdmin.setOverride('joker_doll', { retired: false });
    assert.ok(SaveSystem.allAchievements().some(a => a.id === 'joker_doll'), '恢复可见');
});

test('自建成就:白名单统计字段驱动进度,非法字段恒 0,可删除', () => {
    fresh();
    const created = AchievementAdmin.addCustom({
        name: '击杀百人', desc: '累计击杀 100', category: '挑战', rarity: '普通',
        statField: 'totalKills', goal: 100, reward: '核心币 × 100', rewardCoins: 100,
    });
    assert.ok(created.id, '自动生成 id');
    const def = SaveSystem.allAchievements().find(a => a.id === created.id);
    assert.ok(def, '自建成就进入合并列表');
    assert.equal(def.progress({ totalKills: 150 }), 150, '进度读白名单字段');
    AchievementAdmin.updateCustom(created.id, { goal: 200 });
    assert.equal(SaveSystem.allAchievements().find(a => a.id === created.id).goal, 200);
    AchievementAdmin.deleteCustom(created.id);
    assert.equal(SaveSystem.allAchievements().some(a => a.id === created.id), false, '自建可删除');

    // 非法 statField：进度恒 0，永不解锁
    const bad = AchievementAdmin.addCustom({
        name: '坏字段', desc: '', category: '挑战', rarity: '普通',
        statField: 'not_a_field', goal: 1, reward: '',
    });
    const badDef = SaveSystem.allAchievements().find(a => a.id === bad.id);
    assert.equal(badDef.progress({ totalKills: 999 }), 0);
});

test('进度来源白名单全部可读(以空档案验证返回数值)', () => {
    fresh();
    const empty = {
        totalRuns: 1, totalWins: 2, totalKills: 3, bossKills: 4, chaptersCleared: 5,
        bestWave: 6, totalGoldEarned: 7, bestCombo: 8, bestAugmentCount: 9,
        bestKillsInRun: 10, charsPlayed: ['a', 'b'], coreCoins: 11,
        equipments: [{}, {}], jokerDolls: 12,
    };
    for (const f of ACHIEVEMENT_STAT_FIELDS) {
        assert.equal(typeof f.read(empty), 'number', `${f.key} 可读`);
        assert.ok(f.label.length > 0, `${f.key} 有展示名`);
    }
});

test('resetAll 清空覆盖与自建,分类回到默认', () => {
    fresh();
    AchievementAdmin.setOverride('kills_100', { goal: 999 });
    AchievementAdmin.addCategory('剧情');
    AchievementAdmin.resetAll();
    assert.equal(SaveSystem.allAchievements().find(a => a.id === 'kills_100').goal, 100);
    assert.deepEqual(AchievementAdmin.categories(), DEFAULT_ACHIEVEMENT_CATEGORIES);
});

test('成就判定走合并列表:覆盖 goal 后提前解锁且核心币奖励入档', () => {
    fresh();
    // 直接用 AchievementAdmin 覆盖一个容易判定的成就再跑 checkAchievements
    AchievementAdmin.setOverride('first_run', { rewardCoins: 55 });
    // 选一个当前档案必然达成的路径：先造档案记录
    const summary = {
        charId: 'kai', chapter: 1, wave: 15, kills: 1, bossKills: 0,
        goldEarned: 0, maxCombo: 0, augmentCount: 0, won: false,
    };
    // 选择槽位 1（headless 下 SaveSystem 走 sys.localStorage stub？——
    // cc 桩的 sys.localStorage 由 tests/stubs/cc 提供,直接调用即可）
    SaveSystem.selectSlot(1);
    const unlocked = SaveSystem.recordRun(summary);
    const firstRun = unlocked.find(a => a.id === 'first_run');
    assert.ok(firstRun, '完成一局解锁 first_run');
    assert.equal(SaveSystem.coreCoins(), 55, 'rewardCoins 解锁同帧入档');
    // 再跑一次不重复发（已解锁不再判定）
    SaveSystem.recordRun(summary);
    assert.equal(SaveSystem.coreCoins(), 55, '防重复发放');
    SaveSystem.selectSlot(0);
});
