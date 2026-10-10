'use strict';
// 只记录原有事件时间与保护资源散列，后续制作不改变战斗结算。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs/art/style-a/enemy-redesign');
const { ACTOR_ANIMATIONS } = require('../tests/dist/data/ActorAnimationDB');
const { UNIT_CATALOG } = require('../tests/dist/data/BossDB');
const { EnemyBase } = require('../tests/dist/entities/EnemyBase');
const { BossController } = require('../tests/dist/entities/BossController');
const { makeMockGame } = require('../tests/specs/mockGame');
const units = UNIT_CATALOG.map(unit => {
    const e = unit.category === 'boss' ? new BossController() : new EnemyBase();
    if (unit.id.startsWith('boss_ch')) e.initBoss((Number(unit.id.slice(7))-1)*5+1, makeMockGame());
    else if (unit.category === 'boss') e.initBossKind(unit.id.slice(5), makeMockGame());
    else e.init(unit.id, 1, makeMockGame());
    return { ...unit, key: e.spriteKey, size: e.radius*2*e.visualScale,
        clips: ACTOR_ANIMATIONS[e.spriteKey] || {} };
});
const art = path.join(root, 'assets/resources/art');
const protectedFiles = fs.readdirSync(art).filter(name => /^(fx_|anim_fx_|anim_hit_units_|bullet_|ui_icon_)/.test(name) && name.endsWith('.png'));
const hashes = Object.fromEntries(protectedFiles.map(name => [name,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(art, name))).digest('hex')]));
const target = path.join(out, 'baseline.json');
if (fs.existsSync(target)) throw new Error('已有基线，禁止用修改后的资源覆盖');
fs.writeFileSync(target, JSON.stringify({ units, protectedArt: hashes }, null, 2)+'\n');
console.warn(`[敌人重绘] 基线 ${units.length} 个单位，保护 ${protectedFiles.length} 张特效/弹体/图标`);
