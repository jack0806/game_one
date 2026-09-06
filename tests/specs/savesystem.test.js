'use strict';
// SaveSystem 多槽存档与成就判定测试。
const test = require('node:test');
const assert = require('node:assert/strict');
const cc = require('cc');
const { SaveSystem, ACHIEVEMENTS } = require('../dist/systems/SaveSystem');

function freshProfile() {
    cc.sys.localStorage._clear();
    SaveSystem.resetCache();
    SaveSystem.selectSlot(0);
}

test('空档案:load返回全零初始值并可安全recordRun', () => {
    freshProfile();
    const p = SaveSystem.load();
    assert.equal(p.totalRuns, 0);
    assert.equal(p.achievements.length, 0);
    const unlocked = SaveSystem.recordRun({
        charId: 'kai', chapter: 1, wave: 3, kills: 40, bossKills: 0,
        goldEarned: 500, maxCombo: 22, augmentCount: 2, won: false,
    });
    const p2 = SaveSystem.load();
    assert.equal(p2.totalRuns, 1);
    assert.equal(p2.totalKills, 40);
    assert.equal(p2.bestChapter, 1);
    assert.equal(p2.bestCombo, 22);
    assert.deepEqual(p2.charsPlayed, ['kai']);
    // 首次写入应补齐档案时间戳（存档选择页显示"最后游玩"用）
    assert.ok(p2.createdAt > 0, 'createdAt 应在首次 recordRun 后补齐');
    assert.ok(p2.updatedAt >= p2.createdAt);
    // 第一局应解锁"初次出击"，且累计击杀40未达百人斩
    assert.ok(unlocked.some(a => a.id === 'first_run'));
    assert.ok(!unlocked.some(a => a.id === 'kills_100'));
});

test('recordRun累计跨局并按最大值更新纪录字段', () => {
    freshProfile();
    SaveSystem.recordRun({ charId: 'kai', chapter: 2, wave: 8, kills: 60, bossKills: 1,
        goldEarned: 400, maxCombo: 30, augmentCount: 3, won: false });
    SaveSystem.recordRun({ charId: 'reik', chapter: 1, wave: 4, kills: 45, bossKills: 2,
        goldEarned: 300, maxCombo: 55, augmentCount: 6, won: true });
    const p = SaveSystem.load();
    assert.equal(p.totalRuns, 2);
    assert.equal(p.totalWins, 1);
    assert.equal(p.totalKills, 105);
    assert.equal(p.bossKills, 3);
    assert.equal(p.totalGoldEarned, 700);
    assert.equal(p.bestChapter, 2, '最远章节取历史最大');
    assert.equal(p.bestCombo, 55);
    assert.equal(p.bestAugmentCount, 6);
    assert.equal(p.bestKillsInRun, 60);
    assert.deepEqual(p.charsPlayed, ['kai', 'reik'], '角色使用记录去重追加');
});

test('成就判定:累计击杀到100时解锁百人斩', () => {
    freshProfile();
    SaveSystem.recordRun({ charId: 'kai', chapter: 1, wave: 5, kills: 99, bossKills: 0,
        goldEarned: 0, maxCombo: 0, augmentCount: 0, won: false });
    assert.ok(!SaveSystem.isUnlocked(ACHIEVEMENTS.find(a => a.id === 'kills_100')));
    const unlocked = SaveSystem.recordRun({ charId: 'kai', chapter: 1, wave: 5, kills: 5, bossKills: 0,
        goldEarned: 0, maxCombo: 0, augmentCount: 0, won: false });
    assert.ok(SaveSystem.isUnlocked(ACHIEVEMENTS.find(a => a.id === 'kills_100')));
    assert.ok(unlocked.some(a => a.id === 'kills_100'), '当次解锁的成就应出现在返回列表');
});

test('存档持久化:重新load(清缓存)后数据仍在', () => {
    freshProfile();
    SaveSystem.recordRun({ charId: 'olia', chapter: 3, wave: 12, kills: 10, bossKills: 1,
        goldEarned: 50, maxCombo: 8, augmentCount: 1, won: false });
    SaveSystem.resetCache(); // 模拟下次启动游戏
    const p = SaveSystem.load();
    assert.equal(p.totalRuns, 1);
    assert.equal(p.bestChapter, 3);
    assert.ok(p.achievements.indexOf('chapter_2') >= 0, '到达第3章应已解锁初入混沌');
});

test('损坏存档容错:非法JSON回退空白档案不抛错', () => {
    freshProfile();
    cc.sys.localStorage.setItem(SaveSystem.slotKey(0), '{broken json!!');
    assert.doesNotThrow(() => SaveSystem.load());
    const p = SaveSystem.load();
    assert.equal(p.totalRuns, 0);
});

