'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { separatePlayerBodies, contactDistance } = require('../dist/core/CombatCollision');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { PlayerController } = require('../dist/entities/PlayerController');
const { ParticleManager } = require('../dist/systems/ParticleManager');
const { ENEMY_PROJECTILE_ART } = require('../dist/data/CombatArtDB');
const { makeMockGame, makePlayer } = require('./mockGame');
const move = (x, y, dx, dy, r) => ({ x: Math.max(r, Math.min(1280-r,x+dx)), y: Math.max(r, Math.min(580-r,y+dy)) });

test('断针枪口到锁定英雄位置共线，英雄四种朝向均不会偏射', () => {
    for (const [fx,fy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const game = makeMockGame(), p = makePlayer({x:500,y:280,facingX:fx,facingY:fy});
        const e = new EnemyBase(); e.init('needle_gunner',1,game); e.x=300;e.y=300;e._rangedCd=0;
        for (let i=0;i<100&&!game.enemyBullets.length;i++) e.update(1/60,p,game);
        const b=game.enemyBullets[0]; assert.ok(b);
        const dx=p.x-b.x,dy=p.y-b.y;
        assert.ok(Math.abs(dx*b.vy-dy*b.vx)<1e-6);
        assert.ok(dx*b.vx+dy*b.vy>0);
    }
});

test('重叠出生、追击与英雄反向挤压逐帧分离，近战仍能命中', () => {
    const p=makePlayer({x:640,y:300,hp:10000}),game=makeMockGame();
    const e=new EnemyBase();e.init('grunt',1,game);e.x=p.x;e.y=p.y;
    separatePlayerBodies(p,[e],move);
    for(let n=0;n<600;n++) {
        p.x += (e.x-p.x)*0.02;
        e.update(1/60,p,game);separatePlayerBodies(p,[e],move);
        assert.ok(Math.hypot(p.x-e.x,p.y-e.y)>=contactDistance(p,e)-0.02);
    }
    assert.ok(p.hp<10000,'身体分离不能令近战永远打不到英雄');
});

test('墙边首领碰撞不能推出地图，离地和死亡单位不阻挡', () => {
    const p=makePlayer({x:16,y:300}),e={x:40,y:300,radius:40,isBoss:true,alive:true};
    separatePlayerBodies(p,[e],move);
    assert.ok(p.x>=p.radius&&e.x>=e.radius);
    assert.ok(Math.hypot(p.x-e.x,p.y-e.y)>=contactDistance(p,e)-0.02);
    for(const extra of [{mechSkyT:1},{dead:true},{alive:false}]) {
        const ghost={...e,x:p.x,y:p.y,...extra};separatePlayerBodies(p,[ghost],move);
        assert.equal(ghost.x,p.x);
    }
});

test('六章地形中混合敌群在墙边持续挤压不会重新推入英雄身体', () => {
    const {arenaForChapter}=require('../dist/data/ChapterArenaDB');
    const {safeArenaPoint,moveInArena,isArenaFree}=require('../dist/core/ArenaGeometry');
    for(let chapter=1;chapter<=6;chapter++) {
        const arena=arenaForChapter(chapter),p=makePlayer({...safeArenaPoint(arena,300,510,16)});
        const bodies=Array.from({length:12},(_,i)=>{
            const r=i%3===0?44:20,a=i*Math.PI/6;
            return {...safeArenaPoint(arena,p.x+Math.cos(a)*75,p.y+Math.sin(a)*75,r),radius:r,isBoss:r===44,alive:true};
        });
        const advance=(x,y,dx,dy,r)=>moveInArena(arena,x,y,dx,dy,r);
        for(let frame=0;frame<180;frame++) {
            for(const e of bodies) {
                const a=Math.atan2(p.y-e.y,p.x-e.x);
                Object.assign(e,advance(e.x,e.y,Math.cos(a)*4,Math.sin(a)*4,e.radius));
            }
            separatePlayerBodies(p,bodies,advance);
            assert.ok(isArenaFree(arena,p.x,p.y,p.radius));
            for(const e of bodies) assert.ok(Math.hypot(p.x-e.x,p.y-e.y)>=contactDistance(p,e)-.02,`第${chapter}章第${frame}帧`);
        }
    }
});

test('无敌下毒弹与真实伤害接触都有可跟随英雄的反馈且血量不变', () => {
    for(const method of ['takeDamage','takeTrueDamage']) {
        const p=new PlayerController();p.godMode=true;p.hp=100;p.x=500;p.y=300;
        const particles=new ParticleManager(),game=makeMockGame({particles});
        p[method](10,game,{impact:{source:'archer',kind:'poison'}});
        assert.equal(p.hp,100);assert.equal(particles.spriteFx.length,1);
        const effect=particles.spriteFx[0];assert.ok(effect.playerContact);assert.equal(effect.follow,p);
        p.x+=80;particles.update(.1);assert.equal(effect.follow.x,580);
    }
});

test('水刺、机械追踪弹、电浆、毒刺与冰弹有独立材质', () => {
    assert.equal(new Set(['water_spike','homing','beam','venom_sting','frost'].map(k=>ENEMY_PROJECTILE_ART[k].key)).size,5);
});

test('持续燃烧与中毒分别播放火苗和毒泡，不串材质', () => {
    for (const kind of ['fire','dot']) {
        const p=new PlayerController();p.stats={armor:0,maxHp:100,attackSpeed:1,speed:0};
        const seen=[];
        const game=makeMockGame({testCeasefire:true,particles:{ignite(){seen.push('fire');},toxin(){seen.push('dot');}}});
        p.applyDot(2,4,'#fff',kind);
        p.tick(.016,{moveX:0,moveY:0,isKeyQ:()=>false,isKeyE:()=>false,isKeyR:()=>false},game);
        assert.deepEqual(seen,[kind]);assert.ok(p.hp<100);
    }
});

test('打击停顿独立移动分支仍经过地形和敌人碰撞', () => {
    const fs=require('node:fs'),path=require('node:path');
    const source=fs.readFileSync(path.join(__dirname,'../../assets/scripts/core/GameManager.ts'),'utf8');
    const branch=source.slice(source.indexOf('if (this._hitStop.active)'),source.indexOf('// ── init helpers'));
    assert.match(branch,/tickMovement\(dt, this\._input, this\)/);
    assert.match(branch,/separatePlayerBodies\(this\._player, this\._enemies/);
    assert.match(branch,/moveInArena\(this\._arena/);
});

test('水爆、毒爆、机械落地释放不套火球圆环，也不占用英雄接触配额', () => {
    for(const material of ['water','acid','metal']) {
        const particles=new ParticleManager();particles.enemyBurst(100,100,material,76);
        assert.ok(particles.spriteFx.every(f=>f.key!=='fx_explosion'&&!f.playerContact));
        assert.ok(!particles.particles.some(p=>p.type==='ring'));
        particles.playerHit(100,100,{source:material==='water'?'boss_abyss':'acid_sac'});
        assert.equal(particles.spriteFx.filter(f=>f.playerContact).length,1);
    }
});

test('水弹反弹、终点爆炸与撞墙均保留水材质', () => {
    const {BulletPool}=require('../dist/entities/BulletController');
    for(const mode of ['bounce','expire','wall']) {
        const particles=new ParticleManager(),pool=new BulletPool(1),p=makePlayer({x:640,y:300});
        const game=makeMockGame({particles,firstArenaBulletHit:()=>mode==='wall'});
        pool.spawn({x:mode==='bounce'?2:100,y:100,vx:-100,vy:0,damage:5,radius:5,
            owner:'enemy',isEnemyBullet:true,enemyFx:'water_spike',hitSource:'boss_abyss',
            bounceLeft:mode==='bounce'?2:0,explodeOnExpire:mode==='expire',lifeTime:mode==='expire'?.001:3});
        pool.updateEnemyBullets(.02,p,game);
        assert.ok(particles.spriteFx.some(f=>f.key==='fx_ground_water'),mode);
        assert.ok(!particles.spriteFx.some(f=>f.key==='fx_explosion'),mode);
    }
});
