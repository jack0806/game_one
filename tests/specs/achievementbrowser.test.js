'use strict';
// 网页构建的loose数组展开与UI状态回归，不依赖Cocos安装目录。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const cc = require('cc');
const { freshAchievementStats, LEGACY_ACHIEVEMENTS } = require('../dist/data/AchievementDB');
const { AchievementAdmin } = require('../dist/systems/AchievementAdmin');
const { makeMockGame, makePlayer } = require('./mockGame');

function loadDownlevel(relative, mocks = {}) {
    const source = fs.readFileSync(path.join(__dirname, '../../assets/scripts', relative + '.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS, downlevelIteration: false,
    } }).outputText;
    const module = { exports: {} }, requireFromDist = createRequire(path.join(__dirname, '../dist', relative + '.js'));
    vm.runInNewContext(code, {
        module, exports: module.exports,
        require: id => Object.prototype.hasOwnProperty.call(mocks, id) ? mocks[id] : requireFromDist(id),
    }, { filename: relative + '.downlevel.js' });
    return module.exports;
}

test('旧档解锁与收藏集合经网页目标降级编译后仍是字符串数组，重复读写不丢ID', () => {
    cc.sys.localStorage._clear(); AchievementAdmin.resetAll();
    const { SaveSystem } = loadDownlevel('systems/SaveSystem');
    const original = {
        version: 2, achievements: ['first_run', 'joker_doll', 'kills_1000'], coreCoins: 777,
        achievementStats: { ...freshAchievementStats(), equipmentKeys: ['hp:0', 'hp:0'],
            hexIds: ['hex01'], hardBossMaps: [1, 2] },
    };
    cc.sys.localStorage.setItem(SaveSystem.slotKey(0), JSON.stringify(original));
    for (let i = 0; i < 3; i++) {
        SaveSystem.resetCache();
        assert.equal(JSON.stringify(SaveSystem.load().achievements), JSON.stringify(original.achievements));
        SaveSystem.recordAchievementStats(freshAchievementStats());
        SaveSystem.save();
    }
    const saved = JSON.parse(cc.sys.localStorage.getItem(SaveSystem.slotKey(0)));
    assert.deepEqual(saved.achievementStats.equipmentKeys, ['hp:0']);
    assert.deepEqual(saved.achievementStats.hexIds, ['hex01']);
    assert.deepEqual(saved.achievementStats.hardBossMaps, [1, 2]);
    assert.equal(saved.coreCoins, 777);
});

test('网页降级构建不会把空技能格算成一个Set对象，首领禁技能条件正常迭代', () => {
    const { AchievementTracker } = loadDownlevel('systems/AchievementTracker');
    const t = new AchievementTracker({ hero: 'kai', chapter: 5, difficulty: 'hell', equipment: [] });
    const p = makePlayer({ stats: { maxHp: 100, armor: 0 } });
    const game = makeMockGame({ player: p, turrets: [], augmentManager: { all: () => [], active: [], functional: [], ownedOf: () => undefined } });
    t.startWave(15, p, game);
    assert.equal(t.stats.values[35] ?? 0, 0);
    assert.equal(t.stats.values[36] ?? 0, 0);
    const boss = { isBoss: true, alive: true };
    t.enemyBorn(boss, p, game);
    t.beginSkill('q', p, game);
    t.kill(boss, t.source('projectile'), p, game);
    assert.equal(t.stats.values[34] ?? 0, 0, '首领期间使用Q后不能获得禁技能成就');
});

test('读档清除损坏的集合占位对象，同时保留合法旧ID与已有进度', () => {
    const { SaveSystem } = loadDownlevel('systems/SaveSystem');
    cc.sys.localStorage._clear(); SaveSystem.resetCache();
    const stats = freshAchievementStats();
    stats.hexIds = [{}, 'hex01']; stats.hardBossMaps = [{}, 2]; stats.values[67] = 1;
    cc.sys.localStorage.setItem(SaveSystem.slotKey(0), JSON.stringify({
        version: 2, achievements: ['first_run', 'joker_doll'], achievementStats: stats, coreCoins: 321,
    }));
    const p = SaveSystem.load();
    assert.equal(JSON.stringify(p.achievementStats.hexIds), '["hex01"]');
    assert.equal(JSON.stringify(p.achievementStats.hardBossMaps), '[2]');
    assert.equal(p.achievementStats.values[67], 1);
    assert.equal(p.coreCoins, 321);
});

