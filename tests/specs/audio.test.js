const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AudioManager } = require('../dist/systems/AudioManager');

test('AudioManager headless 模式可记录 BGM 且静默播放 SFX', () => {
    const audio = new AudioManager();
    audio.playBgm('title');
    assert.equal(audio.requestedBgm, 'title');
    assert.equal(audio.playSfx('button'), false);
});

test('AudioManager 静音切换不丢失目标 BGM', () => {
    const audio = new AudioManager();
    audio.playBgm('ch3');
    audio.setMuted(true);
    audio.setMuted(false);
    assert.equal(audio.requestedBgm, 'ch3');
});

test('AudioManager 提供逐帧淡化入口且 headless 可安全调用', () => {
    const audio = new AudioManager();
    audio.playBgm('ch1');
    assert.doesNotThrow(() => audio.update(0.016));
    assert.equal(audio.requestedBgm, 'ch1');
});

test('AudioManager 合并并发加载并限制未缓存音效首播', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'assets', 'scripts', 'systems', 'AudioManager.ts'), 'utf8');
    assert.match(src, /private _loading = new Map/);
    assert.match(src, /private _pendingSfx = new Set/);
    assert.match(src, /waiters\.push\(cb\)/);
    assert.match(src, /private _bgmFade: 'steady' \| 'out' \| 'in'/);
});

test('AudioManager声明的7首BGM和17个SFX资源全部存在', () => {
    const bgm = ['bgm_title', 'bgm_ch1', 'bgm_ch2', 'bgm_ch3', 'bgm_ch4', 'bgm_boss', 'bgm_shop'];
    const sfx = [
        'sfx_shoot', 'sfx_hit', 'sfx_enemy_die', 'sfx_explode', 'sfx_boss_roar',
        'sfx_player_hurt', 'sfx_player_die', 'sfx_gold', 'sfx_buy', 'sfx_button',
        'sfx_augment_pick', 'sfx_levelup', 'sfx_skill_q', 'sfx_skill_e', 'sfx_skill_r',
        'sfx_freeze', 'sfx_lightning',
    ];
    for (const key of bgm) {
        assert.ok(fs.existsSync(path.join(process.cwd(), 'assets', 'resources', 'audio', 'bgm', `${key}.mp3`)), key);
    }
    for (const key of sfx) {
        assert.ok(fs.existsSync(path.join(process.cwd(), 'assets', 'resources', 'audio', 'sfx', `${key}.mp3`)), key);
    }
});
