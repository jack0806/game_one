'use strict';
// 后台成就管理（AchievementAdmin）+ 合并列表（SaveSystem.allAchievements）单测：
// 覆盖/下架/自建/删除，合并列表驱动展示与判定，改动即生效。
// 2026-10-19 分类改版：分组统一走稀有度（普通/稀有/史诗/传奇），
// 挑战/探索/收集 分类体系已移除，自建成就 category 自动等于 rarity。
const test = require('node:test');
const assert = require('node:assert/strict');
const { AchievementAdmin } = require('../dist/systems/AchievementAdmin');
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

test('分类体系已移除:不再暴露分类列表与新建分类接口', () => {
    fresh();
    assert.equal(AchievementAdmin.categories, undefined, 'categories() 应已移除');
    assert.equal(AchievementAdmin.addCategory, undefined, 'addCategory() 应已移除');
});

test('内置成就覆盖:改目标/文案/稀有度即时生效,不下架不影响其他', () => {
    fresh();
    const before = SaveSystem.allAchievements().find(a => a.id === 'kills_100');
    assert.ok(before, '静态成就存在');
    assert.equal(before.goal, 1000, 'v5 静态档位千人斩=1000');
    AchievementAdmin.setOverride('kills_100', { goal: 5000, name: '千人斩+' });
    const after = SaveSystem.allAchievements().find(a => a.id === 'kills_100');
    assert.equal(after.goal, 5000);
    assert.equal(after.name, '千人斩+');
    assert.equal(after.category, '里程碑', '未覆盖字段沿用160项类型定义');
    // 不存在的 id 覆盖不产生幽灵条目
    AchievementAdmin.setOverride('ghost', { goal: 1 });
    assert.equal(SaveSystem.allAchievements().some(a => a.id === 'ghost'), false);
});

test('下架:retired 从合并列表隐藏,恢复后回到列表', () => {
    fresh();
    AchievementAdmin.setOverride('ach_148', { retired: true });
    assert.equal(SaveSystem.allAchievements().some(a => a.id === 'ach_148'), false, '下架即隐藏');
    AchievementAdmin.setOverride('ach_148', { retired: false });
    assert.ok(SaveSystem.allAchievements().some(a => a.id === 'ach_148'), '恢复可见');
});

test('自建成就:白名单统计字段驱动进度,category自动=rarity,非法字段恒 0,可删除', () => {
    fresh();
    const created = AchievementAdmin.addCustom({
        name: '击杀百人', desc: '累计击杀 100', rarity: '普通',
        statField: 'totalKills', goal: 100, reward: '核心币 × 100', rewardCoins: 100,
    });
    assert.ok(created.id, '自动生成 id');
    assert.equal(created.category, '普通', '自建 category 自动等于稀有度');
    const def = SaveSystem.allAchievements().find(a => a.id === created.id);
    assert.ok(def, '自建成就进入合并列表');
    assert.equal(def.category, '普通');
    assert.equal(def.progress({ totalKills: 150 }), 150, '进度读白名单字段');
    AchievementAdmin.updateCustom(created.id, { goal: 200, rarity: '史诗' });
    const updated = SaveSystem.allAchievements().find(a => a.id === created.id);
    assert.equal(updated.goal, 200);
    assert.equal(updated.category, '史诗', '改稀有度后 category 跟随');
    AchievementAdmin.deleteCustom(created.id);
    assert.equal(SaveSystem.allAchievements().some(a => a.id === created.id), false, '自建可删除');

    // 非法 statField：进度恒 0，永不解锁
    const bad = AchievementAdmin.addCustom({
        name: '坏字段', desc: '', rarity: '稀有',
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

test('resetAll 清空覆盖与自建', () => {
    fresh();
    AchievementAdmin.setOverride('kills_100', { goal: 999 });
    AchievementAdmin.addCustom({
        name: '临时', desc: '', rarity: '普通',
        statField: 'totalKills', goal: 1, reward: '',
    });
    AchievementAdmin.resetAll();
    assert.equal(SaveSystem.allAchievements().find(a => a.id === 'kills_100').goal, 1000);
    assert.equal(AchievementAdmin.custom().length, 0, '自建成就一并清空');
});

test('成就判定走合并列表:覆盖 goal 后提前解锁且核心币奖励入档', () => {
    fresh();
    // 直接用 AchievementAdmin 覆盖一个容易判定的成就再跑 checkAchievements
    AchievementAdmin.setOverride('first_run', { rewardCoins: 55 });
    // 选一个当前档案必然达成的路径：先造档案记录。
    // 期望值动态汇总：同帧级联解锁（如 first_run 的奖励入账立即满足 core_1
    // "首次获得核心币"）是设计内行为，总额 = 本次解锁条目的 rewardCoins 之和。
    const summary = {
        charId: 'kai', chapter: 1, wave: 3, kills: 1, bossKills: 0,
        goldEarned: 0, maxCombo: 0, augmentCount: 0, won: false,
    };
    // 选择槽位 1（headless 下 SaveSystem 走 sys.localStorage stub？——
    // cc 桩的 sys.localStorage 由 tests/stubs/cc 提供,直接调用即可）
    SaveSystem.selectSlot(1);
    const unlocked = SaveSystem.recordRun(summary);
    const firstRun = unlocked.find(a => a.id === 'first_run');
    assert.ok(firstRun, '完成一局解锁 first_run');
    const expected = unlocked.reduce((s, a) => s + (a.rewardCoins ?? 0), 0);
    assert.ok(expected >= 55, 'first_run 覆盖后的 55 应计入总额');
    assert.equal(SaveSystem.coreCoins(), expected, 'rewardCoins 解锁同帧入档');
    // 再跑一次不重复发（已解锁不再判定）
    SaveSystem.recordRun(summary);
    assert.equal(SaveSystem.coreCoins(), expected, '防重复发放');
    SaveSystem.selectSlot(0);
});
