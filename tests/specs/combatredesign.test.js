'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ParticleManager } = require('../dist/systems/ParticleManager');
const { BulletPool } = require('../dist/entities/BulletController');
const { ENEMY_PROJECTILE_ART } = require('../dist/data/CombatArtDB');
const { drawChargeLane, drawEnergyBeam } = require('../dist/core/CombatVfx');
const { makeMockGame, makePlayer } = require('./mockGame');
const { UNIT_ATTACK_ART } = require('../dist/data/CombatArtDB');
const { UNIT_CATALOG } = require('../dist/data/BossDB');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { PlayerController } = require('../dist/entities/PlayerController');

function hurtPlayer() {
    const p = new PlayerController();
    p.x = 440; p.y = 300; p.hp = 100;
    p.stats = { armor: 0, maxHp: 100 };
    return p;
}

test('普通近战与普通敌弹命中英雄均产生前景撞击，挥空不产生英雄受击闪光', () => {
    for (const kind of ['melee', 'bullet', 'miss']) {
        const particles = new ParticleManager();
        const game = makeMockGame({ particles });
        const p = hurtPlayer();
        if (kind === 'bullet') {
            const pool = new BulletPool(4);
            pool.spawn({ x: 425, y: 300, vx: 120, vy: 0, damage: 10, radius: 5,
                owner: 'enemy', isEnemyBullet: true, enemyFx: 'needle', lifeTime: 2 });
            pool.updateEnemyBullets(0.016, p, game);
        } else {
            const e = new EnemyBase();
            e.init('grunt', 1, game); e.x = 400; e.y = 300; e.speed = 0;
            e.update(0.016, p, game);
            if (kind === 'miss') p.x = 750;
            e.update(e.attackWindupMax, p, game);
        }
        const fx = particles.spriteFx.find(f => f.key.startsWith('fx_damage_'));
        if (kind === 'miss') { assert.equal(p.hp, 100); assert.equal(fx, undefined); }
        else { assert.ok(p.hp < 100, kind); assert.ok(fx, kind); assert.equal(fx.layer, 'impact'); }
    }
});

test('无敌与保护帧免伤仍显示接触，护盾完全吸收保留格挡', () => {
    for (const mode of ['god', 'invincible', 'iframe', 'shield']) {
        const particles = new ParticleManager(), p = hurtPlayer();
        const game = makeMockGame({ particles });
        if (mode === 'god') p.godMode = true;
        if (mode === 'invincible') p._invincible = 1;
        if (mode === 'iframe') p._iframeTimer = 1;
        if (mode === 'shield') p.shield = 30;
        p.takeDamage(10, game);
        assert.equal(p.hp, 100, mode);
        assert.equal(particles.spriteFx.some(f => f.playerContact), mode !== 'shield', mode);
        if (mode === 'shield') { assert.equal(p.shield, 20); assert.ok(particles.particles.length > 0); }
    }
});

test('高频真实受伤仍逐次扣血，英雄闪光只保留一份并优先获得渲染位', () => {
    const particles = new ParticleManager(), p = hurtPlayer();
    const game = makeMockGame({ particles });
    for (let i = 0; i < 30; i++) particles.hit(i * 80, 100, '#fff');
    for (let i = 0; i < 8; i++) p.takeDamage(1, game, { ignoreIframe: true });
    assert.equal(p.hp, 92);
    assert.equal(particles.spriteFx.filter(f => f.key.startsWith('fx_damage_')).length, 1);
    const fx = particles.spriteFx[0];
    assert.equal(fx.key, 'fx_damage_physical');
    assert.equal(fx.scale * 64, 56);
    assert.equal(fx.baseAlpha, 1);
    particles.update(0.41);
    assert.ok(!particles.spriteFx.some(f => f.key.startsWith('fx_damage_')));
});

