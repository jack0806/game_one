'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BOSSES, getBossDef, TEST_BOSSES, MINI_BOSSES, TEST_GRUNTS, UNIT_CATALOG } = require('../dist/data/BossDB');
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

test('TEST_BOSSES含既有2只与设计文档3只大Boss', () => {
    assert.equal(TEST_BOSSES.length, 5, '测试房应有5个专属大Boss');
    const mech = TEST_BOSSES.find(t => t.kind === 'mech');
    const abyss = TEST_BOSSES.find(t => t.kind === 'abyss');
    assert.equal(mech.label, '机械高达X-剑');
    assert.equal(abyss.label, '深海恐惧');
    assert.deepEqual([mech.maxHp, mech.damage, mech.speed, mech.armor], [5500, 66, 68, 20], 'mech取第二章档位');
    assert.deepEqual([abyss.maxHp, abyss.damage, abyss.speed, abyss.armor], [9000, 94, 74, 30], 'abyss取第三章档位');
    assert.ok(mech.tintColor && abyss.tintColor, '测试Boss应有贴图染色');
    assert.ok(mech.spriteKey && abyss.spriteKey, '测试Boss应复用现有贴图');
});

test('维斯帕/坩埚/万相严格使用文档数值与独立俯视贴图', () => {
    const expected = {
        vespa: [6800, 42, 14, 78, 46, 480, 'enemy_boss_vespa'],
        crucible_city: [9800, 60, 30, 50, 50, 680, 'enemy_boss_crucible_city'],
        manyfold: [14500, 82, 38, 64, 48, 920, 'enemy_boss_manyfold'],
    };
    for (const [kind, row] of Object.entries(expected)) {
        const b = TEST_BOSSES.find(t => t.kind === kind);
        assert.ok(b, `${kind} 必须进入测试房Boss表`);
        assert.deepEqual([b.maxHp, b.damage, b.armor, b.speed, b.radius, b.goldValue, b.spriteKey], row);
        assert.equal(b.tintColor, '#ffffff', `${kind} 使用独立原画，不靠染色冒充`);
    }
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

test('MINI_BOSSES保留6个既有样例并纳入5个新设计小boss', () => {
    assert.equal(MINI_BOSSES.length, 11);
    const tiers = MINI_BOSSES.map(m => m.tier);
    assert.ok(tiers.includes('普通') && tiers.includes('史诗') && tiers.includes('地狱'), '三档齐全');
    assert.equal(new Set(MINI_BOSSES.map(m => m.id)).size, 11, 'id唯一');
    for (const m of MINI_BOSSES) {
        assert.ok(m.label.length > 0 && m.maxHp > 0 && m.damage > 0 && m.speed > 0, `${m.id}字段合法`);
        assert.ok(m.spriteKey && m.tintColor, `${m.id}贴图配置完整`);
    }
    const chain = MINI_BOSSES.find(m => m.id === 'chain_hound');
    const prism = MINI_BOSSES.find(m => m.id === 'prism_snail');
    const triune = MINI_BOSSES.find(m => m.id === 'triune_priest');
    const rail = MINI_BOSSES.find(m => m.id === 'rail_butcher');
    const bell = MINI_BOSSES.find(m => m.id === 'bell_devourer');
    assert.deepEqual([chain.maxHp, chain.damage, chain.armor, chain.speed, chain.radius, chain.goldValue], [1250, 22, 8, 92, 28, 90]);
    assert.deepEqual([prism.maxHp, prism.damage, prism.armor, prism.speed, prism.radius, prism.goldValue], [1450, 18, 14, 46, 32, 100]);
    assert.equal(chain.spriteKey, 'enemy_chain_hound', '铆链猎犬必须使用独立贴图');
    assert.equal(prism.spriteKey, 'enemy_prism_snail', '棱壳巡灯兽必须使用独立贴图');
    assert.deepEqual([triune.maxHp, triune.damage, triune.armor, triune.speed, triune.radius, triune.goldValue], [2300, 34, 16, 58, 30, 145]);
    assert.deepEqual([rail.maxHp, rail.damage, rail.armor, rail.speed, rail.radius, rail.goldValue], [2650, 40, 22, 72, 34, 165]);
    assert.deepEqual([bell.maxHp, bell.damage, bell.armor, bell.speed, bell.radius, bell.goldValue], [3900, 52, 28, 62, 38, 240]);
    assert.equal(triune.spriteKey, 'enemy_triune_priest', '三相祭司不得复用石狮子占位图');
    assert.equal(rail.spriteKey, 'enemy_rail_butcher', '磁轨屠夫不得复用石狮子占位图');
    assert.equal(bell.spriteKey, 'enemy_bell_devourer', '葬钟吞噬者不得复用石狮子占位图');
});

// ── 工具条单位目录 ──

test('TEST_GRUNTS首批锈齿扑兵严格使用设计文档数值与独立贴图', () => {
    const rust = TEST_GRUNTS.find(m => m.id === 'rust_biter');
    assert.ok(rust, '首批应包含锈齿扑兵');
    assert.deepEqual(
        [rust.maxHp, rust.damage, rust.speed, rust.armor, rust.attackInterval, rust.goldValue],
        [75, 7, 82, 0, 0.95, 7],
    );
    assert.equal(rust.spriteKey, 'enemy_rust_biter', '不得复用石狮子/旧grunt占位图');
});

test('断针射手严格使用设计文档数值与独立磁轨虫贴图', () => {
    const needle = TEST_GRUNTS.find(m => m.id === 'needle_gunner');
    assert.ok(needle, '首批远程生态应包含断针射手');
    assert.deepEqual(
        [needle.maxHp, needle.damage, needle.speed, needle.armor, needle.attackInterval, needle.goldValue],
        [58, 6, 58, 0, 1.65, 9],
    );
    assert.equal(needle.spriteKey, 'enemy_needle_gunner');
});

test('酸囊投手严格使用设计文档数值与独立酸囊贴图', () => {
    const acid = TEST_GRUNTS.find(m => m.id === 'acid_sac');
    assert.ok(acid);
    assert.deepEqual(
        [acid.maxHp, acid.damage, acid.speed, acid.armor, acid.attackInterval, acid.goldValue],
        [62, 4, 55, 0, 2.2, 10],
    );
    assert.equal(acid.spriteKey, 'enemy_acid_sac');
});

test('铆甲兽与掠金虫严格使用设计文档数值和独立贴图', () => {
    const rivet = TEST_GRUNTS.find(m => m.id === 'rivet_beast');
    const gold = TEST_GRUNTS.find(m => m.id === 'gold_scavenger');
    assert.deepEqual(
        [rivet.maxHp, rivet.damage, rivet.speed, rivet.armor, rivet.attackInterval, rivet.goldValue],
        [230, 9, 34, 18, 1.35, 14],
    );
    assert.equal(rivet.spriteKey, 'enemy_rivet_beast');
    assert.deepEqual(
        [gold.maxHp, gold.damage, gold.speed, gold.armor, gold.attackInterval, gold.goldValue],
        [46, 0, 105, 0, 999, 24],
    );
    assert.equal(gold.spriteKey, 'enemy_gold_scavenger');
});

test('余下四种炮灰严格使用设计文档数值与独立贴图', () => {
    const expected = {
        ember_acolyte: [68, 5, 50, 2, 2.4, 11, 'enemy_ember_acolyte'],
        frost_acolyte: [74, 5, 48, 2, 2.6, 11, 'enemy_frost_acolyte'],
        arc_leech: [82, 5, 68, 4, 2.0, 12, 'enemy_arc_leech'],
        blast_tick: [44, 28, 92, 0, 999, 10, 'enemy_blast_tick'],
    };
    for (const [id, row] of Object.entries(expected)) {
        const unit = TEST_GRUNTS.find(m => m.id === id);
        assert.ok(unit, `${id} 应纳入测试房炮灰目录`);
        assert.deepEqual(
            [unit.maxHp, unit.damage, unit.speed, unit.armor, unit.attackInterval, unit.goldValue, unit.spriteKey],
            row,
        );
    }
    assert.equal(TEST_GRUNTS.length, 9, '设计文档九种炮灰必须全部落地');
});

test('UNIT_CATALOG覆盖首领9/小boss11/既有小兵7并追加文档新怪', () => {
    const groups = { boss: [], miniboss: [], grunt: [] };
    for (const u of UNIT_CATALOG) groups[u.category].push(u.id);
    assert.deepEqual(groups.boss, ['boss_ch1', 'boss_ch2', 'boss_ch3', 'boss_ch4', 'boss_mech', 'boss_abyss', 'boss_vespa', 'boss_crucible_city', 'boss_manyfold']);
    assert.equal(groups.miniboss.length, 11, '小boss应来自MINI_BOSSES');
    assert.equal(groups.grunt.length, 7 + TEST_GRUNTS.length, '保留现有7种并追加文档新怪');
    assert.equal(new Set(UNIT_CATALOG.map(u => u.id)).size, UNIT_CATALOG.length, 'id全局唯一');
    for (const m of MINI_BOSSES) {
        assert.ok(UNIT_CATALOG.some(u => u.id === m.id), `小boss ${m.id} 应在目录中`);
    }
    for (const m of TEST_GRUNTS) {
        assert.ok(UNIT_CATALOG.some(u => u.id === m.id), `新怪 ${m.id} 应在目录中`);
    }
});

test('三只新大Boss按阶段固定轮转且第三阶段先释放第五技能', () => {
    for (const kind of ['vespa', 'crucible_city', 'manyfold']) {
        const game = makeMockGame();
        const calls = [];
        game.docBossSkillBusy = () => false;
        game.startDocBossSkill = (k, skill) => calls.push([k, skill]);
        game.startDocBossBasic = () => {};
        const player = { x: 800, y: 300, radius: 16, alive: true, takeDamage() {} };
        const boss = new BossController();
        boss.initBossKind(kind, game); boss.x = 300; boss.y = 250;
        assert.equal(boss.directionalFrames, false, `${kind} 为独立俯视单帧，不请求旧方向占位图`);
        boss.docSkillTimer = 0;
        boss.update(0.05, player, game);
        assert.deepEqual(calls.shift(), [kind, 0], `${kind} 第一阶段先教学技能1`);
        boss.phase = 3; boss.docSkillTimer = 0;
        boss.update(0.05, player, game);
        assert.deepEqual(calls.shift(), [kind, 4], `${kind} 第三阶段首次强制技能5`);
    }
});
