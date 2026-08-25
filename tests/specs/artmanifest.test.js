'use strict';
// ============================================================
//  artmanifest.test.js — 资源清单自检
//  扫描代码里所有会被用作 art key 的字符串（背景/敌人/角色/子弹/特效/
//  词条icon/技能icon），逐个走 ArtRemap.resolveArtKey() 解析真实文件名，
//  断言 assets/resources/art/ 下确有对应 .png，防止拼写/映射错误导致
//  运行时 resources.load() 静默失败。
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { resolveArtKey } = require('../dist/core/ArtRemap');
const { CHARS } = require('../dist/data/CharacterDB');
const { AUGMENT_DB } = require('../dist/data/AugmentDB');
const { CHAPTERS } = require('../dist/data/WaveData');
const { QUESTS, CODEX_ENTRIES } = require('../dist/data/MetaProgressionDB');
const { ACHIEVEMENTS } = require('../dist/systems/SaveSystem');

const ART_DIR = path.join(__dirname, '..', '..', 'assets', 'resources', 'art');

function collectAllArtKeys() {
    const keys = new Set();
    keys.add('title_screen');
    keys.add('ui_gold_coin');
    keys.add('turret_base_vivian');
    keys.add('turret_barrel_vivian');
    for (const c of CHAPTERS) keys.add(c.bgKey);
    for (const t of [
        'enemy_grunt', 'enemy_shield', 'enemy_exploder', 'enemy_golem',
        'enemy_boss', 'enemy_boss_ch1', 'enemy_boss_ch2', 'enemy_boss_ch3', 'enemy_boss_ch4',
    ]) keys.add(t);
    for (const c of CHARS) {
        keys.add('char_' + c.id);
        keys.add('char_token_' + c.id);
        keys.add('bullet_' + c.id);
        keys.add('ui_icon_' + c.skillIcons.q);
        keys.add('ui_icon_' + c.skillIcons.e);
        keys.add('ui_icon_' + c.skillIcons.r);
    }
    for (const fx of ['fx_explosion', 'fx_hex_ring', 'fx_poison', 'fx_heal', 'fx_cold_arrow']) keys.add(fx);
    for (const a of AUGMENT_DB) keys.add('ui_icon_' + a.icon);
    for (const q of QUESTS) keys.add('ui_icon_' + q.rewardIcon);
    for (const entry of CODEX_ENTRIES) keys.add(entry.artKey);
    for (const a of ACHIEVEMENTS) keys.add('ui_icon_' + a.artKey);
    return keys;
}

test('全部art key经ArtRemap解析后,对应.png文件确实存在于assets/resources/art/', () => {
    const keys = collectAllArtKeys();
    assert.ok(keys.size > 0, '应至少收集到1个art key');

    const missing = [];
    for (const key of keys) {
        const resolved = resolveArtKey(key);
        const file = path.join(ART_DIR, resolved + '.png');
        if (!fs.existsSync(file)) missing.push(`${key} -> ${resolved}.png`);
    }
    assert.deepEqual(missing, [], `以下art key解析后找不到对应文件:\n${missing.join('\n')}`);
});

test('角色模型和头像使用同名资源,不会被旧映射再次串位', () => {
    for (const c of CHARS) {
        assert.equal(resolveArtKey('char_' + c.id), 'char_' + c.id);
        assert.equal(resolveArtKey('char_token_' + c.id), 'char_token_' + c.id);
    }
});

test('6个角色的skillIcons(q/e/r)全部落在合法的ui_icon_*共享图标集合内', () => {
    const validIcons = fs.readdirSync(ART_DIR)
        .filter(f => f.startsWith('ui_icon_') && f.endsWith('.png'))
        .map(f => f.slice('ui_icon_'.length, -'.png'.length));
    assert.ok(validIcons.length > 0, '应至少存在1张ui_icon_*.png');

    for (const c of CHARS) {
        for (const slot of ['q', 'e', 'r']) {
            const icon = c.skillIcons[slot];
            assert.ok(validIcons.includes(icon), `角色${c.id}技能${slot}的icon '${icon}' 不在合法图标集合内`);
        }
    }
});

test('49条词条的icon字段全部落在合法的ui_icon_*共享图标集合内', () => {
    const validIcons = fs.readdirSync(ART_DIR)
        .filter(f => f.startsWith('ui_icon_') && f.endsWith('.png'))
        .map(f => f.slice('ui_icon_'.length, -'.png'.length));

    // 冲刺功能砍掉后 phase_dash（冲刺变传送）词条一并删除：49条
    assert.equal(AUGMENT_DB.length, 49, '词条数量应为49（冲刺移除后phase_dash一并删除）');
    for (const a of AUGMENT_DB) {
        assert.ok(validIcons.includes(a.icon), `词条${a.id}的icon '${a.icon}' 不在合法图标集合内`);
    }
});
