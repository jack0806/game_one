'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ParticleManager, spriteFxFrame } = require('../dist/systems/ParticleManager');
const { AUGMENT_DB, spawnExplosion } = require('../dist/data/AugmentDB');
const { GameConfig } = require('../dist/data/GameConfig');
const { makeMockGame, makePlayer } = require('./mockGame');

test('四种新元素在未持有元素暴击时也有独立命中材质', () => {
    for (const [id, element] of [['hex35', 'thunder'], ['hex36', 'frost'], ['hex37', 'light'], ['hex38', 'shadow']]) {
        const particles = new ParticleManager();
        const game = makeMockGame({ particles });
        const enemy = { alive: true, x: 300, y: 200, dots: [], frozen: 0, takeTrueDamage() {} };
        const hex = { ...AUGMENT_DB.find(a => a.id === id), level: 1 };
        hex.onHit(makePlayer(), enemy, 20, game);
        const fx = particles.spriteFx.find(f => f.key === 'fx_element_' + element);
        assert.ok(fx, id);
        assert.equal(fx.animation.sheet, 'anim_fx_element_augments');
        assert.equal(fx.layer, 'impact');
        assert.ok(fx.scale * 64 < 48, '普攻附带材质不遮住整个敌人');
    }
});

test('落雷与碎冰保留范围伤害及墙体遮挡判定，材质与音效按元素区分', () => {
    for (const element of ['thunder', 'frost']) {
        const hits = [], sounds = [], particles = new ParticleManager();
        const game = makeMockGame({ particles, audio: { playSfx: name => sounds.push(name) },
            arenaLineClear: (_x, _y, x) => x !== 320 });
        game.enemies = [300, 320, 500].map(x => ({ alive: true, x, y: 200, takeDamage: dmg => hits.push(dmg) }));
        spawnExplosion(makePlayer(), 300, 200, 40, 70, game, element);
        assert.deepEqual(hits, [40]);
        assert.deepEqual(sounds, [element === 'thunder' ? 'lightning' : 'freeze']);
        assert.deepEqual(particles.spriteFx.map(f => f.key), ['fx_element_' + element]);
    }
});

test('冰元素冻结和碎冰特权调用冰晶爆发，不再出现橙色火球', () => {
    const particles = new ParticleManager(), game = makeMockGame({ particles });
    const hex = { ...AUGMENT_DB.find(a => a.id === 'hex36'), level: 3 };
    const enemy = { alive: true, x: 300, y: 200, frozen: 0 };
    const player = makePlayer();
    for (let i = 0; i < 4; i++) hex.onHit(player, enemy, 20, game);
    assert.equal(enemy.frozen, 1.2);
    assert.equal(particles.spriteFx.length, 1, '冻结爆发替换同处微型冰花');
    assert.equal(particles.spriteFx[0].motion, 'burst');
    particles.clear();
    let damage = 0;
    enemy.takeDamage = value => damage += value;
    game.enemies = [enemy];
    hex.onCrit(player, enemy, 20, game);
    assert.equal(enemy.frozen, 0);
    assert.equal(damage, player.stats.damage * GameConfig.get('perkShatterDmg'));
    assert.equal(particles.spriteFx[0].key, 'fx_element_frost');
});

test('高频元素命中特效有数量上限，满池仍能让爆发替换微型火花', () => {
    const particles = new ParticleManager();
    for (let i = 0; i < 1000; i++) particles.elementImpact(i * 80, 100, 'light');
    assert.equal(particles.spriteFx.length, 12);
    assert.equal(particles.particles.length, 0, '不为高频附带命中额外堆积散点');
    particles.elementImpact(0, 100, 'light', 70);
    assert.equal(particles.spriteFx.length, 12);
    assert.equal(particles.spriteFx.filter(f => f.motion === 'burst').length, 1);
    for (let i = 0; i < 100; i++) particles.elementImpact(0, 100, 'light', 70);
    assert.equal(particles.spriteFx.length, 12);
    const burst = particles.spriteFx.find(f => f.motion === 'burst');
    const frames = new Set();
    for (const elapsed of [0, .04, .15, .3]) {
        burst.life = burst.maxLife - elapsed;
        frames.add(spriteFxFrame(burst).index);
    }
    assert.equal(frames.size, 4, '爆发完整播放四个真实绘制阶段');
    particles.update(.4);
    assert.equal(particles.spriteFx.length, 0);
    particles.elementImpact(0, 0, 'shadow');
    particles.clear();
    particles.elementImpact(0, 0, 'shadow');
    assert.equal(particles.spriteFx.length, 1, '清场后不遗留节流状态');
});
