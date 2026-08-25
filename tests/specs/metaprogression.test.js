'use strict';
// 元进度占位数据的结构测试：任务/图鉴内容可替换，但 UI 所需字段必须完整。
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHARS } = require('../dist/data/CharacterDB');
const {
    QUESTS, CODEX_ENTRIES, questsByBranch, codexByCategory,
} = require('../dist/data/MetaProgressionDB');

test('任务树同时包含主线和支线，id唯一且奖励/进度字段完整', () => {
    assert.equal(questsByBranch('main').length, 4);
    assert.equal(questsByBranch('side').length, 4);
    assert.equal(new Set(QUESTS.map(q => q.id)).size, QUESTS.length);
    for (const q of QUESTS) {
        assert.ok(q.name && q.desc && q.objective, `${q.id} 应有完整文案`);
        assert.ok(q.goal > 0 && q.progress >= 0, `${q.id} 进度必须有效`);
        assert.ok(q.reward && q.rewardIcon, `${q.id} 应有奖励预览`);
        assert.ok(['completed', 'active', 'available', 'locked'].includes(q.state));
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