test('37种单位均有明确攻击表现身份，掠金虫保留无攻击设计', () => {
    assert.equal(UNIT_CATALOG.length, 37);
    for (const unit of UNIT_CATALOG) assert.ok(UNIT_ATTACK_ART[unit.id], unit.id);
    assert.equal(UNIT_ATTACK_ART.gold_scavenger, 'fx_hex_ring');
    assert.notEqual(UNIT_ATTACK_ART.shield, UNIT_ATTACK_ART.grunt);
    assert.notEqual(UNIT_ATTACK_ART.boss_ch2, UNIT_ATTACK_ART.boss_ch4);
});

test('怪物挥空仍有出手弧刃，离开判定范围不会受到伤害', () => {
    const game = makeMockGame();
    game.particles = new ParticleManager();
    const e = new EnemyBase();
    e.init('grunt', 1, game); e.x = 400; e.y = 300; e.speed = 0;
    const player = makePlayer({x: 440, y: 300});
    e.update(0.016, player, game);
    player.x = 700;
    const hp = player.hp;
    e.update(e.attackWindupMax, player, game);
    assert.equal(player.hp, hp);
    assert.ok(game.particles.spriteFx.some(f => f.key === 'fx_enemy_claw_slash'));
});

test('挥击有弧刃和方向碎屑，不再生成三条直线或扩散圆盘', () => {
    const p = new ParticleManager();
    p.meleeSlash(100, 120, Math.PI / 2, '#ff6655', 80, 1.8);
    assert.equal(p.spriteFx.length, 1);
    assert.equal(p.spriteFx[0].rotationDeg, -90);
    assert.equal(p.spriteFx[0].x, 100);
    assert.ok(p.spriteFx[0].y > 120);
    assert.ok(p.particles.length > 0);
    assert.ok(p.particles.every(p => p.type === 'dot'));
    p.update(1);
    assert.equal(p.spriteFx.length, 0);
    assert.equal(p.particles.length, 0);
});

test('全部敌弹语义都有实体资源，尾迹无长方形线段', () => {
    for (const [key, art] of Object.entries(ENEMY_PROJECTILE_ART)) {
        assert.ok(art.key.startsWith('fx_enemy_'));
        const p = new ParticleManager();
        p.enemyProjectileTrail(100, 100, key, 400, 100, '#fff', 6);
        assert.ok(p.particles.length > 0, key);
        assert.ok(p.particles.every(p => p.type === 'dot'), key);
        assert.ok(p.particles.every(p => p.maxLife <= 0.18), key);
    }
});

test('高密度弹体保持真实位移和回收，复用不串弹种或追踪配置', () => {
    const pool = new BulletPool(400);
    const game = makeMockGame();
    const player = makePlayer({ x: 1100, y: 550 });
    const keys = Object.keys(ENEMY_PROJECTILE_ART);
    for (let i = 0; i < 320; i++) pool.spawn({ x: 100, y: 150, vx: 100, vy: 0,
        enemyFx: keys[i % keys.length], isEnemyBullet: true, owner: 'enemy', lifeTime: 1 });
    pool.updateEnemyBullets(0.05, player, game);
    assert.equal(pool.active.length, 320);
    assert.ok(pool.active.every(b => b.x === 105));
    pool.updateEnemyBullets(1, player, game);
    assert.equal(pool.active.length, 0);
    const b = pool.spawn({ isEnemyBullet: true, enemyFx: 'gear' });
    assert.equal(b.enemyFx, 'gear');
    assert.equal(b.homing, false);
    assert.equal(b.dot, undefined);
});

function graphics() {
    const points = [];
    return { points, moveTo(x, y) { points.push([x, y]); }, lineTo(x, y) { points.push([x, y]); },
        close() {}, fill() {}, stroke() {} };
}

test('冲锋预警只在实际宽度两侧断续显示，不画中心瞄准线', () => {
    const g = graphics();
    drawChargeLane(g, 0, 0, 0, 250, 30, 0.5);
    assert.ok(g.points.length > 4);
    assert.ok(g.points.every(([x, y]) => x <= 250 && Math.abs(y) === 30));
});

