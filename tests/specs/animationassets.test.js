'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ACTOR_ANIMATIONS } = require('../dist/data/ActorAnimationDB');
const { EFFECT_ANIMATIONS } = require('../dist/data/EffectAnimationDB');
const { resolveArtKey } = require('../dist/core/ArtRemap');

test('登记图集真实存在且PNG尺寸、RGBA、元数据与逐帧索引一致', () => {
    const clips = Object.values(ACTOR_ANIMATIONS).flatMap(set => Object.values(set).flatMap(view => Object.values(view)));
    clips.push(...Object.values(EFFECT_ANIMATIONS));
    const uuids = new Map();
    for (const clip of clips) {
        const file = path.resolve(__dirname, '../../assets/resources/art', resolveArtKey(clip.sheet) + '.png');
        const png = fs.readFileSync(file);
        assert.equal(png.subarray(1, 4).toString(), 'PNG', clip.sheet);
        assert.equal(png.readUInt32BE(16), clip.columns * clip.cellSize, clip.sheet);
        assert.equal(png.readUInt32BE(20), clip.rows * (clip.cellHeight ?? clip.cellSize), clip.sheet);
        assert.equal(png[25], 6, '必须为真实RGBA：' + clip.sheet);
        const meta = JSON.parse(fs.readFileSync(file + '.meta', 'utf8'));
        assert.ok(!uuids.has(meta.uuid) || uuids.get(meta.uuid) === file, '不同图集不能共享uuid');
        uuids.set(meta.uuid, file);
        const sf = Object.values(meta.subMetas).find(value => value.importer === 'sprite-frame');
        assert.ok(sf, '必须存在spriteFrame子资源：' + clip.sheet);
        assert.equal(sf.userData.rawWidth, clip.columns * clip.cellSize, clip.sheet);
        assert.equal(sf.userData.rawHeight, clip.rows * (clip.cellHeight ?? clip.cellSize), clip.sheet);
        assert.equal(sf.userData.packable, false, '逐帧纹理禁止动态合图');
        for (const frame of clip.frames) {
            assert.ok(Number.isInteger(frame.index) && frame.index >= 0 && frame.index < clip.rows * clip.columns);
            assert.ok(frame.seconds > 0);
            for (const point of [frame.pivot, frame.muzzle].filter(Boolean)) {
                assert.ok(point.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
            }
        }
    }
});

function assertEnemyActions(key, skillCount) {
    const set = ACTOR_ANIMATIONS[key];
    const required = ['idle','walk','run','jump','attack','hit','defeated','skill',
        ...Array.from({length: skillCount-1},(_,i)=>'skill'+(i+2))];
    for (const view of ['front','side','back']) {
        assert.deepEqual(required.filter(action => !set[view]?.[action]), [], key+'/'+view);
        const rows = new Set();
        for (const action of required) {
            const clip = set[view][action];
            assert.equal(clip.frames.length,8);
            assert.match(clip.sheet,/^anim_stylea_/);
            assert.equal(new Set(clip.frames.map(f=>f.index)).size,8);
            assert.ok(!rows.has(clip.frames[0].index), '动作不能借用同一行');
            rows.add(clip.frames[0].index);
        }
        assert.equal(set[view].attack.frames.filter(f=>f.event==='strike').length,1);
        for (const action of required.filter(a=>a.startsWith('skill'))) {
            assert.equal(set[view][action].frames.filter(f=>f.event==='cast').length,1);
        }
    }
}
test('机械高达X剑士三向图集覆盖实际战斗动作',()=>assertEnemyActions('enemy_boss_mech',4));
test('深海恐惧三向图集覆盖五项实际主动技能',()=>assertEnemyActions('enemy_boss_abyss',5));
test('疫晶跳蛛维斯帕三向图集覆盖五项文档技能',()=>assertEnemyActions('enemy_boss_vespa',5));
test('磁潮坩埚城兽三向图集覆盖五项文档技能',()=>assertEnemyActions('enemy_boss_crucible_city',5));
test('折界裁缝万相三向图集覆盖五项文档技能',()=>assertEnemyActions('enemy_boss_manyfold',5));

test('凯尔Q/E/R分别使用强化射击、弹幕架炮和核心过载动作', () => {
    const kai = ACTOR_ANIMATIONS.char_token_kai;
    for (const view of ['front', 'side', 'back']) {
        assert.match(kai[view].skill.sheet, /anim_kai_/);
        assert.equal(kai[view].skill2.sheet, 'anim_kai_skill2');
        assert.equal(kai[view].skill3.sheet, 'anim_kai_skill3');
        assert.equal(kai[view].skill2.frames[2].event, 'cast');
        assert.equal(kai[view].skill3.frames[2].event, 'cast');
        assert.ok(kai[view].skill3.frames[2].muzzle, `${view}核心过载缺少炮口挂点`);
    }
});

test('薇薇安Q/E/R分别使用部署、超频和炮台风暴指令动作', () => {
    const vivian = ACTOR_ANIMATIONS.char_token_vivian;
    for (const view of ['front', 'side', 'back']) {
        assert.equal(vivian[view].skill2.sheet, 'anim_vivian_skill2');
        assert.equal(vivian[view].skill3.sheet, 'anim_vivian_skill3');
        assert.equal(vivian[view].skill2.frames[2].event, 'cast');
        assert.equal(vivian[view].skill3.frames[2].event, 'cast');
    }
});

test('雷克Q/E/R分别使用怒冲、原战吼和死亡意志动作', () => {
    const reik = ACTOR_ANIMATIONS.char_token_reik;
    for (const view of ['front', 'side', 'back']) {
        assert.equal(reik[view].skill.sheet, 'anim_reik_skill');
        assert.match(reik[view].skill2.sheet, /^anim_reik_(front|side|back)$/);
        assert.equal(reik[view].skill3.sheet, 'anim_reik_skill3');
        assert.equal(reik[view].skill.frames[2].event, 'cast');
        assert.equal(reik[view].skill2.frames.find(frame => frame.event === 'cast')?.index % 4, 2);
        assert.equal(reik[view].skill3.frames[2].event, 'cast');
    }
});

test('奥莉亚Q/E/R分别使用瞬移斩、形态切换和原奇点蓄能动作', () => {
    const olia = ACTOR_ANIMATIONS.char_token_olia;
    for (const view of ['front', 'side', 'back']) {
        assert.equal(olia[view].skill.sheet, 'anim_olia_skill');
        assert.equal(olia[view].skill2.sheet, 'anim_olia_skill2');
        assert.match(olia[view].skill3.sheet, /^anim_olia_/);
        for (const action of ['skill', 'skill2', 'skill3']) {
            assert.ok(olia[view][action].frames.some(frame => frame.event === 'cast'), `${view}.${action}`);
        }
    }
});

test('格雷夫与莉安娜Q/E/R均使用各自实际技能动作', () => {
    for (const [key, prefix] of [['char_token_graf', 'anim_graf'], ['char_token_liana', 'anim_liana']]) {
        const set = ACTOR_ANIMATIONS[key];
        for (const view of ['front', 'side', 'back']) {
            assert.match(set[view].skill.sheet, new RegExp(`^${prefix}_`));
            assert.equal(set[view].skill2.sheet, `${prefix}_skill2`);
            assert.equal(set[view].skill3.sheet, `${prefix}_skill3`);
            assert.equal(set[view].skill2.frames[2].event, 'cast');
            assert.equal(set[view].skill3.frames[2].event, 'cast');
        }
    }
});

test('全部炮灰与小Boss覆盖三方向基础动作、独立技能行与原有挂点', () => {
    const baseline = require('../../docs/art/style-a/enemy-redesign/baseline.json');
    for (const unit of baseline.units.filter(u=>u.category!=='boss')) {
        const set=ACTOR_ANIMATIONS[unit.key];
        for(const view of ['front','side','back']) {
            const rows=new Set();
            for(const action of ['idle','walk','run','jump','attack','hit','defeated','skill',...Object.keys(unit.clips[view]||{})]) {
                const clip=set[view][action];
                assert.ok(clip,unit.id+'/'+view+'/'+action);
                assert.match(clip.sheet,/^anim_stylea_/);
                assert.equal(clip.frames.length,8);
                const previous=unit.clips[view]?.[action];
                if(previous?.frames.every(f=>f.muzzle)) assert.ok(clip.frames.every(f=>f.muzzle),'释放挂点不可遗漏');
                rows.add(clip.frames[0].index);
            }
            assert.equal(rows.size,Object.keys(set[view]).length,'每个动作应有独立帧行');
            if(['gold_scavenger','blast_tick'].includes(unit.id)) assert.ok(set[view].attack.frames.every(f=>!f.event),'无伤害动作不加攻击事件');
        }
    }
});
