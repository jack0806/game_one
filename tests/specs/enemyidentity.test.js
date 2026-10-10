'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { BossController } = require('../dist/entities/BossController');
const { UNIT_CATALOG } = require('../dist/data/BossDB');
const { globalChapter } = require('../dist/data/LevelIndex');
const { makeMockGame, makePlayer } = require('./mockGame');

test('目录全部37种单位远处开场按追击或逃逸身份移动', () => {
    assert.equal(UNIT_CATALOG.length,37);
    for(const unit of UNIT_CATALOG) {
        const game=makeMockGame(),player=makePlayer({x:880,y:330});
        let e;
        if(unit.category==='boss') {
            e=new BossController();
            if(unit.id.startsWith('boss_ch'))e.initBoss(globalChapter(Number(unit.id.slice(7)),1),game);
            else e.initBossKind(unit.id.slice(5),game);
        } else { e=new EnemyBase();e.init(unit.id,1,game); }
        e.x=300;e.y=330;game.enemies=[e];
        for(let n=0;n<24;n++)e.update(1/60,player,game);
        const distance=Math.hypot(e.x-player.x,e.y-player.y);
        assert.ok(unit.id==='gold_scavenger'?distance>580:distance<579,unit.id);
    }
});

test('测试房首领按钮保持一基图号，各章生成独立身份', () => {
    const source = fs.readFileSync('assets/scripts/core/GameManager.ts','utf8');
    const method = source.slice(source.indexOf('    spawnTestUnit('), source.indexOf('    clearTestField('));
    const body = method.slice(method.indexOf('{') + 1, method.lastIndexOf('}'));
    // 执行真实入口的章节分支，截取spawnEnemy参数，避免仅直接init绕过按钮映射。
    const execute = new Function('id','count','TEST_UNIT_SPAWN_SPOTS','UNIT_CATALOG','CANVAS_W',body);
    const seen=[];
    const game=makeMockGame({_chapter:1});
    const host={spawnEnemy(type,x,y,map){const boss=new BossController();boss.initBoss(globalChapter(map,1),game);seen.push([boss.chapter,boss.spriteKey]);},_floatText:{spawn(){}},_audio:{playSfx(){}}};
    for(let ch=1;ch<=4;ch++) execute.call(host,'boss_ch'+ch,1,[[500,300]],UNIT_CATALOG,1280);
    assert.deepEqual(seen,[[1,'enemy_boss_ch1'],[2,'enemy_boss_ch2'],[3,'enemy_boss_ch3'],[4,'enemy_boss_ch4']]);
});

test('咒仆投手寄生体及近战机制小Boss不会因有射程而开场后撤', () => {
    for(const type of ['ember_acolyte','frost_acolyte','acid_sac','arc_leech','triune_priest','rail_butcher','bell_devourer']) {
        for(const distance of [180,420,600]) {
            const game=makeMockGame(), player=makePlayer({x:700,y:300});
            const e=new EnemyBase();e.init(type,1,game);e.x=700-distance;e.y=300;e._rangedCd=10;
            const start=Math.hypot(e.x-player.x,e.y-player.y);
            e.update(.03,player,game);
            assert.ok(Math.hypot(e.x-player.x,e.y-player.y)<=start+.001,type+'距离'+distance);
            if(distance===600)assert.ok(e.x>100,type+'远处必须接近');
        }
    }
});

test('毒射手断针射手保留近距后撤、远距接近，掠金虫保留逃逸', () => {
    for(const type of ['archer','needle_gunner'])for(const distance of [180,600]) {
        const game=makeMockGame(),player=makePlayer({x:700,y:300});
        const e=new EnemyBase();e.init(type,1,game);e.x=700-distance;e.y=300;e._rangedCd=10;
        const x=e.x;e.update(.03,player,game);
        assert.ok(distance===180?e.x<x:e.x>x,type);
    }
    const e=new EnemyBase(),game=makeMockGame();e.init('gold_scavenger',1,game);e.x=30;e.y=100;
    e.update(.03,makePlayer({x:700,y:300}),game);
    assert.ok(e.x<30);assert.equal(game.enemyBullets.length,0);
});