test('光束释放轮廓有尖端与宽度变化，时间推进产生流动且不超判定宽度', () => {
    const a = graphics(), b = graphics();
    drawEnergyBeam(a, 0, 0, 900, 0, 14, 0);
    drawEnergyBeam(b, 0, 0, 900, 0, 14, 0.1);
    assert.notDeepEqual(a.points, b.points);
    assert.ok(a.points.every(([x, y]) => x >= 0 && x <= 900 && Math.abs(y) <= 14));
    assert.ok(new Set(a.points.map(p => Math.round(Math.abs(p[1])))).size > 5);
});
const { localSectorBounds, drawEnergyArc } = require('../dist/core/CombatVfx');
const { CHARS } = require('../dist/data/CharacterDB');
const { AUGMENT_DB } = require('../dist/data/AugmentDB');
const fs = require('node:fs'), path = require('node:path');

test('24个技能及32个海克斯各有独立RGBA图标与稳定导入元数据', () => {
    const keys = CHARS.flatMap(c => Object.values(c.skillIcons)).concat(AUGMENT_DB.map(a => a.icon));
    assert.equal(keys.length, 56); assert.equal(new Set(keys).size, 56);
    const hashes = new Set();
    for (const key of keys) {
        const file = path.resolve(__dirname, '../../assets/resources/art/ui_icon_' + key + '.png');
        const bytes = fs.readFileSync(file);
        assert.equal(bytes[25], 6, key);
        assert.equal(bytes.readUInt32BE(16), bytes.readUInt32BE(20), key);
        const meta = JSON.parse(fs.readFileSync(file + '.meta', 'utf8'));
        assert.ok(Object.values(meta.subMetas).some(s => s.importer === 'sprite-frame'), key);
        hashes.add(require('node:crypto').createHash('sha256').update(bytes).digest('hex'));
    }
    assert.equal(hashes.size, 56, '禁止以同一张图替代不同技能设计');
});

test('持续中毒在脚边显示小毒泡，密集命中不会堆积为遮挡角色的大云团', () => {
    const p = new ParticleManager();
    for (let i = 0; i < 60; i++) { p.toxin(100, 100); p.update(0.1); }
    assert.ok(p.spriteFx.length <= 3);
    assert.ok(p.spriteFx.every(f => f.scale * 64 <= 26 && f.layer === 'ground' && f.y === 112 && f.baseAlpha <= 0.55));
    assert.ok(p.particles.every(f => f.size <= 2 && !f.glow));
    p.clear(); p.toxicImpact(100, 100, 1, 0);
    assert.ok(p.spriteFx.every(f => f.scale * 64 <= 26 && f.maxLife <= 0.2));
    p.update(0.3); assert.equal(p.spriteFx.length, 0);
});

test('范围光环和大挥击置于角色下方，近战主体有上限且完整消退', () => {
    const p = new ParticleManager();
    p.frostField(0, 0, 200); p.reikDeathWill({x:0,y:0,alive:true}); p.meleeSlash(0,0,0,'#fff',1000,1,'boss_mech');
    assert.ok(p.spriteFx.every(f => f.layer === 'ground'));
    assert.ok(p.spriteFx.filter(f => f.key === 'fx_enemy_void_blade').every(f => f.scale * 64 <= 128));
    p.update(10); assert.equal(p.spriteFx.length, 0);
});

