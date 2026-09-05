'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ParticleManager, spriteFxFrame } = require('../dist/systems/ParticleManager');
const { PlayerController } = require('../dist/entities/PlayerController');
const { CHARACTERS } = require('../dist/data/CharacterDB');
const { makeMockGame } = require('./mockGame');
const { EFFECT_ANIMATIONS } = require('../dist/data/EffectAnimationDB');
const fs = require('node:fs');
const path = require('node:path');

test('炮台开火使用四帧机械炮管序列并围绕固定枢轴旋转', () => {
    const clip = EFFECT_ANIMATIONS.fx_turret_barrel_fire;
    assert.equal(clip.sheet, 'anim_turret_barrel_fire');
    assert.equal(clip.loop, false);
    assert.deepEqual(clip.frames.map(frame => frame.index), [0, 1, 2, 3]);
    assert.ok(clip.frames.every(frame => frame.pivot[0] === 0.36 && frame.pivot[1] === 0.5));
});

test('枪口逐帧特效按实际寿命采样，朝向固定，清场立即消失', () => {
    const particles = new ParticleManager();
    particles.weaponFlash(240, 120, 0, -1, 'charged');
    const fx = particles.spriteFx[0];
    assert.deepEqual([fx.x, fx.y, fx.rotationDeg], [240, 120, 90]);
    assert.equal(spriteFxFrame(fx).index, 4);
    particles.update(0.04);
    assert.equal(spriteFxFrame(fx).index, 5);
    particles.update(0);
    assert.equal(spriteFxFrame(fx).index, 5, '暂停时保持原帧');
    particles.update(0.07);
    assert.equal(spriteFxFrame(fx).index, 6);
    particles.update(0.07);
    assert.equal(spriteFxFrame(fx).index, 7);
    assert.equal(fx.rotationDeg, 90, '不能用转动同一张图替代动作');
    particles.update(0.08);
    assert.equal(particles.spriteFx.length, 0);
    particles.weaponFlash(0, 0, 1, 0);
    particles.clear();
    assert.equal(particles.spriteFx.length, 0);
});

test('普通射击与散射均在开火帧生成一次枪口特效并与弹体重合', () => {
    for (const barrageMode of [false, true]) {
        const p = new PlayerController();
        p._charDef = CHARACTERS.kai;
        p.stats = { ...CHARACTERS.kai.stats, barrageMode };
        const particles = new ParticleManager(), bullets = [];
        const target = { x: p.x - 200, y: p.y - 100, alive: true };
        const game = makeMockGame({ particles, getNearestEnemy: () => target, bulletPool: { spawn: b => bullets.push(b) } });
        p._shoot({ mouse: target }, game);
        assert.equal(particles.spriteFx.length, 0);
        p.updateVisualAnimation(0.05); p.updateVisualAnimation(0.02);
        assert.equal(bullets.length, barrageMode ? 5 : 1);
        assert.equal(particles.spriteFx.length, 1);
        const fx = particles.spriteFx[0];
        for (const b of bullets) assert.deepEqual([fx.x, fx.y], [b.x, b.y]);
        const expected = -Math.atan2(target.y - fx.y, target.x - fx.x) * 180 / Math.PI;
        assert.ok(Math.abs(fx.rotationDeg - expected) < 1e-9);
    }
});

test('爆炸沿用密集爆点限流，爆炸与六角法阵均播放真实序列', () => {
    const particles = new ParticleManager();
    particles.explode(100, 100, '#ff8800', 100);
    particles.explode(105, 105, '#ff8800', 100);
    assert.equal(particles.spriteFx.length, 1);
    assert.equal(spriteFxFrame(particles.spriteFx[0]).index, 8);
    particles.hexActivate(300, 200, '#00ffcc');
    assert.equal(spriteFxFrame(particles.spriteFx[1]).index, 0);
    assert.equal(particles.spriteFx[1].animation.sheet, 'anim_fx_runic_reik');
});

test('混沌掌击和时间枪口使用各自序列，时间刃只在挥刃帧从武器位置展开', () => {
    for (const [id, key] of [['graf', 'fx_weapon_chaos'], ['olia', 'fx_weapon_time']]) {
        const p = new PlayerController(), particles = new ParticleManager(), bullets = [];
        p.charId = id; p.spriteKey = 'char_token_' + id; p._charDef = CHARACTERS[id];
        p.stats = { ...CHARACTERS[id].stats, critRate: 0 };
        const target = { x: p.x + 60, y: p.y, alive: true, radius: 18, takeDamage: d => d };
        const game = makeMockGame({ particles, getNearestEnemy: () => target, bulletPool: { spawn: b => bullets.push(b) } });
        p._shoot({ mouse: target }, game);
        p.updateVisualAnimation(0.05); p.updateVisualAnimation(0.02);
        assert.equal(particles.spriteFx[0].key, key);
        assert.deepEqual([particles.spriteFx[0].x, particles.spriteFx[0].y], [bullets[0].x, bullets[0].y]);
        if (id !== 'olia') continue;
        for (let i = 0; i < 12; i++) p.updateVisualAnimation(0.05);
        CHARACTERS.olia.eSkill(p, game);
        particles.clear();
        p._shoot({ mouse: target }, game);
        p.updateVisualAnimation(0.05);
        assert.equal(particles.spriteFx.length, 0);
        p.updateVisualAnimation(0.02);
        const blade = particles.spriteFx.find(fx => fx.key === 'fx_time_blade');
        assert.ok(blade);
        assert.deepEqual([blade.x, blade.y], p.getMuzzlePosition());
        assert.notDeepEqual([blade.x, blade.y], [p.x, p.y]);
        assert.equal(bullets.length, 1, '近战不会继续发射远程弹体');
    }
});

test('旧静态技能贴图与通用命中点燃均已接入真实四帧序列', () => {
    const expected = [
        'fx_hex_ring', 'fx_reik_cleave', 'fx_reik_warcry', 'fx_reik_death_will',
        'fx_enemy_bell_wave', 'fx_enemy_ember_brand', 'fx_hit', 'fx_ignite',
    ];
    for (const key of expected) {
        const clip = EFFECT_ANIMATIONS[key];
        assert.ok(clip, `${key}缺少动画登记`);
        assert.equal(clip.frames.length, 4, `${key}不是四帧动作`);
        assert.equal(clip.loop, false);
    }
    const particles = new ParticleManager();
    particles.hit(10, 20, '#ffffff');
    particles.ignite(30, 40);
    assert.ok(particles.spriteFx.some(fx => fx.key === 'fx_hit' && fx.animation));
    assert.ok(particles.spriteFx.some(fx => fx.key === 'fx_ignite' && fx.animation));
});

test('所有直接生成的美术特效key都有逐帧动画登记', () => {
    const root = process.cwd();
    const sources = [
        'assets/scripts/systems/ParticleManager.ts',
        'assets/scripts/entities/EnemyBase.ts',
    ].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    const keys = [...sources.matchAll(/spawnSpriteFx(?:\?\.)?\(\s*[^,]+,\s*[^,]+,\s*'([^']+)'/g)]
        .map(match => match[1]);
    assert.ok(keys.length > 0);
    for (const key of new Set(keys)) {
        assert.ok(EFFECT_ANIMATIONS[key], `${key}仍是静态贴图`);
    }
});
