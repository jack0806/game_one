'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ENEMY_SIGNATURES } = require('../dist/data/EnemySignatureDB');
const { MINI_BOSSES, BOSSES, TEST_BOSSES } = require('../dist/data/BossDB');
const { ParticleManager } = require('../dist/systems/ParticleManager');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { BossController } = require('../dist/entities/BossController');
const { makeMockGame, makePlayer } = require('./mockGame');
const { enemyProjectileArt } = require('../dist/data/CombatArtDB');

test('十一名小首领与十一名首领的出手和全部主动技能都有独立配置', () => {
    const required = {
        squid: 3, turtle: 2, shrimp: 2, jelly: 2, drone_a: 2, drone_s: 3,
        chain_hound: 2, prism_snail: 2, triune_priest: 3, rail_butcher: 3, bell_devourer: 4,
        boss_ch1: 1, boss_ch2: 1, boss_ch3: 1, boss_ch4: 1, boss_mech: 4,
        boss_abyss: 5, boss_vespa: 5, boss_crucible_city: 5, boss_manyfold: 5,
        boss_invader: 4, boss_joker: 3,
    };
    const ids = new Set([
        ...MINI_BOSSES.map(m => m.id),
        ...BOSSES.map(b => b.chapter <= 4 ? 'boss_ch' + b.chapter : b.chapter === 5 ? 'boss_mech' : 'boss_invader'),
        ...TEST_BOSSES.map(b => 'boss_' + b.kind),
    ]);
    assert.equal(ids.size, 22);
    for (const id of ids) {
        const slots = ['attack', ...Array.from({ length: required[id] }, (_, i) => 'skill' + (i + 1))];
        if (/^boss_ch[1-4]$/.test(id)) slots.push('charge', 'summon');
        if (id.startsWith('boss_')) slots.push('phase');
        assert.ok(ENEMY_SIGNATURES[id], id);
        for (const slot of slots) assert.ok(ENEMY_SIGNATURES[id][slot], id + ' ' + slot);
        assert.equal(new Set(slots.map(slot => JSON.stringify(ENEMY_SIGNATURES[id][slot]))).size, slots.length, id);
    }
});

test('普攻与命中不叠加线框，技能只产生短时本体色碎屑', () => {
    const particles = new ParticleManager();
    particles.enemySignature('boss_vespa', 'attack', 300, 200, 0);
    assert.equal(particles.particles.length, 0);
    particles.enemySignature('boss_vespa', 'skill1', 300, 200, 0);
    const web = particles.particles.map(p => p.color);
    assert.ok(particles.particles.every(p => p.type === 'dot' && p.life <= 0.24));
    particles.clear();
    particles.enemySignature('boss_vespa', 'skill3', 300, 200, 0);
    const rain = particles.particles.map(p => p.color);
    assert.notDeepEqual(web, rain);
    assert.ok(particles.particles.every(p => p.type === 'dot'));
    particles.clear();
    particles.playerHit(300, 200, { source: 'boss_vespa', kind: 'vespa_rain' });
    assert.equal(particles.spriteFx[0].key, 'fx_damage_boss_vespa');
    assert.equal(particles.particles.length, 0);
    particles.enemySignature('boss_vespa', 'skill1', 300, 200, 0);
    const life = particles.particles[0].life;
    particles.update(0);
    assert.equal(particles.particles[0].life, life);
});

test('小首领的近战、状态技与远程施法在真实更新路径中触发对应轮廓', () => {
    const calls = [];
    const particles = new ParticleManager();
    const original = particles.enemySignature.bind(particles);
    particles.enemySignature = (...args) => { calls.push(args.slice(0, 2)); original(...args); };
    const game = makeMockGame({ particles });
    const player = makePlayer({ x: 600, y: 300 });

    const hound = new EnemyBase(); hound.init('chain_hound', 1, game); hound.x = 350; hound.y = 300;
    hound._miniCd1 = 0; hound._miniCd2 = 5;
    hound.update(0.02, player, game);
    assert.ok(calls.some(c => c[0] === 'chain_hound' && c[1] === 'skill1'));

    const turtle = new EnemyBase(); turtle.init('turtle', 1, game); turtle.x = 350; turtle.y = 300;
    turtle._miniCd1 = 0; turtle._miniTimer = 10;
    turtle.update(0.02, player, game);
    assert.ok(calls.some(c => c[0] === 'turtle' && c[1] === 'skill2'));

    const squid = new EnemyBase(); squid.init('squid', 1, game); squid.x = 350; squid.y = 300;
    squid._miniCd1 = 10; squid._miniCd2 = 0; squid._miniTimer = 10;
    squid.update(0.02, player, game);
    assert.ok(calls.some(c => c[0] === 'squid' && c[1] === 'skill1'));
});

test('大首领阶段、基础攻击与多技能轮转在真实控制器中使用自身轮廓', () => {
    const calls = [];
    const particles = new ParticleManager();
    particles.enemySignature = (...args) => calls.push(args.slice(0, 2));
    const game = makeMockGame({ particles, docBossSkillBusy: () => false,
        startDocBossBasic() {}, startDocBossSkill() {} });
    const player = makePlayer({ x: 600, y: 300 });
    const boss = new BossController(); boss.initBossKind('vespa', game); boss.x = 350; boss.y = 300;
    boss.docBasicTimer = 0; boss.docSkillTimer = 0;
    boss.update(0.02, player, game);
    assert.ok(calls.some(c => c[0] === 'boss_vespa' && c[1] === 'attack'));
    assert.ok(calls.some(c => c[0] === 'boss_vespa' && c[1] === 'skill1'));
    boss.hp = boss.maxHp * 0.6;
    boss.update(0.02, player, game);
    assert.ok(calls.some(c => c[0] === 'boss_vespa' && c[1] === 'phase'));
});

test('同弹种的首领弹体按伤害来源选择不同外形与尾迹', () => {
    assert.notEqual(enemyProjectileArt('homing', 'boss_ch3').key,
        enemyProjectileArt('homing', 'boss_invader').key);
    assert.notEqual(enemyProjectileArt('chaos', 'boss_ch4').key,
        enemyProjectileArt('chaos', 'boss_manyfold').key);
    assert.notEqual(enemyProjectileArt('blade', 'boss_mech').key,
        enemyProjectileArt('chaos', 'boss_ch4').key);
    assert.notEqual(enemyProjectileArt('sonic', 'drone_a').key,
        enemyProjectileArt('sonic', 'bell_devourer').key);
    const particles = new ParticleManager();
    particles.enemyProjectileTrail(0, 0, 'homing', 100, 0, '#fff', 8, 'boss_ch3');
    const hexColor = particles.particles[0].color;
    particles.clear();
    particles.enemyProjectileTrail(0, 0, 'homing', 100, 0, '#fff', 8, 'boss_invader');
    assert.notEqual(hexColor, particles.particles[0].color);
});

test('首领近战不叠加线框或共用刃片，滑稽猴保留专属耳光逐帧图', () => {
    const p = new ParticleManager();
    p.meleeSlash(100, 100, 0, '#88ccff', 90, 1.5, 'boss_mech');
    assert.equal(p.spriteFx.length, 0);
    assert.ok(p.particles.length > 0);
    assert.ok(p.particles.every(q => q.type === 'dot'));
    p.clear();
    p.meleeSlash(100, 100, 0, '#ffd24d', 70, 1.5, 'boss_joker');
    assert.equal(p.spriteFx[0].key, 'fx_joker_slap');
    assert.ok(p.particles.every(q => q.type === 'dot'));
});