test('六面缺口翻转Y轴后与碰撞扇区一致，声波美术不填上安全缺口', () => {
    for (let i = 0; i < 6; i++) {
        const [a,b] = localSectorBounds(i, 6);
        const world = -(a+b)/2;
        assert.equal(Math.floor((world + Math.PI)/(Math.PI/3)), i);
    }
    const g = graphics(), gap = 2*Math.PI/3;
    drawEnergyArc(g,0,0,100,14,-gap+.34,-gap+2*Math.PI-.34,0,'#ffbb66');
    for (const [x,y] of g.points) {
        const d=Math.abs(Math.atan2(Math.sin(-Math.atan2(y,x)-gap),Math.cos(-Math.atan2(y,x)-gap)));
        assert.ok(d >= .34-1e-9);
        assert.ok(Math.abs(Math.hypot(x,y)-100)<=14.00001);
    }
});
const { enemyProjectileSize } = require('../dist/data/CombatArtDB');
test('全部敌弹在常见碰撞半径下保持有限尺寸，大判定不得藏在小贴图里', () => {
    for (const art of Object.values(ENEMY_PROJECTILE_ART)) for (const radius of [4,8,13]) {
        const size=enemyProjectileSize(radius,art);
        assert.ok(size>=radius*2 && size<=52, art.key);
        if(art.key==='fx_enemy_toxic') assert.ok(size<=30);
    }
    assert.ok(enemyProjectileSize(40,ENEMY_PROJECTILE_ART.poison)>=80);
});

test('异步首次挂图和图集切帧保持程序指定尺寸，不被原图像素撑大', t => {
    const cc = require('cc');
    const { resources, Sprite, SpriteFrame } = cc;
    const oldRect=cc.Rect, oldSize=cc.Size;
    cc.Rect=class { constructor(x,y,width,height){Object.assign(this,{x,y,width,height});} };
    cc.Size=class { constructor(width,height){Object.assign(this,{width,height});} };
    t.after(()=>{cc.Rect=oldRect;cc.Size=oldSize;});
    const callbacks=[];
    t.mock.method(resources,'load',(path,type,done)=>callbacks.push(done));
    delete require.cache[require.resolve('../dist/core/SpriteUtils')];
    const {applyArtSprite,applyAnimationFrame}=require('../dist/core/SpriteUtils');
    let stored=null;
    const sprite={isValid:true,sizeMode:Sprite.SizeMode.RAW,width:30,height:30,
        node:{getComponent:()=>({setAnchorPoint(){}})},
        get spriteFrame(){return stored},
        set spriteFrame(frame){stored=frame;if(frame&&this.sizeMode!==Sprite.SizeMode.CUSTOM){this.width=frame.originalSize.width;this.height=frame.originalSize.height;}}
    };
    const frame=new SpriteFrame();frame.originalSize={width:1254,height:1254};frame.texture={};
    applyArtSprite(sprite,'fx_enemy_toxic');callbacks.shift()(null,frame);
    assert.deepEqual([sprite.width,sprite.height],[30,30]);
    sprite.sizeMode=Sprite.SizeMode.RAW;
    applyArtSprite(sprite,'fx_enemy_toxic');
    assert.deepEqual([sprite.width,sprite.height],[30,30],'缓存命中同样保持尺寸');
    sprite.sizeMode=Sprite.SizeMode.RAW;
    applyAnimationFrame(sprite,{sheet:'anim_fx_enemy_impacts',columns:4,rows:4},{index:0,pivot:[.5,.5]});
    callbacks.shift()(null,frame);
    assert.deepEqual([sprite.width,sprite.height],[30,30],'异步图集切片保持尺寸');
});

test('扇区路径只覆盖指定小角度，不把六面安全区叠成整圆', () => {
    const {sectorPath}=require('../dist/core/CombatVfx');
    for(let sector=0;sector<6;sector++){
        const g=graphics();const [a,b]=localSectorBounds(sector,6);
        sectorPath(g,0,0,285,a,b);
        assert.deepEqual(g.points[0],[0,0]);
        for(const [x,y]of g.points.slice(1)){
            const delta=Math.atan2(Math.sin(Math.atan2(y,x)-(a+b)/2),Math.cos(Math.atan2(y,x)-(a+b)/2));
            assert.ok(Math.abs(delta)<=Math.PI/6+1e-8);
            assert.ok(Math.abs(Math.hypot(x,y)-285)<1e-8);
        }
    }
});
