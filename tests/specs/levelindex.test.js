'use strict';
// v5《关卡设计-六图五章.md》结构单测：全局章号换算、30 节点曲线、怪池渐进、
// 关底配置、解锁链语义、老档迁移规则 B（2026-10-09 定稿）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    MAP_COUNT, CHAPTERS_PER_MAP, TOTAL_CHAPTERS,
    globalChapter, mapOf, chapterInMap, mapDef, chapterNode,
    statScaleFor, countScaleFor, starterPack, goldStageMult,
    meleePoolFor, rangedPoolFor, miniBossTiers, eliteSlots, finaleFor,
    CHAPTER_NODES,
} = require('../dist/data/LevelIndex');

test('全局章号换算:1~30 与 (图,图内章) 双射', () => {
    assert.equal(TOTAL_CHAPTERS, 30);
    assert.equal(globalChapter(1, 1), 1);
    assert.equal(globalChapter(1, 5), 5);
    assert.equal(globalChapter(2, 1), 6);
    assert.equal(globalChapter(6, 5), 30);
    for (let k = 1; k <= 30; k++) {
        assert.equal(globalChapter(mapOf(k), chapterInMap(k)), k, `k=${k} 往返一致`);
    }
    assert.equal(mapOf(30), 6);
    assert.equal(chapterInMap(30), 5);
});

test('30节点曲线端点:stat 1.0→4.2 / count 1.0→2.2 / 战备包 0→14抽900金 / 金币 1.0→1.75', () => {
    assert.equal(statScaleFor(1), 1);
    assert.ok(Math.abs(statScaleFor(30) - 4.2) < 1e-9);
    assert.equal(countScaleFor(1), 1);
    assert.ok(Math.abs(countScaleFor(30) - 2.2) < 1e-9);
    assert.deepEqual(starterPack(1), { draws: 0, gold: 0 });
    assert.deepEqual(starterPack(30), { draws: 14, gold: 900 });
    assert.ok(Math.abs(goldStageMult(1) - 1.0) < 1e-9);
    assert.ok(Math.abs(goldStageMult(30) - 1.75) < 1e-9);
    // 单调不减
    for (let k = 2; k <= 30; k++) {
        assert.ok(statScaleFor(k) > statScaleFor(k - 1), 'stat 曲线单调上升');
        assert.ok(countScaleFor(k) > countScaleFor(k - 1), 'count 曲线单调上升');
    }
});

test('图内怪池渐进:章1只出基础怪,每章解锁新怪,图末全池+权重加成', () => {
    // 图1：章1 仅 grunt/archer；章2 +rust_biter；章4 +exploder；章5 全池且 grunt 权重 +1
    const c1 = meleePoolFor(1);
    assert.ok(c1.every(id => id === 'grunt'), '图1章1近战只有 grunt');
    assert.ok(rangedPoolFor(1).includes('archer'));
    assert.ok(meleePoolFor(2).includes('rust_biter'), '章2 解锁 rust_biter');
    assert.ok(meleePoolFor(4).includes('exploder'), '章4 解锁 exploder');
    const c5 = meleePoolFor(5);
    assert.equal(c5.filter(id => id === 'grunt').length,
        meleePoolFor(4).filter(id => id === 'grunt').length + 1, '图末章 grunt 权重 +1');
    assert.ok(c5.includes('blast_tick') && c5.includes('exploder'), '图末章全池');
});

test('关底配置:前4章小首领组合(档位随图),第5章图鉴大Boss', () => {
    assert.deepEqual(finaleFor(1), { kind: 'mini', tiers: ['普通'] }, '图1章1 单普通');
    assert.deepEqual(finaleFor(2), { kind: 'mini', tiers: ['普通', '普通'] }, '图1章2 双普通');
    assert.deepEqual(finaleFor(3), { kind: 'mini', tiers: ['史诗', '地狱'] }, '图1章3 史诗+地狱');
    assert.deepEqual(finaleFor(4), { kind: 'mini', tiers: ['地狱', '地狱'] }, '图1章4 双地狱');
    assert.deepEqual(finaleFor(5), { kind: 'boss' }, '图1章5 大Boss');
    assert.deepEqual(finaleFor(30), { kind: 'boss' }, '图6章5 大Boss');
    // 图3 起章1 即史诗档
    assert.deepEqual(finaleFor(11), { kind: 'mini', tiers: ['史诗'] });
});

test('变异排期:图1全图不上,图末章不上,共10个章位', () => {
    const withMut = CHAPTER_NODES.filter(n => n.mutations.length);
    assert.equal(withMut.length, 10, '10 个章节带固定变异');
    assert.ok(withMut.every(n => n.mapId >= 2), '图1 不上变异');
    assert.ok(withMut.every(n => !n.isMapFinale), '图末章不上变异');
});

test('任务骨架:30节点各有任务与首通奖励', () => {
    assert.equal(CHAPTER_NODES.length, 30);
    for (const n of CHAPTER_NODES) {
        assert.ok(n.quest.title.length > 0, `k=${n.id} 任务标题非空`);
        assert.ok(n.quest.reward.coreCoins > 0);
    }
});

test('小首领槽位/精英槽随图爬升', () => {
    assert.deepEqual(miniBossTiers(1, 5), ['普通']);
    assert.deepEqual(miniBossTiers(16, 14), ['地狱']);
    assert.deepEqual(miniBossTiers(26, 10), ['地狱', '地狱']);
    assert.deepEqual([eliteSlots(4, 1), eliteSlots(4, 21)], [2, 4]);
});
