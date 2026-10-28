'use strict';
// ============================================================
//  artmanifest.test.js �� ��Դ�嵥�Լ�
//  ɨ����������лᱻ���� art key ���ַ���������/����/��ɫ/�ӵ�/��Ч/
//  ����icon/����icon��������� ArtRemap.resolveArtKey() ������ʵ�ļ�����
//  ���� assets/resources/art/ ��ȷ�ж�Ӧ .png����ֹƴд/ӳ�������
//  ����ʱ resources.load() ��Ĭʧ�ܡ�
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { resolveArtKey } = require('../dist/core/ArtRemap');
const { CHARS } = require('../dist/data/CharacterDB');
const { AUGMENT_DB } = require('../dist/data/AugmentDB');
const { MAPS } = require('../dist/data/LevelIndex');
const { CHAPTER_ARENAS } = require('../dist/data/ChapterArenaDB');
const { CODEX_ENTRIES } = require('../dist/data/MetaProgressionDB');
const { ACHIEVEMENTS } = require('../dist/systems/SaveSystem');
const { DEPOT_ART_KEYS } = require('../dist/data/DepotCatalog');

const ART_DIR = path.join(__dirname, '..', '..', 'assets', 'resources', 'art');

function collectAllArtKeys() {
    const keys = new Set();
    for (const key of DEPOT_ART_KEYS) keys.add(key);
    keys.add('title_screen');
    keys.add('ui_gold_coin');
    keys.add('ui_lobby_portal_frame');
    keys.add('ui_portrait_via');
    keys.add('ui_portrait_mortis');
    keys.add('turret_base_vivian');
    keys.add('turret_barrel_vivian');
    for (const m of MAPS) keys.add(m.bgKey);
    for (const layout of CHAPTER_ARENAS) for (const prop of layout.obstacles) keys.add(prop.artKey);
    for (const t of [
        'enemy_grunt', 'enemy_shield', 'enemy_exploder', 'enemy_golem',
        'enemy_boss', 'enemy_boss_ch1', 'enemy_boss_ch2', 'enemy_boss_ch3', 'enemy_boss_ch4',
        'enemy_boss_joker', 'anim_stylea_boss_joker_front', 'anim_stylea_boss_joker_side',
        'anim_stylea_boss_joker_back', 'anim_fx_joker_slap', 'anim_fx_joker_trick',
        // ���鷨ʦ����ר����ͼ��2026-10-10 ��⣩
        'fx_rot_fog', 'fx_plague_wave', 'unit_skeleton',
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
    for (const entry of CODEX_ENTRIES) keys.add(entry.artKey);
    for (const a of ACHIEVEMENTS) keys.add('ui_icon_' + a.artKey);
    return keys;
}

test('ȫ��art key��ArtRemap������,��Ӧ.png�ļ�ȷʵ������assets/resources/art/', () => {
    const keys = collectAllArtKeys();
    assert.ok(keys.size > 0, 'Ӧ�����ռ���1��art key');

    const missing = [];
    for (const key of keys) {
        const resolved = resolveArtKey(key);
        const file = path.join(ART_DIR, resolved + '.png');
        if (!fs.existsSync(file)) missing.push(`${key} -> ${resolved}.png`);
    }
    assert.deepEqual(missing, [], `����art key�������Ҳ�����Ӧ�ļ�:\n${missing.join('\n')}`);
});

test('��ɫģ�ͺ�ͷ��ʹ��ͬ����Դ,���ᱻ��ӳ���ٴδ�λ', () => {
    for (const c of CHARS) {
        assert.equal(resolveArtKey('char_' + c.id), 'char_' + c.id);
        assert.equal(resolveArtKey('char_token_' + c.id), 'char_token_' + c.id);
    }
});

test('6����ɫ��skillIcons(q/e/r)ȫ�����ںϷ���ui_icon_*����ͼ�꼯����', () => {
    const validIcons = fs.readdirSync(ART_DIR)
        .filter(f => f.startsWith('ui_icon_') && f.endsWith('.png'))
        .map(f => f.slice('ui_icon_'.length, -'.png'.length));
    assert.ok(validIcons.length > 0, 'Ӧ���ٴ���1��ui_icon_*.png');

    for (const c of CHARS) {
        for (const slot of ['q', 'e', 'r']) {
            const icon = c.skillIcons[slot];
            assert.ok(validIcons.includes(icon), `��ɫ${c.id}����${slot}��icon '${icon}' ���ںϷ�ͼ�꼯����`);
        }
    }
});

test('32������˹��icon�ֶ�ȫ�����ںϷ���ui_icon_*����ͼ�꼯����', () => {
    const validIcons = fs.readdirSync(ART_DIR)
        .filter(f => f.startsWith('ui_icon_') && f.endsWith('.png'))
        .map(f => f.slice('ui_icon_'.length, -'.png'.length));

    // 2026-09-14 ������˹.docx���������� 49 ���������滻������׷��Ԫ����ϵ���Զ������ 32 ��
    assert.equal(AUGMENT_DB.length, 32, '����˹����ӦΪ32');
    for (const a of AUGMENT_DB) {
        assert.ok(validIcons.includes(a.icon), `����˹${a.id}��icon '${a.icon}' ���ںϷ�ͼ�꼯����`);
    }
});
