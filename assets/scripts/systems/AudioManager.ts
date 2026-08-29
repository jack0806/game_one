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
    skill_q: 180, skill_e: 180, skill_r: 260, freeze: 180,
    boss_roar: 400, player_die: 400, levelup: 250, augment_pick: 180,
    buy: 120, button: 90, hex_activate: 150,
};

/** 高优先级战斗信息触发短时 BGM 让位；gain 越小压低越明显。 */
const BGM_DUCK: Partial<Record<SfxCue, { gain: number; hold: number }>> = {
    boss_roar: { gain: 0.46, hold: 1.05 },
    player_die: { gain: 0.40, hold: 1.00 },
    skill_r: { gain: 0.62, hold: 0.42 },
    freeze: { gain: 0.70, hold: 0.30 },
    player_hurt: { gain: 0.76, hold: 0.16 },
};

export class AudioManager {
    private _bgmSource?: AudioSource;
    private _sfxSource?: AudioSource;
    /** 独立短音通道池：避免 WebAudio playOneShot 每次重建 buffer cache 并刷屏告警。 */
    private _sfxChannels: AudioSource[] = [];
    private _sfxCursor = 0;
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
    private _bgmLevel = 1;
    private _duckGain = 1;
    private _duckTarget = 1;
    private _duckHold = 0;

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

        for (let i = 0; i < 8; i++) {
            const sfxNode = new Node(`SfxAudio${i}`);
            sfxNode.setParent(parent);
            const source = sfxNode.addComponent(AudioSource);
            source.loop = false;
            source.volume = 1;
            this._sfxChannels.push(source);
        }
        this._sfxSource = this._sfxChannels[0];

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

    /** 每帧推进短淡出/淡入和高优先级 SFX 闪避，避免硬切并保住战斗信息层级。 */
    update(dt: number): void {
        const source = this._bgmSource;
        if (!source || this.muted) return;
        if (this._bgmFade === 'out') {
            this._bgmLevel = Math.max(0, this._bgmLevel - dt / 0.18);
            if (this._bgmLevel <= 0.001) {
                const next = this._pendingBgm;
                this._pendingBgm = undefined;
                if (next) this._beginBgm(next.cue, next.clip, true);
                else { source.stop(); this._bgmFade = 'steady'; this._bgmLevel = 0; }
            }
        } else if (this._bgmFade === 'in') {
            this._bgmLevel = Math.min(1, this._bgmLevel + dt / 0.32);
            if (this._bgmLevel >= 0.999) {
                this._bgmLevel = 1;
                this._bgmFade = 'steady';
            }
        }

        if (this._duckHold > 0) {
            this._duckHold = Math.max(0, this._duckHold - dt);
        } else {
            this._duckTarget = 1;
        }
        // 约 60ms 压低、450ms 恢复：预警立即突出，音乐不会出现抽吸感。
        if (this._duckGain > this._duckTarget) {
            this._duckGain = Math.max(this._duckTarget, this._duckGain - dt / 0.06);
        } else if (this._duckGain < this._duckTarget) {
            this._duckGain = Math.min(this._duckTarget, this._duckGain + dt / 0.45);
        }
        source.volume = this.bgmVolume * this._bgmLevel * this._duckGain;
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
        this._bgmLevel = 0;
        this._bgmSource?.stop();
    }

    playSfx(cue: SfxCue, volume = SFX_VOLUME[cue] ?? 0.65): boolean {
        if (this.muted || !this._sfxSource) return false;
        const now = Date.now();
        const last = this._lastPlayed.get(cue) ?? -Infinity;
        if (now - last < (SFX_COOLDOWN_MS[cue] ?? 0)) return false;
        this._lastPlayed.set(cue, now);
        this._requestDuck(cue);

        const asset = SFX_ASSET[cue];
        const cached = this._sfxCache.get(asset);
        if (cached) {
            this._playSfxClip(cached, volume);
            return true;
        }
        if (this._pendingSfx.has(asset)) return false;
        this._pendingSfx.add(asset);
        this._load('sfx', asset, (clip) => {
            this._pendingSfx.delete(asset);
            if (!clip || this.muted || !this._sfxSource) return;
            this._playSfxClip(clip, volume);
        });
        return true;
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        if (muted) {
            this._bgmSource?.stop();
            for (const source of this._sfxChannels) source.stop();
            this._playingBgm = undefined;
            this._pendingBgm = undefined;
            this._bgmFade = 'steady';
            this._bgmLevel = 0;
            this._duckGain = 1;
            this._duckTarget = 1;
            this._duckHold = 0;
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
        this._bgmLevel = fadeIn ? 0 : 1;
        source.volume = this.bgmVolume * this._bgmLevel * this._duckGain;
        source.play();
        this._playingBgm = cue;
        this._bgmFade = fadeIn ? 'in' : 'steady';
    }

    private _requestDuck(cue: SfxCue): void {
        const profile = BGM_DUCK[cue];
        if (!profile) return;
        this._duckTarget = Math.min(this._duckTarget, profile.gain);
        this._duckHold = Math.max(this._duckHold, profile.hold);
    }

    private _playSfxClip(clip: AudioClip, volume: number): void {
        if (this._sfxChannels.length <= 0) return;
        let source = this._sfxChannels.find(channel => !channel.playing);
        if (!source) {
            source = this._sfxChannels[this._sfxCursor % this._sfxChannels.length];
            this._sfxCursor++;
            source.stop();
        }
        source.clip = clip;
        source.loop = false;
        source.volume = Math.max(0, Math.min(1, volume * this.sfxVolume));
        source.play();
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
