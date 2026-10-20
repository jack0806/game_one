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

test('成就判定:累计击杀到1000时解锁千人斩(v5档位)', () => {
    freshProfile();
    SaveSystem.recordRun({ charId: 'kai', chapter: 1, wave: 5, kills: 999, bossKills: 0,
        goldEarned: 0, maxCombo: 0, augmentCount: 0, won: false });
    assert.ok(!SaveSystem.isUnlocked(ACHIEVEMENTS.find(a => a.id === 'kills_100')));
    const unlocked = SaveSystem.recordRun({ charId: 'kai', chapter: 1, wave: 5, kills: 5, bossKills: 0,
        goldEarned: 0, maxCombo: 0, augmentCount: 0, won: false });
    assert.ok(SaveSystem.isUnlocked(ACHIEVEMENTS.find(a => a.id === 'kills_100')));
    assert.ok(unlocked.some(a => a.id === 'kills_100'), '当次解锁的成就应出现在返回列表');
});

test('v5统计挂点:精英/小首领击杀跨局累计入档', () => {
    freshProfile();
    SaveSystem.recordRun({ charId: 'kai', chapter: 1, wave: 4, kills: 30, bossKills: 0,
        eliteKills: 9, miniBossKills: 1,
        goldEarned: 0, maxCombo: 0, augmentCount: 0, won: false });
    SaveSystem.recordRun({ charId: 'kai', chapter: 1, wave: 8, kills: 45, bossKills: 1,
        eliteKills: 11, miniBossKills: 2,
        goldEarned: 0, maxCombo: 0, augmentCount: 0, won: false });
    const p = SaveSystem.load();
    assert.equal(p.eliteKills, 20, '精英击杀跨局累计');
    assert.equal(p.miniBossKills, 3, '小首领击杀跨局累计');
});

test('存档持久化:重新load(清缓存)后数据仍在', () => {
    freshProfile();
    // v5：chapter_2 读 chaptersCleared（通关链真源）。真实时序=通关时先写
    // 解锁链再结算本局（GameManager._onWaveCleared 同序），成就当次即判。
    SaveSystem.recordChapterCleared(11);
    SaveSystem.recordRun({ charId: 'olia', chapter: 11, wave: 12, kills: 10, bossKills: 1,
        goldEarned: 50, maxCombo: 8, augmentCount: 1, won: false });
    SaveSystem.resetCache(); // 模拟下次启动游戏
    const p = SaveSystem.load();
    assert.equal(p.totalRuns, 1);
    assert.equal(p.bestChapter, 11);
    assert.ok(p.achievements.indexOf('chapter_2') >= 0, '通关图3(全局11节点)应已解锁初入混沌');
});

