'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BOSSES, getBossDef, TEST_BOSSES, MINI_BOSSES, UNIT_CATALOG } = require('../dist/data/BossDB');
const { BossController } = require('../dist/entities/BossController');
const { makeMockGame } = require('./mockGame');

test('BOSSES包含4章首领,章节号1~4连续且字段完整', () => {
    assert.equal(BOSSES.length, 4, '应有4个Boss');
    BOSSES.forEach((b, i) => {
        assert.equal(b.chapter, i + 1, '章节号应1-based且连续');
        assert.ok(b.maxHp > 0 && b.damage > 0 && b.speed > 0, '基础数值应为正');
        assert.ok(b.label.length > 0, '应有显示名');
        assert.equal(b.spriteKey, `enemy_boss_ch${i + 1}`, '贴图key应对应章节号');
        assert.ok(b.radius > 0 && b.visualScale > 1 && b.attackWindupMax > 0, '碰撞/视觉/前摇字段应合法');
    });
});

test('Boss数值表与抽取前内联表逐字一致(不影响正式局平衡)', () => {
    assert.deepEqual(BOSSES.map(b => b.maxHp),     [3000, 5500, 9000, 14000]);
    assert.deepEqual(BOSSES.map(b => b.damage),    [42, 66, 94, 132]);
    assert.deepEqual(BOSSES.map(b => b.speed),     [62, 68, 74, 80]);
    assert.deepEqual(BOSSES.map(b => b.armor),     [10, 20, 30, 40]);
    assert.deepEqual(BOSSES.map(b => b.goldValue), [200, 400, 600, 800]);
    assert.deepEqual(BOSSES.map(b => b.radius),    [45, 45, 45, 45]);
});

test('getBossDef越界时回落到首/末章', () => {
    assert.equal(getBossDef(0).label, BOSSES[0].label);
    assert.equal(getBossDef(3).label, BOSSES[3].label);
    assert.equal(getBossDef(99).label, BOSSES[3].label, '过大章节回落最后一章');
    assert.equal(getBossDef(-5).label, BOSSES[0].label, '负章节回落第一章');
});

test('initBoss按0-based章节读到对应BossDB行', () => {
    const game = makeMockGame();
    for (let ch = 0; ch < 4; ch++) {
        const boss = new BossController();
        boss.initBoss(ch, game);
        const def = BOSSES[ch];
        assert.equal(boss.maxHp, def.maxHp, `第${ch + 1}章Boss生命应来自BossDB`);
        assert.equal(boss.damage, def.damage);
        assert.equal(boss.speed, def.speed);
        assert.equal(boss.armor, def.armor);
        assert.equal(boss.label, def.label);
        assert.equal(boss.spriteKey, def.spriteKey);
        assert.equal(boss.chapter, ch + 1, 'initBoss传入0-based章节,内部应为1-based');
    }
});

// ── 测试房间专属 Boss（文档 boss.docx） ──

test('TEST_BOSSES含机械高达X-剑与深海恐惧,数值取对应章节档位', () => {
    assert.equal(TEST_BOSSES.length, 2, '应有2个文档大Boss');
    const mech = TEST_BOSSES.find(t => t.kind === 'mech');
    const abyss = TEST_BOSSES.find(t => t.kind === 'abyss');
    assert.equal(mech.label, '机械高达X-剑');
    assert.equal(abyss.label, '深海恐惧');
    assert.deepEqual([mech.maxHp, mech.damage, mech.speed, mech.armor], [5500, 66, 68, 20], 'mech取第二章档位');
    assert.deepEqual([abyss.maxHp, abyss.damage, abyss.speed, abyss.armor], [9000, 94, 74, 30], 'abyss取第三章档位');
    assert.ok(mech.tintColor && abyss.tintColor, '测试Boss应有贴图染色');
    assert.ok(mech.spriteKey && abyss.spriteKey, '测试Boss应复用现有贴图');
});

test('initBossKind套用TEST_BOSSES数值并设置技能集', () => {
    const game = makeMockGame();
    for (const def of TEST_BOSSES) {
        const boss = new BossController();
        boss.initBossKind(def.kind, game);
        assert.equal(boss.bossKind, def.kind, '应记录技能集');
        assert.equal(boss.label, def.label);
        assert.equal(boss.maxHp, def.maxHp);
        assert.equal(boss.damage, def.damage);
        assert.equal(boss.speed, def.speed);
        assert.equal(boss.armor, def.armor);
        assert.equal(boss.tintColor, def.tintColor);
    }
});

// ── 测试房间小 Boss（文档 boss.docx） ──

test('MINI_BOSSES含6个文档小boss且三档强度齐全', () => {
    assert.equal(MINI_BOSSES.length, 6);
    const tiers = MINI_BOSSES.map(m => m.tier);
    assert.ok(tiers.includes('普通') && tiers.includes('史诗') && tiers.includes('地狱'), '三档齐全');
    assert.equal(new Set(MINI_BOSSES.map(m => m.id)).size, 6, 'id唯一');
    for (const m of MINI_BOSSES) {
        assert.ok(m.label.length > 0 && m.maxHp > 0 && m.damage > 0 && m.speed > 0, `${m.id}字段合法`);
        assert.ok(m.spriteKey && m.tintColor, `${m.id}复用贴图+染色`);
    }
    // 档位数值范围约束（普通≈1200/史诗≈2200/地狱≈2800）
    const byTier = (t) => MINI_BOSSES.filter(m => m.tier === t).map(m => m.maxHp);
    assert.ok(byTier('普通').every(h => h >= 900 && h <= 1600), '普通档生命范围');
    assert.ok(byTier('史诗').every(h => h >= 1600 && h <= 2600), '史诗档生命范围');
    assert.ok(byTier('地狱').every(h => h >= 2600 && h <= 3200), '地狱档生命范围');
});

// ── 工具条单位目录 ──

test('UNIT_CATALOG覆盖首领6/小boss6/小兵7且id与生成路径一致', () => {
    const groups = { boss: [], miniboss: [], grunt: [] };
    for (const u of UNIT_CATALOG) groups[u.category].push(u.id);
    assert.deepEqual(groups.boss, ['boss_ch1', 'boss_ch2', 'boss_ch3', 'boss_ch4', 'boss_mech', 'boss_abyss']);
    assert.equal(groups.miniboss.length, 6, '小boss应来自MINI_BOSSES');
    assert.equal(groups.grunt.length, 7, '小兵应覆盖现有7种');
    assert.equal(new Set(UNIT_CATALOG.map(u => u.id)).size, UNIT_CATALOG.length, 'id全局唯一');
    for (const m of MINI_BOSSES) {
        assert.ok(UNIT_CATALOG.some(u => u.id === m.id), `小boss ${m.id} 应在目录中`);
    }
});
