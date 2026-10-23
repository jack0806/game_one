'use strict';
// 元进度静态数据的结构测试：图鉴内容可替换，但 UI 所需字段必须完整。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHARS } = require('../dist/data/CharacterDB');
const { UNIT_CATALOG } = require('../dist/data/BossDB');
const { CODEX_ENTRIES, codexByCategory } = require('../dist/data/MetaProgressionDB');

test('任务树数据已按玩家要求移除,模块只导出图鉴', () => {
    const mp = require('../dist/data/MetaProgressionDB');
    assert.equal(mp.QUESTS, undefined);
    assert.equal(mp.questsByBranch, undefined);
    assert.ok(Array.isArray(mp.CODEX_ENTRIES));
});

test('图鉴覆盖全部英雄、首领、小首领与小兵', () => {
    const heroes = codexByCategory('hero');
    assert.equal(heroes.length, 8);
    assert.equal(codexByCategory('boss').length, 11);
    assert.equal(codexByCategory('miniboss').length, 11);
    assert.equal(codexByCategory('grunt').length, 16);
    assert.deepEqual(
        CODEX_ENTRIES.filter(e => e.category !== 'hero').map(e => e.id).sort(),
        UNIT_CATALOG.map(e => e.id).sort(),
    );
    assert.equal(new Set(CODEX_ENTRIES.map(e => e.id)).size, CODEX_ENTRIES.length);
    for (const entry of CODEX_ENTRIES) {
        assert.ok(entry.name && entry.subtitle && entry.desc && entry.combat && entry.artKey && entry.encounter);
        assert.ok(entry.traits.length >= 2, `${entry.id} 应提供可读特征标签`);
        assert.ok(!/占位|未解锁|未知样本/.test(entry.desc), `${entry.id} 不应保留占位文案`);
    }
});

test('图鉴英雄id与CharacterDB保持一致，避免后续新增时静默漂移', () => {
    assert.deepEqual(
        codexByCategory('hero').map(e => e.id).sort(),
        CHARS.map(c => c.id).sort(),
    );
});

test('八位英雄使用独立高清展示原画，PNG尺寸与导入元数据一致', () => {
    for (const hero of codexByCategory('hero')) {
        assert.equal(hero.artKey, `ui_hero_display_${hero.id}`);
        const file = path.join(__dirname, '../../assets/resources/art', `${hero.artKey}.png`);
        const png = fs.readFileSync(file);
        const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
        assert.ok(width >= 1024 && height >= 1024, `${hero.id} 展示图不可复用低分辨率战斗图`);
        assert.equal(width, height);
        const meta = JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8'));
        const frame = meta.subMetas.f9941.userData;
        assert.equal(frame.rawWidth, width);
        assert.equal(frame.rawHeight, height);
    }
});

test('三十八种敌方单位使用源稿直接渲染的独立展示图且保持原画比例', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,
        '../../docs/art/style-a/unit-display-2026-10-23/manifest.json'), 'utf8'));
    const enemies = CODEX_ENTRIES.filter(e => e.category !== 'hero');
    assert.deepEqual(manifest.map(e => e.id).sort(), enemies.map(e => e.id).sort());
    for (const unit of enemies) {
        assert.equal(unit.artKey, `ui_unit_display_${unit.id}`);
        const record = manifest.find(e => e.id === unit.id);
        const file = path.join(__dirname, '../../assets/resources/art', `${unit.artKey}.png`);
        const png = fs.readFileSync(file);
        const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
        assert.ok(Math.max(width, height) >= 400, `${unit.id} 不应复用低分辨率战斗帧`);
        assert.equal(width, record.width);
        assert.equal(height, record.height);
        assert.deepEqual(record.alphaBounds, [24, 24, width-24, height-24]);
        const frame = JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8')).subMetas.f9941.userData;
        assert.equal(frame.rawWidth, width);
        assert.equal(frame.rawHeight, height);
    }
});
