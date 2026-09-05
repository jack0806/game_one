'use strict';
// npm test 编译数据后运行：刷新独立检查页，并为新图集创建稳定的Cocos资源元数据。
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const { ACTOR_ANIMATIONS } = require(path.join(root, 'tests/dist/data/ActorAnimationDB'));
const { EFFECT_ANIMATIONS } = require(path.join(root, 'tests/dist/data/EffectAnimationDB'));
const { CHARACTERS } = require(path.join(root, 'tests/dist/data/CharacterDB'));
const { UNIT_CATALOG } = require(path.join(root, 'tests/dist/data/BossDB'));
const { EnemyBase } = require(path.join(root, 'tests/dist/entities/EnemyBase'));
const { BossController } = require(path.join(root, 'tests/dist/entities/BossController'));
const { makeMockGame } = require(path.join(root, 'tests/specs/mockGame'));
const art = path.join(root, 'assets/resources/art');
const templateText = fs.readFileSync(path.join(art, 'anim_kai_side.png.meta'), 'utf8');
const templateUuid = JSON.parse(templateText).uuid;
const handled = new Set();
const allClips = Object.values(ACTOR_ANIMATIONS).flatMap(set => Object.values(set).flatMap(view => Object.values(view)));
allClips.push(...Object.values(EFFECT_ANIMATIONS));
for (const clip of allClips) {
        if (handled.has(clip.sheet)) continue;
        handled.add(clip.sheet);
        const file = path.join(art, clip.sheet + '.png');
        if (!fs.existsSync(file)) throw new Error('缺少动画素材：' + file);
        const existing = fs.existsSync(file + '.meta') ? fs.readFileSync(file + '.meta', 'utf8') : undefined;
        const meta = existing ? JSON.parse(existing)
            : JSON.parse(templateText.replaceAll(templateUuid, randomUUID()).replaceAll('anim_kai_side', clip.sheet));
        const data = meta.subMetas.f9941.userData;
        const w = clip.columns * clip.cellSize, h = clip.rows * clip.cellSize;
        Object.assign(data, { width: w, height: h, rawWidth: w, rawHeight: h, trimX: 0, trimY: 0, offsetX: 0, offsetY: 0, packable: false });
        Object.assign(data.vertices, {
            rawPosition: [-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0],
            uv: [0,h,w,h,0,0,w,0], minPos: [-w/2,-h/2,0], maxPos: [w/2,h/2,0],
        });
        const next = JSON.stringify(meta, null, 2) + '\n';
        if (existing !== next) fs.writeFileSync(file + '.meta', next);
}
fs.writeFileSync(path.join(root, 'docs/art/animation-qa/preview-data.json'), JSON.stringify(ACTOR_ANIMATIONS, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'docs/art/animation-qa/preview-effects.json'), JSON.stringify(EFFECT_ANIMATIONS, null, 2) + '\n');
const sizes = {}, coverage = [];
function register(id, category, key, size) {
    sizes[key] = size;
    const set = ACTOR_ANIMATIONS[key] || {};
    coverage.push({ id, category, key, directions: Object.keys(set),
        actions: Object.fromEntries(Object.entries(set).map(([view, clips]) => [view, Object.keys(clips)])),
        visualAcceptance: 'pending', skillEffectsAcceptance: 'pending' });
}
for (const id of Object.keys(CHARACTERS)) register(id, 'hero', 'char_token_' + id, 82);
for (const unit of UNIT_CATALOG) {
    const e = unit.category === 'boss' ? new BossController() : new EnemyBase();
    if (unit.id.startsWith('boss_ch')) e.initBoss(Number(unit.id.slice(7)) - 1, makeMockGame());
    else if (unit.category === 'boss') e.initBossKind(unit.id.slice(5), makeMockGame());
    else e.init(unit.id, 1, makeMockGame());
    register(unit.id, unit.category, e.spriteKey, e.radius * 2 * e.visualScale);
}
fs.writeFileSync(path.join(root, 'docs/art/animation-qa/preview-sizes.json'), JSON.stringify(sizes, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'docs/art/animation-qa/coverage.json'), JSON.stringify({
    note: '6英雄与36目录敌人；召唤物还须单独审计。素材/动作登记不表示通过视觉或技能特效验收。', units: coverage,
}, null, 2) + '\n');
console.warn(`[动画预览] 已导出 ${handled.size} 张图集；既有资源uuid保持不变`);