test('历史荣誉独占高亮，点击原稀有度能退出历史视图', () => {
    const { SaveSystem } = require('../dist/systems/SaveSystem');
    cc.sys.localStorage._clear(); SaveSystem.resetCache(); AchievementAdmin.resetAll();
    const { MetaPageUI } = loadDownlevel('ui/MetaPageUI', {
        '../core/LabelUtils': {}, '../core/ScreenFit': {}, '../core/SpriteUtils': {},
        '../core/PortraitArt': {}, '../core/UIStyle': {},
    });
    const ui = Object.create(MetaPageUI.prototype);
    ui._achieveRarity = '普通'; ui._achieveLegacy = true; ui._achieveTabs = { children: [] };
    ui._callbacks = { onButtonSfx() {} };
    let rebuilt = 0;
    const buttons = [];
    ui._mkAchievementControl = (_parent, text, _x, _y, _w, _h, color, selected) => {
        const button = { text, color, selected, on(_event, action) { this.activate = action; } };
        buttons.push(button); return button;
    };
    ui._rebuildAchievementCards = () => rebuilt++;
    ui._rebuildAchievementFilters = () => {};
    ui._rebuildAchievementTabs();
    assert.equal(buttons.find(b => b.text === '普通').selected, false);
    assert.equal(buttons.find(b => b.text === '历史荣誉').selected, true);
    buttons.find(b => b.text === '普通').activate();
    assert.equal(ui._achieveLegacy, false);
    assert.equal(rebuilt, 1);
});

test('历史荣誉包含逗号的目标数字保持完整，不截成1或20', () => {
    assert.equal(LEGACY_ACHIEVEMENTS.find(a => a.id === 'kills_1000').desc, '累计击杀 10,000 个敌人');
    assert.equal(LEGACY_ACHIEVEMENTS.find(a => a.id === 'gold_200000').desc, '累计获得 200,000 金币');
});

test('成就三列两行分页覆盖全部记录，首尾翻页不越界也不重复响应', () => {
    const { SaveSystem } = require('../dist/systems/SaveSystem');
    cc.sys.localStorage._clear(); SaveSystem.resetCache(); AchievementAdmin.resetAll();
    const { MetaPageUI } = loadDownlevel('ui/MetaPageUI', {
        '../core/LabelUtils': {}, '../core/ScreenFit': {}, '../core/SpriteUtils': {},
        '../core/PortraitArt': {}, '../core/UIStyle': {},
    });
    const ui = Object.create(MetaPageUI.prototype);
    ui._achieveContent = { children: [] }; ui._achievementSection = { string: '' };
    ui._achieveRarity = '普通'; ui._achieveType = '全部'; ui._achieveStatus = '全部'; ui._achieveLegacy = false;
    let sounds = 0, shown = [];
    ui._callbacks = { onButtonSfx: () => sounds++ };
    ui._mkAchievementCard = (def, x, y) => shown.push({ id: def.id, x, y });
    ui._refreshAchievements = () => {}; ui._rebuildAchievementPager = () => {};
    ui._rebuildAchievementCards();
    assert.equal(ui._achievePageCount, 11);
    assert.equal(shown.length, 6);
    assert.deepEqual(shown.map(c => c.x), [-320, 0, 320, -320, 0, 320]);
    assert.deepEqual(shown.map(c => c.y), [108, 108, 108, -108, -108, -108]);
    ui._turnAchievementPage(-1);
    assert.equal(sounds, 0);
    const ids = shown.map(c => c.id);
    for (let page = 1; page < ui._achievePageCount; page++) {
        shown = []; ui._turnAchievementPage(1);
        assert.ok(shown.length <= 6);
        ids.push(...shown.map(c => c.id));
    }
    assert.equal(shown.length, 4, '最后一页展示剩余四项');
    assert.deepEqual(ids, SaveSystem.allAchievements().filter(a => a.rarity === '普通').map(a => a.id));
    ui._turnAchievementPage(1);
    assert.equal(ui._achievePage, 10);
    assert.equal(sounds, 10, '到达末页后点击下一页不再触发');
    shown = []; ui._mkLabel = () => {};
    ui._achieveStatus = '已解锁'; ui._rebuildAchievementCards();
    assert.equal(ui._achievePage, 0, '切换筛选回到第一页');
    assert.equal(ui._achievePageCount, 1, '零结果仍显示第1/1页');
    assert.equal(shown.length, 0);
});

test('大厅的160项进度不混入历史荣誉或未知旧ID', () => {
    const { SaveSystem } = require('../dist/systems/SaveSystem');
    cc.sys.localStorage._clear(); SaveSystem.resetCache();
    SaveSystem.load().achievements = ['first_run', 'joker_doll', 'kills_1000', '未知旧ID'];
    const { LobbyUI } = loadDownlevel('ui/LobbyUI', {
        '../core/LabelUtils': {}, '../core/ScreenFit': {}, '../core/SpriteUtils': {},
        '../core/UIStyle': { UI_PALETTE: {} }, './DepotUI': {},
    });
    const ui = Object.create(LobbyUI.prototype);
    ui._depot = { hide() {} }; ui._summaryTitle = { string: '' };
    ui._summaryLines = Array.from({ length: 4 }, () => ({ string: '' }));
    ui.refresh();
    assert.match(ui._summaryLines[3].string, /^成就 1\/160/);
});
