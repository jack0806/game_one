'use strict';
// ============================================================
//  difficultytuning.test.js — 关卡难度系数逐关比例调整（测试房调试 → 保存 → 正式局生效）
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const cc = require('cc');
const {
    _resetForTest, loadTuning, saveTuning, chapterTuning, setChapterTuning,
    clearChapterTuning, clearAllTuning, tuningSnapshot, hasUnsavedTuning,
    tunedStatScale, tunedCountScale, tunedGoldStage, TUNING_MIN, TUNING_MAX,
} = require('../dist/data/DifficultyTuning');
const { statScaleFor, countScaleFor, goldStageMult, TOTAL_CHAPTERS } = require('../dist/data/LevelIndex');
const { enemyCountForWave } = require('../dist/data/WaveData');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { makeMockGame } = require('./mockGame');

function freshTuning() {
    cc.sys.localStorage._clear();
    _resetForTest();
}

test('比例调整:单关三路独立覆盖，未覆盖的关保持基线', () => {
    freshTuning();
    setChapterTuning(12, 'stat', 1.3);
    setChapterTuning(12, 'count', 0.8);
    const t = chapterTuning(12);
    assert.equal(t.stat, 1.3, '第12关强度比例 ×1.3');
    assert.equal(t.count, 0.8, '第12关数量比例 ×0.8');
    assert.equal(t.gold, 1, '金币比例未动，保持 ×1');
    assert.deepEqual(chapterTuning(11), { stat: 1, count: 1, gold: 1 }, '其他关不受影响');
    assert.equal(tunedStatScale(12), statScaleFor(12) * 1.3, '有效强度=基线×比例');
});

test('比例钳制:步进越界被夹在 [0.2, 3.0]，章号越界被夹在 1~30', () => {
    freshTuning();
    setChapterTuning(5, 'stat', 99);
    assert.equal(chapterTuning(5).stat, TUNING_MAX, '上限钳制');
    setChapterTuning(5, 'stat', -1);
    assert.equal(chapterTuning(5).stat, TUNING_MIN, '下限钳制');
    setChapterTuning(0, 'stat', 2);     // 章号 0 → 钳到 1
    setChapterTuning(999, 'stat', 2);   // 章号 999 → 钳到 30
    // 本测试同时给第 5 关写过钳制条目，快照应为 1/5/30 三条
    assert.deepEqual(Object.keys(tuningSnapshot()).sort((a, b) => a - b), ['1', '5', '30'], '章号钳制到有效区间');
});

test('保存与重载:saveTuning 落盘，loadTuning 跨重启恢复；浮点步进漂移被规整', () => {
    freshTuning();
    // 0.05 连续累加产生 1.1500000000000001 这类漂移，保存前规整到两位
    for (let i = 0; i < 3; i++) setChapterTuning(7, 'stat', chapterTuning(7).stat + 0.05);
    assert.ok(Math.abs(chapterTuning(7).stat - 1.15) < 1e-9, '连续步进规整为 ×1.15');
    setChapterTuning(7, 'gold', 1.5);
    assert.equal(hasUnsavedTuning(), true, '调整未保存时脏标记亮起');
    saveTuning();
    assert.equal(hasUnsavedTuning(), false, '保存后脏标记熄灭');

    // 模拟重启：清内存 → 从 localStorage 重载
    _resetForTest();
    assert.deepEqual(chapterTuning(7), { stat: 1, count: 1, gold: 1 }, '重载前内存态为基线');
    loadTuning();
    assert.equal(chapterTuning(7).stat, 1.15, '重启后强度比例恢复');
    assert.equal(chapterTuning(7).gold, 1.5, '重启后金币比例恢复');
});

test('损坏存档:loadTuning 解析失败按无覆盖处理，不抛异常', () => {
    freshTuning();
    cc.sys.localStorage.setItem('hexblast_diff_tuning_v1', '{broken json');
    loadTuning();
    assert.deepEqual(tuningSnapshot(), {}, '损坏数据不产生覆盖');
    assert.equal(tunedStatScale(3), statScaleFor(3), '读取点回落基线');
});

test('损坏存档:hasUnsavedTuning 同样静默兜底，不炸调试面板', () => {
    freshTuning();
    cc.sys.localStorage.setItem('hexblast_diff_tuning_v1', 'not json at all');
    let threw = false;
    try { hasUnsavedTuning(); } catch (e) { threw = true; }
    assert.equal(threw, false, '损坏存档不得让脏标记查询抛异常');
    setChapterTuning(2, 'stat', 1.2);
    assert.equal(hasUnsavedTuning(), true, '盘上损坏 + 内存有调整 → 视为未保存');
});

test('重置:重置本关只清该关，全部重置清空；清到全 1 的条目自动从表里消失', () => {
    freshTuning();
    setChapterTuning(2, 'stat', 1.2);
    setChapterTuning(3, 'count', 1.4);
    clearChapterTuning(2);
    assert.ok(!tuningSnapshot()[2], '第2关覆盖被移除');
    assert.equal(tuningSnapshot()[3].count, 1.4, '第3关不受重置本关影响');
    clearAllTuning();
    assert.deepEqual(tuningSnapshot(), {}, '全部重置清空覆盖表');
    // 调回 1 的条目在写入时即被裁剪（不留全 1 死条目）
    setChapterTuning(4, 'stat', 1.25);
    setChapterTuning(4, 'stat', 1);
    assert.ok(!tuningSnapshot()[4], '比例回到 ×1 时条目自动裁剪');
});

test('接入点:enemyCountForWave 数量走 tuned 曲线', () => {
    freshTuning();
    const base = enemyCountForWave(5, 20, 1);
    setChapterTuning(20, 'count', 2);
    const tuned = enemyCountForWave(5, 20, 1);
    // 比例乘在取整之前，允许与 base×2 相差 ±1 的取整差
    assert.ok(Math.abs(tuned - base * 2) <= 1, `第20关数量比例 ×2 应翻倍波内敌数（${base} → ${tuned}）`);
    clearAllTuning();
    assert.equal(enemyCountForWave(5, 20, 1), base, '清掉覆盖回到基线');
});

test('接入点:EnemyBase 怪物成长走 tuned 强度曲线', () => {
    freshTuning();
    const game = makeMockGame();
    game._chapter = 15;
    const eBase = new EnemyBase();
    eBase.init('grunt', 1, game);
    setChapterTuning(15, 'stat', 1.5);
    const eTuned = new EnemyBase();
    eTuned.init('grunt', 1, game);
    assert.equal(eTuned.maxHp, Math.round(eBase.maxHp * 1.5), '第15关强度 ×1.5 → 小兵血量等比放大');
    // Boss 章号口径（BossController 用图号）不受影响：tunedStatScale 只看传入章号
    assert.equal(tunedStatScale(TOTAL_CHAPTERS), statScaleFor(TOTAL_CHAPTERS), '末关无覆盖时等于基线');
});

test('金币乘率:tunedGoldStage = 基线 × 本关比例（比例默认 1）', () => {
    freshTuning();
    assert.equal(tunedGoldStage(9), goldStageMult(9), '无覆盖 = 基线');
    setChapterTuning(9, 'gold', 0.5);
    assert.equal(tunedGoldStage(9), goldStageMult(9) * 0.5, '金币比例 ×0.5');
});
