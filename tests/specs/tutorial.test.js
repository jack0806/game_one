// ============================================================
//  tutorial.test.js — 新手引导纯逻辑（ui/TutorialState.ts）
// ============================================================
// 覆盖：弹出判定三分支（判定表见 docs/新手引导提案-2026-10-19.md 第 2 节）、
// 标记读写幂等、页内容结构（4 页/平台切换键位表）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    TUTORIAL_KEY, TUTORIAL_ENABLED_KEY, TUTORIAL_REWARD_COINS, defaultTutorialStorage,
    tutorialDone, markTutorialDone, shouldAutoShowTutorial, tutorialEnabled,
    setTutorialEnabled, tutorialHintMove, tutorialHintSkill, tutorialHintKill,
    lobbyGuideSteps, mapGuideSteps, chapterGuideSteps, diffGuideSteps, charGuideSteps,
} = require('../dist/ui/TutorialState');

/** 每用例独立的内存存储（互不污染）。 */
function makeStore(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
    };
}

test('标记读写：完成/跳过后写入 done，二次判定不再弹', () => {
    const s = makeStore();
    assert.equal(tutorialDone(s), false);
    markTutorialDone(s);
    assert.equal(tutorialDone(s), true);
    assert.equal(s.getItem(TUTORIAL_KEY), 'done');
    // 幂等：重复写不报错
    markTutorialDone(s);
    assert.equal(tutorialDone(s), true);
});

test('播放判定：开关开+未播过→播；已播→不播（不再按存档区分新老玩家）', () => {
    const fresh = makeStore();
    // 未播过 + 开关开（缺省）→ 播（与设备上是否有存档无关，测试性更好）
    assert.equal(shouldAutoShowTutorial(fresh), true);
    assert.equal(shouldAutoShowTutorial(fresh), shouldAutoShowTutorial(makeStore()));
    // 已看过：有标记 → 不播
    const seen = makeStore({ [TUTORIAL_KEY]: 'done' });
    assert.equal(shouldAutoShowTutorial(seen), false);
});

test('defaultStorage：无 localStorage 环境退化为内存 Map 且读写一致', () => {
    // node 环境无 globalThis.localStorage（或桩环境下走内存兜底分支）
    const s = defaultTutorialStorage();
    assert.equal(typeof s.getItem, 'function');
    assert.equal(typeof s.setItem, 'function');
    s.setItem('probe_tutorial', '1');
    assert.equal(s.getItem('probe_tutorial'), '1');
});

test('聚光引导步骤定义：大厅5步+四个出战页各1步，目标区都在画布内', () => {
    const lobby = lobbyGuideSteps();
    assert.equal(lobby.length, 5, '作战大厅 5 步');
    assert.match(lobby[0].title, /HEXBLAST/);
    assert.match(lobby[1].title, /传送门/);
    assert.match(lobby[2].title, /图鉴/);
    assert.match(lobby[3].title, /成就/);
    assert.match(lobby[4].title, /装备库/);
    assert.equal(mapGuideSteps().length, 1, '选图页 1 步');
    assert.equal(chapterGuideSteps().length, 1, '章节页 1 步');
    assert.equal(diffGuideSteps().length, 1, '难度页 1 步');
    assert.equal(charGuideSteps().length, 1, '选人页 1 步');
    // 所有高亮目标都在 1280x720 画布内
    for (const steps of [lobby, mapGuideSteps(), chapterGuideSteps(), diffGuideSteps(), charGuideSteps()]) {
        for (const s of steps) {
            assert.ok(Math.abs(s.target.x) <= 640 && Math.abs(s.target.y) <= 360, `${s.title} 目标越界`);
            assert.ok(s.target.w > 0 && s.target.h > 0);
            assert.ok(s.title && s.text);
        }
    }
});

test('设置开关：缺省=开，可切换并持久化，关闭后不再播放', () => {
    const s = makeStore();
    assert.equal(tutorialEnabled(s), true, '缺省开启');
    assert.equal(shouldAutoShowTutorial(s, false), true);
    setTutorialEnabled(s, false);
    assert.equal(tutorialEnabled(s), false);
    assert.equal(s.getItem(TUTORIAL_ENABLED_KEY), 'off');
    // 开关关闭：即使新玩家未播过也不播放
    assert.equal(shouldAutoShowTutorial(s, false), false);
    // 重新打开恢复
    setTutorialEnabled(s, true);
    assert.equal(tutorialEnabled(s), true);
    assert.equal(shouldAutoShowTutorial(s, false), true);
});

test('完成标记 key 升级 v2（旧 v1 被初版"老玩家补标记"写死，换 key 才能重新触发）', () => {
    assert.equal(TUTORIAL_KEY, 'hexblast_tutorial_v2');
});

test('引导完成奖励：一次性核心币（业界惯例引导期给甜头）', () => {
    assert.equal(TUTORIAL_REWARD_COINS, 50);
});

test('战斗内浮字提示文案：PC=WASD/鼠标/按Q，触屏=摇杆/点Q按钮；含击杀步', () => {
    assert.match(tutorialHintMove(false), /WASD/);
    assert.match(tutorialHintMove(false), /自动发射/);
    assert.doesNotMatch(tutorialHintMove(false), /摇杆/);
    assert.match(tutorialHintMove(true), /摇杆/);
    assert.doesNotMatch(tutorialHintMove(true), /WASD/);
    assert.match(tutorialHintSkill(false), /按 Q/);
    assert.match(tutorialHintSkill(true), /点右下角 Q/);
    // 击杀步两端同文案：强调拾取掉落
    assert.match(tutorialHintKill(), /击败敌人/);
    assert.match(tutorialHintKill(), /拾取/);
});

test('聚光步文案：图鉴/成就步指向情报终端，传送门步指向出击入口', () => {
    assert.match(lobbyGuideSteps()[2].text, /图鉴/);
    assert.match(lobbyGuideSteps()[3].text, /成就/);
    assert.match(lobbyGuideSteps()[1].text, /出击/);
});
