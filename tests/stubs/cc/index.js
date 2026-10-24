// ============================================================
//  Minimal headless stub for Cocos Creator's 'cc' engine module.
// ============================================================
// Used ONLY by the Node test runner (tests/specs) so that entity
// scripts which `import { Node, Sprite, ... } from 'cc'` for real
// in-editor rendering can still be require()'d outside the editor
// (where the real engine module isn't on the module path).
//
// The test suite always constructs BulletPool/EnemyBase etc. in
// headless mode (no `parent` Node passed in), so the actual Sprite/
// Node code paths in those classes never execute during tests —
// these stubs only need to exist as importable symbols, not behave
// like the real engine.
//
// This file is never loaded by the actual Cocos Creator editor/build;
// the real 'cc' engine module always takes precedence there.
'use strict';

class Component {}

class UITransform {
    setContentSize(width, height) {
        this.width = width;
        this.height = height;
        return this;
    }
    setAnchorPoint(x, y) { this.anchorX = x; this.anchorY = y; return this; }
    get contentSize() { return { width: this.width, height: this.height }; }
}
class EditBox {
    constructor() {
        this.string = ''; this.placeholder = ''; this.maxLength = 20;
        this.inputMode = 0; this.inputFlag = 0;
    }
    focus() {} blur() {}
}
EditBox.InputFlag = { DEFAULT: 0, PASSWORD: 1 };
EditBox.InputMode = { ANY: 0 };
class Widget {
    constructor() { this.alignMode = 0; this.isAlignTop = false; }
    updateAlignment() {}
}
class Mask {
    constructor() { this._type = 0; this._graphics = null; }
    get type() { return this._type; }
    set type(v) {
        this._type = v;
        // 复刻引擎行为：GRAPHICS_STENCIL 赋值时立刻在同节点创建内部 Graphics
        // （HUD 的 getComponent(Graphics) 复用与 MetaPageUI/AdminUI 的双 Graphics
        //  崩溃都依赖该时序，见 2026-10-22 启动崩溃排查）。内部创建免单渲染组件检查。
        if (v === Mask.Type.GRAPHICS_STENCIL && this.node) {
            this._graphics = this.node.getComponent(Graphics) || this.node._addComponentUnchecked(Graphics);
        }
    }
    get graphics() { return this._graphics; }
}
Mask.Type = { GRAPHICS_STENCIL: 1, RECT: 0 };
class BlockInputEvents {}

// 单节点单渲染组件（对齐引擎 warnID 12002）：节点已有渲染组件时再显式 addComponent
// 渲染类会告警并标记 _uiCompBroken——正是 2026-10-22 原生模拟器启动崩溃的模式。
const RENDERABLES = new Set();
class Node {
    constructor(name) {
        this.name = name;
        this._active = true;
        this._components = [];
        this._parent = null;
    }
    get active() { return this._active; }
    set active(v) { this._active = v; }
    setParent(p) { this._parent = p; }
    setRotationFromEuler(x, y, z) { this.eulerAngles = { x, y, z }; }
    addComponent(Ctor) {
        const inst = new Ctor();
        inst.node = this;
        if (RENDERABLES.has(Ctor) && this._components.some(c => RENDERABLES.has(c.constructor))) {
            console.warn('[cc-stub] Can\'t add renderable component to this node because it already have one.');
            inst._uiCompBroken = true;
        }
        this._components.push(inst);
        return inst;
    }
    _addComponentUnchecked(Ctor) {
        const inst = new Ctor();
        inst.node = this;
        this._components.push(inst);
        return inst;
    }
    getComponent(Ctor) {
        return this._components.find(c => c instanceof Ctor) || null;
    }
    destroy() { this._destroyed = true; return true; }
}

class Color {
    constructor(r = 0, g = 0, b = 0, a = 255) {
        this.r = r; this.g = g; this.b = b; this.a = a;
    }
    static fromHEX(out, _hex) { return out; }
}

class SpriteFrame {}

class AudioClip {}

class AudioSource {
    constructor() {
        this.clip = null;
        this.loop = false;
        this.volume = 1;
        this.playing = false;
    }
    play() { this.playing = true; }
    stop() { this.playing = false; }
    playOneShot() {}
}

class Sprite {
    constructor() {
        this.spriteFrame = null;
        this.color = new Color(255, 255, 255, 255);
        this.sizeMode = Sprite.SizeMode.SIMPLE;
    }
}
Sprite.SizeMode = { SIMPLE: 0, CUSTOM: 1, TRIMMED: 2, RAW: 3 };

const input = {
    on() {},
    off() {},
};
const Input = { EventType: {} };
const KeyCode = {
    ESCAPE: 27,
    KEY_D: 68,
    ARROW_RIGHT: 39,
    KEY_A: 65,
    ARROW_LEFT: 37,
    KEY_S: 83,
    ARROW_DOWN: 40,
    KEY_W: 87,
    ARROW_UP: 38,
    KEY_Q: 81,
    KEY_E: 69,
    KEY_R: 82,
    KEY_M: 77,
    SHIFT_LEFT: 16,
    SHIFT_RIGHT: 16,
    SPACE: 32,
};
class Vec2 {}
class EventKeyboard {}
class EventMouse {}
const _decorator = {
    ccclass: () => (Ctor) => Ctor,
};

