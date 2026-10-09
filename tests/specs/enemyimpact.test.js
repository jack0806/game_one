'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ENEMY_HIT_ART, enemyHitArt } = require('../dist/data/CombatArtDB');
const { EFFECT_ANIMATIONS } = require('../dist/data/EffectAnimationDB');
const { UNIT_CATALOG } = require('../dist/data/BossDB');
const { ParticleManager, spriteFxFrame } = require('../dist/systems/ParticleManager');
const { BulletPool } = require('../dist/entities/BulletController');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { BossController } = require('../dist/entities/BossController');
const { PlayerController } = require('../dist/entities/PlayerController');
const { makeMockGame } = require('./mockGame');

test('35种攻击单位逐一拥有独立四帧命中图行，资源存在且不复用换色', () => {
    const rows = new Set();
    for (const unit of UNIT_CATALOG.filter(u => !['gold_scavenger', 'drone_s'].includes(u.id))) {
        const art = ENEMY_HIT_ART[unit.id];
        assert.ok(art, unit.id);
        const clip = EFFECT_ANIMATIONS[art.key];
        assert.equal(clip.frames.length, 4);
        assert.ok(art.size >= 56 && art.size <= 72);
        const identity = clip.sheet + '/' + clip.frames[0].index;
        assert.ok(!rows.has(identity), unit.id);
        rows.add(identity);
        assert.ok(fs.existsSync(path.join(__dirname, '../../assets/resources/art', clip.sheet + '.png')));
    }
    assert.equal(rows.size, 35);
    assert.equal(ENEMY_HIT_ART.gold_scavenger, undefined);
    assert.equal(ENEMY_HIT_ART.drone_s, undefined);
});

test('各来源敌弹经过对象池和真实伤害结算后播放对应动画，回池不串来源', () => {
    const pool = new BulletPool(1);
    const p = new PlayerController(); p.stats = { armor: 0, maxHp: 10000 }; p.hp = 10000; p.x = 300; p.y = 300;
    const particles = new ParticleManager(), game = makeMockGame({ particles, state: 'testRoom' });
    for (const source of Object.keys(ENEMY_HIT_ART)) {
        particles.clear();
        pool.spawn({ x: 300, y: 300, vx: 0, vy: 1, damage: 5, radius: 5, lifeTime: 1, owner: 'enemy', isEnemyBullet: true, hitSource: source });
        const hp = p.hp;
        pool.updateEnemyBullets(0.016, p, game);
        assert.equal(p.hp, hp - 5, source);
        assert.equal(particles.spriteFx[0].key, ENEMY_HIT_ART[source].key, source);
        assert.equal(particles.spriteFx[0].rotationDeg, -90);
        assert.ok(!particles.particles.some(f => f.type === 'ring'));
    }
    const recycled = pool.spawn({ owner: 'enemy', isEnemyBullet: true });
    assert.equal(recycled.hitSource, undefined);
});

test('真实针枪发射保存单位身份，十种首领身份不会退化为通用boss', () => {
    const game = makeMockGame();
    const p = new PlayerController(); p.x = 500; p.y = 300;
    const e = new EnemyBase(); e.init('needle_gunner', 1, game); e.x = 300; e.y = 300; e._rangedCd = 0;
    for (let i = 0; i < 100 && !game.enemyBullets.length; i++) e.update(0.05, p, game);
    assert.ok(game.enemyBullets.length);
    assert.ok(game.enemyBullets.every(b => b.hitSource === 'needle_gunner'));
    for (let chapter = 0; chapter < 6; chapter++) {
        const boss = new BossController(); boss.initBoss(chapter, game);
        assert.equal(boss.hitSource, chapter === 4 ? 'boss_mech' : chapter === 5 ? 'boss_invader' : 'boss_ch' + (chapter + 1));
    }
    for (const kind of ['abyss', 'vespa', 'crucible_city', 'manyfold']) {
        const boss = new BossController(); boss.initBossKind(kind, game);
        assert.equal(boss.hitSource, 'boss_' + kind);
    }
});

test('同一首领的毒液和爪击、祭司的冰火电具有不同命中材质', () => {
    assert.notEqual(enemyHitArt({ source: 'boss_ch1' }).key, enemyHitArt({ source: 'boss_ch1', kind: 'poison' }).key);
    const priest = ['', 'frost', 'fire'].map(kind => enemyHitArt({ source: 'triune_priest', kind }).key);
    assert.equal(new Set(priest).size, 3);
    assert.notEqual(enemyHitArt({ source: 'boss_vespa' }).key, enemyHitArt({ source: 'boss_vespa', kind: 'vespa_rain' }).key);
    assert.notEqual(enemyHitArt({ source: 'boss_invader', kind: 'beam' }).key, enemyHitArt({ source: 'boss_invader', kind: 'explosion' }).key);
    assert.notEqual(enemyHitArt({ source: 'boss_mech' }).key, enemyHitArt({ source: 'boss_mech', kind: 'explosion' }).key);
});

test('不同来源同时受击保留区别但最多叠两份，四帧真实推进并及时消散', () => {
    const particles = new ParticleManager();
    particles.playerHit(100, 100, { source: 'grunt' });
    particles.playerHit(100, 100, { source: 'frost_acolyte' });
    particles.playerHit(100, 100, { source: 'needle_gunner' });
    assert.equal(particles.spriteFx.length, 2);
    assert.notEqual(particles.spriteFx[0].key, particles.spriteFx[1].key);
    const fx = particles.spriteFx[0], first = spriteFxFrame(fx).index;
    particles.update(0.04); assert.equal(spriteFxFrame(fx).index, first + 1);
    particles.update(0.17); assert.equal(spriteFxFrame(fx).index, first + 2);
    particles.update(0.10); assert.equal(spriteFxFrame(fx).index, first + 3);
    particles.update(0.10); assert.equal(particles.spriteFx.length, 0);
    particles.impact(100, 100, 0, 1, '#bd73ff');
    assert.ok(!particles.particles.some(f => f.type === 'ring'), '紫色方向冲击不能重新冒出通用圆环');
});
