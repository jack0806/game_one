'use strict';
// 后台管理·系统参数配置（GameConfig）单测：注册表驱动、钳制、持久化、恢复默认。
// 无 localStorage 的 Node 环境走注入 stub，模拟"改完即存、重启读回"。
const test = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG_ITEMS, GameConfig, DEFAULT_ADMIN_PASSWORD } = require('../dist/data/GameConfig');

function makeStorage() {
    const map = new Map();
    return {
        getItem: k => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: k => map.delete(k),
        _dump: () => Object.fromEntries(map),
    };
}

function fresh() {
    const storage = makeStorage();
    GameConfig.storage = storage;
    GameConfig.resetAll();
    GameConfig._reloadForTest();
    return storage;
}

test('注册表覆盖六大组配置项,默认值即当前游戏数值', () => {
    const groups = new Set(CONFIG_ITEMS.map(i => i.group));
    for (const g of ['金币与经济', '掉落', '波次与怪物', '难度微调', '海克斯商店', '玩家调试']) {
        assert.ok(groups.has(g), `缺少分组 ${g}`);
    }
    // 关键项默认值 = 现状数值（改公式出口但不动定稿）
    const byKey = Object.fromEntries(CONFIG_ITEMS.map(i => [i.key, i]));
    assert.equal(byKey.goldGainMult.def, 1);
    assert.equal(byKey.coreCoinsRate.def, 0.2, '核心币折算默认 20%');
    assert.equal(byKey.coreCoinsCap.def, 80, '核心币封顶默认 80');
    assert.equal(byKey.enemyCountCap.def, 128, '单波封顶默认 128');
    assert.equal(byKey.augSellRate.def, 0.75, '海克斯回收默认 75%');
    assert.equal(byKey.freeRefreshCount.def, 5, 'hex29 免费刷新默认 5');
    // key 唯一
    assert.equal(new Set(CONFIG_ITEMS.map(i => i.key)).size, CONFIG_ITEMS.length);
});

test('get 未配置返回默认,set 钳制值域并即时持久化', () => {
    const storage = fresh();
    assert.equal(GameConfig.get('goldGainMult'), 1);
    GameConfig.set('goldGainMult', 3.5);
    assert.equal(GameConfig.get('goldGainMult'), 3.5);
    assert.ok(storage.getItem('hexblast_admin_config_v1').includes('goldGainMult'), '改动立即写入存储');
    // 超界钳制
    GameConfig.set('goldGainMult', 999);
    assert.equal(GameConfig.get('goldGainMult'), 20, '钳到 max');
    GameConfig.set('goldGainMult', -5);
    assert.equal(GameConfig.get('goldGainMult'), 0.1, '钳到 min');
});

test('重启等价:重载缓存后从存储读回覆盖值', () => {
    fresh();
    GameConfig.set('waveCountMult', 2);
    GameConfig._reloadForTest();
    assert.equal(GameConfig.get('waveCountMult'), 2, '重启后仍生效');
    assert.equal(GameConfig.get('statScaleMult'), 1, '未配置项仍为默认');
});

test('单项/全部恢复默认,isModified 标记改动', () => {
    fresh();
    assert.equal(GameConfig.isModified('goldGainMult'), false);
    GameConfig.set('goldGainMult', 5);
    GameConfig.set('killGoldMult', 2);
    assert.equal(GameConfig.isModified('goldGainMult'), true);
    GameConfig.reset('goldGainMult');
    assert.equal(GameConfig.get('goldGainMult'), 1);
    assert.equal(GameConfig.isModified('goldGainMult'), false);
    assert.equal(GameConfig.get('killGoldMult'), 2, '未重置项不受影响');
    GameConfig.resetAll();
    assert.equal(GameConfig.get('killGoldMult'), 1);
    assert.equal(GameConfig.isModified('killGoldMult'), false);
});

test('管理员密码:默认 hex2026,可改可持久化,resetAll 重置', () => {
    fresh();
    assert.equal(GameConfig.getPassword(), DEFAULT_ADMIN_PASSWORD);
    GameConfig.setPassword('my-secret');
    GameConfig._reloadForTest();
    assert.equal(GameConfig.getPassword(), 'my-secret');
    GameConfig.resetAll();
    assert.equal(GameConfig.getPassword(), DEFAULT_ADMIN_PASSWORD);
});

test('percent 项按小数存取', () => {
    fresh();
    GameConfig.set('coreCoinsRate', 0.5);
    assert.equal(GameConfig.get('coreCoinsRate'), 0.5);
    GameConfig.set('coreCoinsRate', 2);
    assert.equal(GameConfig.get('coreCoinsRate'), 1, '100% 封顶');
});