test('v5.1进度自愈:chaptersCleared低于bestChapter-1时load自动对齐并落盘', () => {
    freshProfile();
    // 模拟通关链丢失的老档：最远到达全局 20（图4-5），通关链字段只剩 0
    cc.sys.localStorage.setItem(SaveSystem.slotKey(0), JSON.stringify({
        version: 2, migratedV4: true, totalRuns: 7, bestChapter: 20, chaptersCleared: 0,
    }));
    SaveSystem.resetCache();
    const p = SaveSystem.load();
    assert.equal(p.chaptersCleared, 19, '自愈到 bestChapter-1（图1-3全通+图4前四章可达）');
    // 幂等：清缓存再 load 不变，且已写回存储
    SaveSystem.resetCache();
    assert.equal(SaveSystem.load().chaptersCleared, 19);
    assert.equal(JSON.parse(cc.sys.localStorage.getItem(SaveSystem.slotKey(0))).chaptersCleared, 19);
    // 正常档不受影响：cleared ≥ bestChapter-1 时保持原值
    cc.sys.localStorage.setItem(SaveSystem.slotKey(0), JSON.stringify({
        version: 2, migratedV4: true, bestChapter: 5, chaptersCleared: 5,
    }));
    SaveSystem.resetCache();
    assert.equal(SaveSystem.load().chaptersCleared, 5, '一致档案不被改写');
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

test('成就全集v5共42个且id唯一(含滑稽猴隐藏成就)', () => {
    assert.equal(ACHIEVEMENTS.length, 42);
    const ids = ACHIEVEMENTS.map(a => a.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const a of ACHIEVEMENTS) {
        assert.ok(a.artKey && a.reward, `${a.id} 应提供成就图片与奖励预览`);
        assert.ok(['普通', '稀有', '史诗', '传奇'].includes(a.rarity));
        assert.ok(['挑战', '探索', '收集'].includes(a.category));
    }
    // 数量金字塔（2026-10-19 玩家定稿）：普通 > 稀有 > 史诗 > 传奇 严格递减
    const byRarity = { 普通: 0, 稀有: 0, 史诗: 0, 传奇: 0 };
    for (const a of ACHIEVEMENTS) byRarity[a.rarity]++;
    assert.deepEqual(byRarity, { 普通: 15, 稀有: 12, 史诗: 9, 传奇: 6 });
    assert.ok(byRarity.普通 > byRarity.稀有, '普通应多于稀有');
    assert.ok(byRarity.稀有 > byRarity.史诗, '稀有应多于史诗');
    assert.ok(byRarity.史诗 > byRarity.传奇, '史诗应多于传奇');
});

test('v5同指标成就目标值随档位严格递增(防止高档成就反而容易达成)', () => {
    const goalOf = id => ACHIEVEMENTS.find(a => a.id === id).goal;
    // 累计击杀 4 档
    assert.ok(goalOf('kills_100') < goalOf('kills_1000'));
    assert.ok(goalOf('kills_1000') < goalOf('kills_100000'));
    assert.ok(goalOf('kills_100000') < goalOf('kills_300000'));
    // 精英 4 档
    assert.ok(goalOf('elite_10') < goalOf('elite_100'));
    assert.ok(goalOf('elite_100') < goalOf('elite_2000'));
    assert.ok(goalOf('elite_2000') < goalOf('elite_20000'));
    // 小首领 3 档 / 大首领 4 档
    assert.ok(goalOf('mini_1') < goalOf('mini_50'));
    assert.ok(goalOf('mini_50') < goalOf('mini_1000'));
    assert.ok(goalOf('boss_1') < goalOf('boss_10'));
    assert.ok(goalOf('boss_10') < goalOf('boss_100'));
    assert.ok(goalOf('boss_100') < goalOf('boss_300'));
    // 单局击杀 / 连击 / 局数 / 金币 / 波次 / 强化
    assert.ok(goalOf('run_150') < goalOf('run_1000'));
    assert.ok(goalOf('combo_100') < goalOf('combo_50'));
    assert.ok(goalOf('combo_50') < goalOf('combo_1000'));
    assert.ok(goalOf('runs_5') < goalOf('runs_25'));
    assert.ok(goalOf('runs_25') < goalOf('runs_100'));
    assert.ok(goalOf('gold_1000') < goalOf('gold_5000'));
    assert.ok(goalOf('gold_5000') < goalOf('gold_200000'));
    assert.ok(goalOf('wave_5') < goalOf('wave_12'));
    assert.ok(goalOf('aug_3') < goalOf('aug_6'));
    // 单局击杀天花板实算≈1100（地狱）——战场主宰 1000 必须可达且不超天花板
    assert.ok(goalOf('run_1000') <= 1100, '单局击杀档位不得高于实算天花板');
});

test('存档码导出导入:三槽打包恢复,无效码拒改现有存档', () => {
    cc.sys.localStorage._clear();
    SaveSystem.resetCache();
    SaveSystem.selectSlot(0);
    // 槽 1 写入可辨识数据
    SaveSystem.recordRun({ charId: 'kai', chapter: 3, wave: 10, kills: 120, bossKills: 2,
        goldEarned: 1500, maxCombo: 40, augmentCount: 4, won: false });
    const code = SaveSystem.exportSaveCode();
    assert.ok(code.length > 20, '存档码非空');
    // 清空全部槽位后导入应恢复
    for (let i = 0; i < SaveSystem.SLOT_COUNT; i++) SaveSystem.deleteSlot(i);
    assert.equal(SaveSystem.listSlots().filter(s => s.exists).length, 0, '导入前槽位为空');
    assert.ok(SaveSystem.importSaveCode(code), '合法存档码导入成功');
    const restored = SaveSystem.listSlots();
    assert.ok(restored[0].exists, '槽 1 恢复');
    assert.equal(restored[0].profile.totalRuns, 1);
    assert.equal(restored[0].profile.totalKills, 120);
    // 无效存档码：返回 false 且不动现有存档
    assert.equal(SaveSystem.importSaveCode('not-a-valid-code'), false);
    assert.equal(SaveSystem.importSaveCode('==='), false);
    assert.ok(SaveSystem.listSlots()[0].exists, '无效导入不破坏现有存档');
});