test('多存档槽:各槽独立读写,selectSlot切换后互不串档', () => {
    freshProfile();
    // 1号槽(0-based 0)：两局击杀105
    SaveSystem.recordRun({ charId: 'kai', chapter: 2, wave: 8, kills: 60, bossKills: 1,
        goldEarned: 400, maxCombo: 30, augmentCount: 3, won: false });
    SaveSystem.recordRun({ charId: 'reik', chapter: 1, wave: 4, kills: 45, bossKills: 2,
        goldEarned: 300, maxCombo: 55, augmentCount: 6, won: true });
    // 2号槽(0-based 1)：一局击杀40
    SaveSystem.selectSlot(1);
    SaveSystem.recordRun({ charId: 'kai', chapter: 1, wave: 3, kills: 40, bossKills: 0,
        goldEarned: 500, maxCombo: 22, augmentCount: 2, won: false });

    const p0 = (SaveSystem.selectSlot(0), SaveSystem.load());
    assert.equal(p0.totalKills, 105, '1号槽累计不受2号槽影响');
    assert.equal(p0.totalRuns, 2);
    const p1 = (SaveSystem.selectSlot(1), SaveSystem.load());
    assert.equal(p1.totalKills, 40, '2号槽只有自己的那一局');
    assert.equal(p1.totalRuns, 1);
    assert.equal(SaveSystem.currentSlot(), 1);
    // 3号槽从未写过：load回空白档案，不抛错
    SaveSystem.selectSlot(2);
    assert.equal(SaveSystem.load().totalRuns, 0);
});

test('listSlots返回3个槽概览,exists与profile内容准确', () => {
    freshProfile();
    SaveSystem.recordRun({ charId: 'kai', chapter: 2, wave: 8, kills: 60, bossKills: 1,
        goldEarned: 400, maxCombo: 30, augmentCount: 3, won: false });
    const slots = SaveSystem.listSlots();
    assert.equal(slots.length, SaveSystem.SLOT_COUNT);
    assert.equal(slots[0].exists, true);
    assert.equal(slots[0].profile.totalRuns, 1);
    assert.equal(slots[1].exists, false, '未写入的槽视为空槽');
    assert.equal(slots[1].profile, null);
    assert.equal(slots[2].exists, false);
    // listSlots只读存储，不改变当前选中槽
    assert.equal(SaveSystem.currentSlot(), 0);
    assert.equal(SaveSystem.load().totalRuns, 1);
});

test('deleteSlot删除指定槽,当前槽被删后load回空白档案', () => {
    freshProfile();
    SaveSystem.selectSlot(1);
    SaveSystem.recordRun({ charId: 'kai', chapter: 1, wave: 3, kills: 40, bossKills: 0,
        goldEarned: 0, maxCombo: 0, augmentCount: 0, won: false });
    assert.ok(SaveSystem.listSlots()[1].exists);
    SaveSystem.deleteSlot(1);
    assert.equal(SaveSystem.listSlots()[1].exists, false, '删除后槽位概览为空');
    assert.equal(SaveSystem.load().totalRuns, 0, '当前槽被删：缓存失效后回空白档案');
});

test('旧单档案迁移:legacy档案在所有槽为空时迁入1号槽,且只迁一次', () => {
    freshProfile();
    const legacy = { version: 1, totalRuns: 7, totalKills: 500, bestChapter: 3, achievements: ['first_run'] };
    cc.sys.localStorage.setItem('hexblast_profile_v1', JSON.stringify(legacy));
    SaveSystem.migrateLegacyProfile();
    const slots = SaveSystem.listSlots();
    assert.equal(slots[0].exists, true, '旧档应迁入1号槽');
    assert.equal(slots[0].profile.totalRuns, 7);
    assert.equal(slots[0].profile.totalKills, 500);
    assert.deepEqual(slots[0].profile.achievements, ['first_run']);
    assert.equal(slots[1].exists, false, '其余槽不受迁移影响');

    // 迁移后1号槽已有数据：再次调用不会用旧档覆盖
    const after = JSON.parse(cc.sys.localStorage.getItem(SaveSystem.slotKey(0)));
    after.totalRuns = 99;
    cc.sys.localStorage.setItem(SaveSystem.slotKey(0), JSON.stringify(after));
    SaveSystem.migrateLegacyProfile();
    assert.equal(SaveSystem.listSlots()[0].profile.totalRuns, 99, '槽位已有数据时跳过迁移');

    // 任一槽已有数据时，即使legacy存在也不迁移（换新设备带脏数据的场景）
    cc.sys.localStorage._clear();
    cc.sys.localStorage.setItem(SaveSystem.slotKey(2), '{"totalRuns":3}');
    cc.sys.localStorage.setItem('hexblast_profile_v1', JSON.stringify(legacy));
    SaveSystem.migrateLegacyProfile();
    assert.equal(SaveSystem.listSlots()[0].exists, false, '已有槽位数据时旧档不再迁移');
});

test('成就全集12个且id唯一', () => {
    assert.equal(ACHIEVEMENTS.length, 12);
    const ids = ACHIEVEMENTS.map(a => a.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const a of ACHIEVEMENTS) {
        assert.ok(a.artKey && a.reward, `${a.id} 应提供成就图片与奖励预览`);
        assert.ok(['普通', '稀有', '史诗', '传奇'].includes(a.rarity));
        assert.ok(['挑战', '探索', '收集'].includes(a.category));
    }
});
