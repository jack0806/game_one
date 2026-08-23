'use strict';
// SaveSystem 存档与成就判定测试。
const test = require('node:test');
const assert = require('node:assert/strict');
const cc = require('cc');
const { SaveSystem, ACHIEVEMENTS } = require('../dist/systems/SaveSystem');

function freshProfile() {
    cc.sys.localStorage._clear();
    SaveSystem.resetCache();
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
    cc.sys.localStorage.setItem('hexblast_profile_v1', '{broken json!!');
    assert.doesNotThrow(() => SaveSystem.load());
    const p = SaveSystem.load();
    assert.equal(p.totalRuns, 0);
});

test('成就全集12个且id唯一', () => {
    assert.equal(ACHIEVEMENTS.length, 12);
    const ids = ACHIEVEMENTS.map(a => a.id);
    assert.equal(new Set(ids).size, ids.length);
});
