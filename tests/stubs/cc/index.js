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
}

class Node {
    constructor(name) {
        this.name = name;
        this._active = true;
        this._components = new Map();
        this._parent = null;
    }
    get active() { return this._active; }
    set active(v) { this._active = v; }
    setParent(p) { this._parent = p; }
    setRotationFromEuler(x, y, z) { this.eulerAngles = { x, y, z }; }
    addComponent(Ctor) {
        const inst = new Ctor();
        this._components.set(Ctor, inst);
        return inst;
    }
    getComponent(Ctor) { return this._components.get(Ctor); }
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
};

module.exports = {
    _decorator, Component, Node, Sprite, Color, UITransform, SpriteFrame, AudioClip, AudioSource,
    resources, input, Input, KeyCode, Vec2, EventKeyboard, EventMouse, sys,
};
