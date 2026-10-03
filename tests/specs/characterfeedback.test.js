'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHARS } = require('../dist/data/CharacterDB');

test('Q/E技能名称只由PlayerController统一显示一次', () => {
    // 引导/反馈型技能允许用浮字做阶段提示（凯尔E"引导中"、格雷夫E"眩晕×N"），
    // 技能名本体仍由 PlayerController 统一显示。
    const E_FLOAT_TEXT = new Set(['kai', 'graf']);
    for (const character of CHARS) {
        assert.doesNotMatch(
            character.qSkill.toString(), /floatingText/,
            `${character.name} 的Q技能效果层不应再次绘制技能名`,
        );
        if (E_FLOAT_TEXT.has(character.id)) continue;
        assert.doesNotMatch(
            character.eSkill.toString(), /floatingText/,
            `${character.name} 的E技能效果层不应再次绘制技能名`,
        );
    }
});

test('薇薇安E技能唯一标准名称为超频指令(英雄重做后)', () => {
    const vivian = CHARS.find(character => character.id === 'vivian');
    assert.ok(vivian, '应存在工程师薇薇安角色定义');
    assert.equal(vivian.skills.e.split('—')[0].trim(), '超频指令');
});
