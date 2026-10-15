'use strict';
// 元进度静态数据的结构测试：图鉴内容可替换，但 UI 所需字段必须完整。
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHARS } = require('../dist/data/CharacterDB');
const { CODEX_ENTRIES, codexByCategory } = require('../dist/data/MetaProgressionDB');

test('任务树数据已按玩家要求移除,模块只导出图鉴', () => {
    const mp = require('../dist/data/MetaProgressionDB');
    assert.equal(mp.QUESTS, undefined);
    assert.equal(mp.questsByBranch, undefined);
    assert.ok(Array.isArray(mp.CODEX_ENTRIES));
});

test('图鉴提供8个怪物和8个英雄，并保留未解锁问号状态所需数据', () => {
    const monsters = codexByCategory('monster');
    const heroes = codexByCategory('hero');
    assert.equal(monsters.length, 8);
    assert.equal(heroes.length, 8);
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
