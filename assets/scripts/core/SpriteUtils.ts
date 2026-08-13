// ============================================================
//  SpriteUtils.ts — 美术资源加载缓存 + Sprite 节点池通用工具
// ============================================================
//
// 所有游戏内 Sprite 渲染（背景/敌人/子弹/玩家/特效/UI图标）都应通过这里
// 的 loadArtSprite()/applyArtSprite() 读图，而不是直接调用 resources.load()，
// 这样才能保证全部路径都先经过 ArtRemap.artPath() 做错位修正，并共享同一份
// SpriteFrame 缓存（避免同一张图被反复异步加载）。

import { SpriteFrame, resources, Sprite, Node, UITransform } from 'cc';
import { artPath } from './ArtRemap';

const _cache: Map<string, SpriteFrame> = new Map();
const _pending: Map<string, ((sf: SpriteFrame | null) => void)[]> = new Map();
const _requestedKey: WeakMap<Sprite, string> = new WeakMap();

/**
 * 按美术资源 key（如 'enemy_grunt'，会先经 ArtRemap 解析真实文件名）加载
 * SpriteFrame。命中缓存则同步回调；否则走 resources.load 异步加载，并对
 * 同一 key 的并发请求去重（多个调用方共享同一次网络IO）。
 */
export function loadArtSprite(key: string, cb: (sf: SpriteFrame | null) => void): void {
    const cached = _cache.get(key);
    if (cached) { cb(cached); return; }

    const waiters = _pending.get(key);
    if (waiters) { waiters.push(cb); return; }
    _pending.set(key, [cb]);

    resources.load(artPath(key), SpriteFrame, (err, frame) => {
        const list = _pending.get(key) || [];
        _pending.delete(key);
        if (err || !frame) {
            console.warn(`[SpriteUtils] art not found: ${key} -> ${artPath(key)}`, err);
            for (const fn of list) fn(null);
            return;
        }
        _cache.set(key, frame);
        for (const fn of list) fn(frame);
    });
}

/** 同步读取已缓存的 SpriteFrame（未加载过则返回 undefined，不会触发加载）。 */
export function getCachedSprite(key: string): SpriteFrame | undefined {
    return _cache.get(key);
}

/** 批量预加载一组美术 key；全部完成（无论成功与否）后调用 onDone()。 */
export function preloadArt(keys: string[], onDone?: () => void): void {
    let remaining = keys.length;
    if (remaining === 0) { onDone?.(); return; }
    for (const k of keys) {
        loadArtSprite(k, () => { remaining--; if (remaining <= 0) onDone?.(); });
    }
}

/** 把某个 Sprite 组件的 spriteFrame 设为指定 key 对应的图（缓存命中同步生效，否则异步补挂）。 */
export function applyArtSprite(sprite: Sprite, key: string): void {
    _requestedKey.set(sprite, key);
    const cached = _cache.get(key);
    if (cached) { sprite.spriteFrame = cached; return; }
    loadArtSprite(key, (sf) => {
        if (sf && sprite.isValid && _requestedKey.get(sprite) === key) sprite.spriteFrame = sf;
    });
}

/**
 * 通用 Node+Sprite 对象池：一次性创建 `size` 个挂 Sprite 的子节点（初始 inactive），
 * 运行时靠 acquire()/release() 复用，避免频繁 new Node()/destroy() 造成 GC 压力。
 * 池耗尽时 acquire() 返回 undefined，调用方应跳过本帧渲染而不是报错崩溃。
 */
export class SpriteNodePool {
    private _pool: Node[] = [];

    constructor(parent: Node, size: number, namePrefix = 'SpritePoolItem', contentSize: [number, number] = [32, 32]) {
        for (let i = 0; i < size; i++) {
            const n = new Node(`${namePrefix}${i}`);
            n.setParent(parent);
            n.addComponent(UITransform).setContentSize(contentSize[0], contentSize[1]);
            n.addComponent(Sprite);
            n.active = false;
            this._pool.push(n);
        }
    }

    /** 取出一个空闲节点并激活；池耗尽返回 undefined。 */
    acquire(): Node | undefined {
        for (const n of this._pool) {
            if (!n.active) { n.active = true; return n; }
        }
        return undefined;
    }

    /** 归还节点（隐藏，不销毁）。 */
    release(n: Node): void { n.active = false; }

    /** 归还全部节点（场景重开/重启时调用）。 */
    releaseAll(): void { for (const n of this._pool) n.active = false; }

    get size(): number { return this._pool.length; }
    /** 当前处于激活状态的节点数（对象池稳定性测试用）。 */
    get activeCount(): number { return this._pool.reduce((c, n) => c + (n.active ? 1 : 0), 0); }
}
