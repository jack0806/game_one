// ============================================================
//  augmentfilter.test.js — 词条攻击方式适配过滤回归测试
//  近战角色(reik)不应刷到只作用于子弹的纯弹道词条(反弹弹道/穿透/弹幕等)
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AugmentManager } = require('../dist/systems/AugmentManager');
const { AUGMENT_DB } = require('../dist/data/AugmentDB');
const { makeMockGame, makePlayer } = require('./mockGame');

const RANGED_ONLY = AUGMENT_DB.filter(a => a.attackType === 'ranged').map(a => a.id);

test('数据库标记的纯弹道词条共6个:穿透/双重/反弹/弹幕之心/弹幕宇宙/全力豪赌', () => {
    assert.deepEqual([...RANGED_ONLY].sort(),
        ['all_in', 'barrage', 'barrage_nova', 'bounce', 'double_shot', 'pierce'].sort());
});

test('近战角色(reik)候选池不出现纯弹道词条(大量采样)', () => {
    const am = new AugmentManager();
    for (let i = 0; i < 600; i++) {
        for (const o of am.rollOptions(3, 20, 'reik')) {
            assert.ok(!RANGED_ONLY.includes(o.id), `近战不应刷到远程词条: ${o.id}(${o.name})`);
        }
    }
});

test('远程角色(kai)仍可正常刷到弹道词条(过滤不误伤)', () => {
    const am = new AugmentManager();
    let sawBounce = false;
    for (let i = 0; i < 600; i++) {
        for (const o of am.rollOptions(3, 20, 'kai')) {
            if (o.id === 'bounce') sawBounce = true;
        }
    }
    assert.ok(sawBounce, '远程角色大量采样应能见到反弹弹道');
});

test('近战候选池仍有足量可用词条(过滤后不至于无卡可刷)', () => {
    const am = new AugmentManager();
    let full = 0;
    for (let i = 0; i < 100; i++) {
        const opts = am.rollOptions(3, 20, 'reik');
        if (opts.length === 3) full++;
    }
    assert.ok(full >= 99, `应几乎每次都满3张,实际只有${full}/100`);
});

test('混沌加成(chaosBonus)给近战角色附加词条时同样过滤远程词条', () => {
    const universal = AUGMENT_DB.find(a => a.id === 'hp_up');
    const game = makeMockGame({ spawnTurret() {}, spawnClone() {}, checkTurretArmy() {} });
    for (let i = 0; i < 300; i++) {
        const am = new AugmentManager();
        const player = makePlayer({ charId: 'reik' });
        player.stats.chaosBonus = true;
        am.equip(universal, player, game);
        assert.ok(am.active.length >= 1, '基础词条应装备成功');
        for (const a of am.active) {
            assert.ok(!RANGED_ONLY.includes(a.id), `混沌加成不应给近战远程词条: ${a.id}`);
        }
    }
});

test('未指定charId时不做过滤(向后兼容)', () => {
    const am = new AugmentManager();
    let sawRanged = false;
    for (let i = 0; i < 300; i++) {
        for (const o of am.rollOptions(3, 20)) {
            if (RANGED_ONLY.includes(o.id)) sawRanged = true;
        }
    }
    assert.ok(sawRanged, '无charId时弹道词条照常出现');
});
