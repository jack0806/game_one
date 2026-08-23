// ============================================================
//  mockGame.js — 测试用的最小 game/player 模拟对象
//  （只提供各模块运行时会调用到的方法/字段，避免引入 cc 引擎）
// ============================================================
'use strict';

function makeMockGame(overrides = {}) {
    const game = {
        _mutationMods: {},
        enemies: [],
        enemyBullets: [],
        score: 0, kills: 0, comboCount: 0, comboTimer: 0,
        floatingText: { spawn() {} },
        particles: {
            hit() {}, explode() {}, impact() {}, shieldBlock() {},
            hexActivate() {}, lightning() {}, heal() {}, ignite() {}, toxin() {},
            meleeSlash() {}, enemyProjectileTrail() {},
        },
        screenShake: { shake() {} },
        hitStop: { trigger() {} },
        economy: { spawnDrop() {} },
        augmentManager: { dispatchHit() {}, dispatchKill() {} },
        spawnEnemy() {},
        spawnExplosion() {},
        onWaveCleared() {},
    };
    return Object.assign(game, overrides);
}

function makePlayer(overrides = {}) {
    const player = {
        x: 0, y: 0, radius: 16, alive: true, hp: 100,
        // 技能朝向默认朝右（方向性技能沿角色朝向释放）
        facingX: 1, facingY: 0,
        stats: {
            critDmg: 0.5, eliteBonus: 0, maxHp: 100, pierce: 0,
            damage: 20, goldPickupRange: 60,
        },
        takeDamage(dmg) { this.hp -= dmg; },
        heal(amt) { this.hp = Math.min(this.stats.maxHp, this.hp + amt); },
    };
    return Object.assign(player, overrides);
}

module.exports = { makeMockGame, makePlayer };