const resources = {
    load(_path, _type, cb) { cb && cb(null, new SpriteFrame()); },
};

// SaveSystem 依赖的 sys.localStorage 内存桩：跨测试保留数据，
// 测试需要干净状态时调用 sys.localStorage._clear()。
const _storage = new Map();
const sys = {
    localStorage: {
        getItem: (k) => (_storage.has(k) ? _storage.get(k) : null),
        setItem: (k, v) => { _storage.set(String(k), String(v)); },
        removeItem: (k) => { _storage.delete(k); },
        _clear: () => { _storage.clear(); },
    },
    hasFeature: () => false,
    Feature: { INPUT_TOUCH: 'input-touch' },
};

// ── UI 头less构造支持（LobbyUI 等界面类 smoke 测试用） ──────────
// 只提供可链式调用的空操作；不模拟渲染，仅保证构造路径不因缺方法抛错。
class Graphics {
    constructor() { this.fillColor = null; this.strokeColor = null; this.lineWidth = 1; }
}
for (const m of ['clear', 'moveTo', 'lineTo', 'rect', 'roundRect', 'fillRect', 'circle',
    'ellipse', 'arc', 'close', 'closePath', 'fill', 'stroke', 'bezierCurveTo', 'quadraticCurveTo']) {
    Graphics.prototype[m] = function () { return this; };
}

const HorizontalTextAlignment = { LEFT: 0, CENTER: 1, RIGHT: 2 };
const VerticalTextAlignment = { TOP: 0, CENTER: 1, BOTTOM: 2, BOTTOM_ON_BASELINE: 2 };
class Label {
    constructor() {
        this.string = ''; this.fontSize = 20; this.lineHeight = 28;
        this.color = null; this.horizontalAlign = 1; this.verticalAlign = 1;
        this.overflow = Label.Overflow.SHRINK; this.enableWrapText = false;
        this.enableOutline = false; this.outlineColor = null; this.outlineWidth = 1;
        this.isBold = false; this.font = null;
    }
}
Label.Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 };

// 渲染组件登记（单节点单渲染组件规则用；须在各类定义完成后填充）
RENDERABLES.add(Sprite);
RENDERABLES.add(Label);
RENDERABLES.add(Graphics);
RENDERABLES.add(Mask);

// 补 Node 的 UI 构造路径需要的成员（既有字段/方法保持原样）
Node.prototype.setPosition = function (v) { this._position = v; return this; };
Node.prototype.setScale = function () { return this; };
Node.prototype.setSiblingIndex = function () { return this; };
Node.prototype.getChildByName = function (name) {
    return (this.children || []).find(c => c.name === name);
};
Node.prototype.destroy = function () { this._destroyed = true; return true; };
Node.prototype.removeFromParent = function () {
    if (this._parent && this._parent.children) {
        const i = this._parent.children.indexOf(this);
        if (i >= 0) this._parent.children.splice(i, 1);
    }
    this._parent = null;
};
Object.defineProperty(Node.prototype, 'children', {
    get() {
        if (!this._children) this._children = [];
        return this._children;
    },
});
Object.defineProperty(Node.prototype, 'isValid', { get() { return !this._destroyed; } });
const _origSetParent = Node.prototype.setParent;
Node.prototype.setParent = function (p) {
    if (this._parent && this._parent.children) {
        const i = this._parent.children.indexOf(this);
        if (i >= 0) this._parent.children.splice(i, 1);
    }
    this._parent = p || null;
    if (p) p.children.push(this);
    return this;
};
Node.prototype.on = function (_type, _fn, _target) { return this; };
Node.prototype.off = function (_type, _fn, _target) { return this; };
Node.EventType = { TOUCH_END: 'touch-end', TOUCH_START: 'touch-start', TOUCH_MOVE: 'touch-move' };

function tween(_target) {
    const chain = {
        by() { return chain; }, to() { return chain; }, call() { return chain; },
        repeatForever() { return chain; }, delay() { return chain; },
        start() { return chain; },
    };
    return chain;
}
const view = { getVisibleSize: () => ({ width: 1280, height: 720 }) };
const director = { getScene: () => null };
const screen = { windowSize: { width: 1280, height: 720 } };
const ResolutionPolicy = { FIXED_HEIGHT: 1, FIXED_WIDTH: 2, SHOW_ALL: 3 };
class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
}

module.exports = {
    _decorator, Component, Node, Sprite, Color, UITransform, SpriteFrame, AudioClip, AudioSource,
    resources, input, Input, KeyCode, Vec2, EventKeyboard, EventMouse, sys,
    Graphics, Label, HorizontalTextAlignment, VerticalTextAlignment, tween,
    view, director, screen, ResolutionPolicy, Vec3, EditBox, Widget, Mask, BlockInputEvents,
};
