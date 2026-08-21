'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHARS } = require('../dist/data/CharacterDB');

test('Q/E技能名称只由PlayerController统一显示一次', () => {
    for (const character of CHARS) {
        assert.doesNotMatch(
            character.qSkill.toString(), /floatingText/,
            `${character.name} 的Q技能效果层不应再次绘制技能名`,
        );
        assert.doesNotMatch(
            character.eSkill.toString(), /floatingText/,
            `${character.name} 的E技能效果层不应再次绘制技能名`,
        );
    }
});

test('薇薇安E技能唯一标准名称为网络连接', () => {
    const vivian = CHARS.find(character => character.id === 'vivian');
    assert.ok(vivian, '应存在工程师薇薇安角色定义');
    assert.equal(vivian.skills.e.split('—')[0].trim(), '网络连接');
});
