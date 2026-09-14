'use strict';
// 元进度占位数据的结构测试：任务/图鉴内容可替换，但 UI 所需字段必须完整。
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHARS } = require('../dist/data/CharacterDB');
const {
    QUESTS, CODEX_ENTRIES, questsByBranch, codexByCategory,
} = require('../dist/data/MetaProgressionDB');

test('任务树同时包含主线/支线/挑战三个系列，id唯一且奖励/进度字段完整', () => {
    assert.equal(questsByBranch('main').length, 4);
    assert.equal(questsByBranch('side').length, 4);
    assert.equal(questsByBranch('challenge').length, 4, '挑战任务系列应有各自的任务');
    assert.equal(new Set(QUESTS.map(q => q.id)).size, QUESTS.length);
    for (const q of QUESTS) {
        assert.ok(q.name && q.desc && q.objective, `${q.id} 应有完整文案`);
        assert.ok(q.goal > 0 && q.progress >= 0, `${q.id} 进度必须有效`);
        assert.ok(q.reward && q.rewardIcon, `${q.id} 应有奖励预览`);
        assert.ok(['completed', 'active', 'available', 'locked'].includes(q.state));
    }
});

test('挑战任务系列：每条都有独立目标与前置链，状态覆盖全部四档', () => {
    const ch = questsByBranch('challenge');
    assert.deepEqual(ch.map(q => q.id), ['ch_01', 'ch_02', 'ch_03', 'ch_04']);
    // 各自的任务目标互不相同（每条挑战独立成题，不共用占位文案）
    assert.equal(new Set(ch.map(q => q.objective)).size, ch.length);
    const states = new Set(ch.map(q => q.state));
    for (const s of ['completed', 'active', 'available', 'locked']) {
        assert.ok(states.has(s), `挑战系列应覆盖 ${s} 状态`);
    }
    // 前置链指向系列内任务，不悬空
    for (const q of ch) {
        if (q.prerequisite) assert.ok(ch.some(x => x.id === q.prerequisite), `${q.id} 前置应存在于挑战系列`);
    }
});

test('图鉴提供8个怪物和6个英雄，并保留未解锁问号状态所需数据', () => {
    const monsters = codexByCategory('monster');
    const heroes = codexByCategory('hero');
    assert.equal(monsters.length, 8);
    assert.equal(heroes.length, 6);
    assert.ok(monsters.some(e => !e.unlocked), '怪物图鉴需要未解锁条目');
    assert.ok(heroes.some(e => !e.unlocked), '英雄图鉴需要未解锁条目');
    assert.equal(new Set(CODEX_ENTRIES.map(e => e.id)).size, CODEX_ENTRIES.length);
    for (const entry of CODEX_ENTRIES) {
        assert.ok(entry.name && entry.desc && entry.artKey);
        assert.ok(entry.traits.length >= 2, `${entry.id} 应提供可读特征标签`);
    }
});

test('图鉴英雄id与CharacterDB保持一致，避免后续新增时静默漂移', () => {
    assert.deepEqual(
        codexByCategory('hero').map(e => e.id).sort(),
        CHARS.map(c => c.id).sort(),
    );
});
