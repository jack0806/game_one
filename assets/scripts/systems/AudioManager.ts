// ============================================================
//  AudioManager.ts — BGM / SFX 播放、缓存与高频限流
// ============================================================
import { AudioClip, AudioSource, Node, resources } from 'cc';

export type BgmCue = 'title' | 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'boss' | 'shop';
export type SfxCue =
    | 'shoot' | 'hit' | 'enemy_die' | 'explode' | 'boss_roar'
    | 'player_hurt' | 'player_die' | 'gold' | 'buy' | 'button'
    | 'augment_pick' | 'levelup' | 'skill_q' | 'skill_e' | 'skill_r'
    | 'freeze' | 'lightning' | 'heal' | 'hex_activate';

const BGM_ASSET: Record<BgmCue, string> = {
    title: 'bgm_title', ch1: 'bgm_ch1', ch2: 'bgm_ch2', ch3: 'bgm_ch3',
    ch4: 'bgm_ch4', boss: 'bgm_boss', shop: 'bgm_shop',
};

const SFX_ASSET: Record<SfxCue, string> = {
    shoot: 'sfx_shoot', hit: 'sfx_hit', enemy_die: 'sfx_enemy_die',
    explode: 'sfx_explode', boss_roar: 'sfx_boss_roar',
    player_hurt: 'sfx_player_hurt', player_die: 'sfx_player_die',
    gold: 'sfx_gold', buy: 'sfx_buy', button: 'sfx_button',
    augment_pick: 'sfx_augment_pick', levelup: 'sfx_levelup',
    skill_q: 'sfx_skill_q', skill_e: 'sfx_skill_e', skill_r: 'sfx_skill_r',
    freeze: 'sfx_freeze', lightning: 'sfx_lightning',
    heal: 'sfx_heal', hex_activate: 'sfx_hex_activate',
};

const SFX_VOLUME: Partial<Record<SfxCue, number>> = {
    shoot: 0.42, hit: 0.38, enemy_die: 0.58, explode: 0.72,
    boss_roar: 0.86, player_hurt: 0.72, player_die: 0.82,
    gold: 0.62, buy: 0.68, button: 0.52, augment_pick: 0.72,
    levelup: 0.76, skill_q: 0.68, skill_e: 0.66, skill_r: 0.86,
    freeze: 0.66, lightning: 0.62, heal: 0.50, hex_activate: 0.58,
};

/** 同类声音的最小间隔（毫秒），避免弹幕/群怪命中时爆音。 */
const SFX_COOLDOWN_MS: Partial<Record<SfxCue, number>> = {
    shoot: 55, hit: 65, enemy_die: 75, explode: 130,
    player_hurt: 120, gold: 45, lightning: 100, heal: 180,
    hex_activate: 150,
};

export class AudioManager {
    private _bgmSource?: AudioSource;
    private _sfxSource?: AudioSource;
    private _bgmCache = new Map<string, AudioClip>();
    private _sfxCache = new Map<string, AudioClip>();
    /** 合并同一资源尚未完成的并发请求，避免高攻速首轮播放时重复解码。 */
    private _loading = new Map<string, Array<(clip: AudioClip | null) => void>>();
    /** 某个未缓存 SFX 只保留一次首播；其余请求等待缓存后再按正常限流播放。 */
    private _pendingSfx = new Set<string>();
    private _lastPlayed = new Map<SfxCue, number>();
    private _requestedBgm?: BgmCue;
    private _playingBgm?: BgmCue;
    private _bgmRequestId = 0;
    private _pendingBgm?: { cue: BgmCue; clip: AudioClip };
    private _bgmFade: 'steady' | 'out' | 'in' = 'steady';

    bgmVolume = 0.48;
    sfxVolume = 1;
    muted = false;

    /** 不传 parent 时为 headless：保留状态/限流逻辑，但不接触引擎音频对象。 */
    constructor(parent?: Node) {
        if (!parent) return;

        const bgmNode = new Node('BgmAudio');
        bgmNode.setParent(parent);
        this._bgmSource = bgmNode.addComponent(AudioSource);
        this._bgmSource.loop = true;
        this._bgmSource.volume = this.bgmVolume;

        const sfxNode = new Node('SfxAudio');
        sfxNode.setParent(parent);
        this._sfxSource = sfxNode.addComponent(AudioSource);
        this._sfxSource.loop = false;
        this._sfxSource.volume = 1;

        this.preloadAll();
    }

    preloadAll(): void {
        if (!this._bgmSource || !this._sfxSource) return;
        const bgmCues: BgmCue[] = ['title', 'ch1', 'ch2', 'ch3', 'ch4', 'boss', 'shop'];
        const sfxCues: SfxCue[] = [
            'shoot', 'hit', 'enemy_die', 'explode', 'boss_roar', 'player_hurt', 'player_die',
            'gold', 'buy', 'button', 'augment_pick', 'levelup', 'skill_q', 'skill_e', 'skill_r',
            'freeze', 'lightning', 'heal', 'hex_activate',
        ];
        const seenBgm = new Set<string>();
        const seenSfx = new Set<string>();
        for (const cue of bgmCues) {
            const asset = BGM_ASSET[cue];
            if (!seenBgm.has(asset)) { seenBgm.add(asset); this._load('bgm', asset, () => {}); }
        }
        for (const cue of sfxCues) {
            const asset = SFX_ASSET[cue];
            if (!seenSfx.has(asset)) { seenSfx.add(asset); this._load('sfx', asset, () => {}); }
        }
    }

    playBgm(cue: BgmCue): void {
        this._requestedBgm = cue;
        if (this.muted || !this._bgmSource) return;
        if (this._playingBgm === cue && this._bgmSource.playing) return;

        const requestId = ++this._bgmRequestId;
        this._load('bgm', BGM_ASSET[cue], (clip) => {
            if (!clip || requestId !== this._bgmRequestId || this._requestedBgm !== cue || this.muted) return;
            const source = this._bgmSource;
            if (!source) return;
            if (source.playing && this._playingBgm && this._playingBgm !== cue) {
                this._pendingBgm = { cue, clip };
                this._bgmFade = 'out';
            } else {
                this._beginBgm(cue, clip, true);
            }
        });
    }

    /** 每帧推进短淡出/淡入，消除章节、Boss、商店切换时的硬切爆音。 */
    update(dt: number): void {
        const source = this._bgmSource;
        if (!source || this.muted) return;
        if (this._bgmFade === 'out') {
            source.volume = Math.max(0, source.volume - this.bgmVolume * dt / 0.18);
            if (source.volume <= 0.001) {
                const next = this._pendingBgm;
                this._pendingBgm = undefined;
                if (next) this._beginBgm(next.cue, next.clip, true);
                else { source.stop(); this._bgmFade = 'steady'; }
            }
        } else if (this._bgmFade === 'in') {
            source.volume = Math.min(this.bgmVolume, source.volume + this.bgmVolume * dt / 0.32);
            if (source.volume >= this.bgmVolume - 0.001) {
                source.volume = this.bgmVolume;
                this._bgmFade = 'steady';
            }
        }
    }

    /** 浏览器首次用户手势后重试被自动播放策略拦截的目标 BGM。 */
    resume(): void {
        if (!this.muted && this._requestedBgm) this.playBgm(this._requestedBgm);
    }

    stopBgm(): void {
        this._bgmRequestId++;
        this._requestedBgm = undefined;
        this._playingBgm = undefined;
        this._pendingBgm = undefined;
        this._bgmFade = 'steady';
        this._bgmSource?.stop();
    }

    playSfx(cue: SfxCue, volume = SFX_VOLUME[cue] ?? 0.65): boolean {
        if (this.muted || !this._sfxSource) return false;
        const now = Date.now();
        const last = this._lastPlayed.get(cue) ?? -Infinity;
        if (now - last < (SFX_COOLDOWN_MS[cue] ?? 0)) return false;
        this._lastPlayed.set(cue, now);

        const asset = SFX_ASSET[cue];
        const cached = this._sfxCache.get(asset);
        if (cached) {
            this._sfxSource.playOneShot(cached, Math.max(0, Math.min(1, volume * this.sfxVolume)));
            return true;
        }
        if (this._pendingSfx.has(asset)) return false;
        this._pendingSfx.add(asset);
        this._load('sfx', asset, (clip) => {
            this._pendingSfx.delete(asset);
            if (!clip || this.muted || !this._sfxSource) return;
            this._sfxSource.playOneShot(clip, Math.max(0, Math.min(1, volume * this.sfxVolume)));
        });
        return true;
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        if (muted) {
            this._bgmSource?.stop();
            this._playingBgm = undefined;
            this._pendingBgm = undefined;
            this._bgmFade = 'steady';
        } else {
            this.resume();
        }
    }

    get requestedBgm(): BgmCue | undefined { return this._requestedBgm; }

    private _beginBgm(cue: BgmCue, clip: AudioClip, fadeIn: boolean): void {
        const source = this._bgmSource;
        if (!source) return;
        source.stop();
        source.clip = clip;
        source.loop = true;
        source.volume = fadeIn ? 0 : this.bgmVolume;
        source.play();
        this._playingBgm = cue;
        this._bgmFade = fadeIn ? 'in' : 'steady';
    }

    private _load(kind: 'bgm' | 'sfx', asset: string, cb: (clip: AudioClip | null) => void): void {
        const cache = kind === 'bgm' ? this._bgmCache : this._sfxCache;
        const cached = cache.get(asset);
        if (cached) { cb(cached); return; }

        const loadingKey = `${kind}/${asset}`;
        const waiters = this._loading.get(loadingKey);
        if (waiters) { waiters.push(cb); return; }
        this._loading.set(loadingKey, [cb]);

        resources.load(`audio/${kind}/${asset}`, AudioClip, (err, clip) => {
            const callbacks = this._loading.get(loadingKey) ?? [];
            this._loading.delete(loadingKey);
            if (err || !clip) {
                console.warn(`[AudioManager] audio not found: ${kind}/${asset}`, err);
                for (const callback of callbacks) callback(null);
                return;
            }
            cache.set(asset, clip);
            for (const callback of callbacks) callback(clip);
        });
    }
}
