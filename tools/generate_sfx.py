"""为 Hexblast 生成 17 条程序化科幻游戏音效。

输出为 44.1kHz、单声道、192kbps MP3，并同步写入资源目录与文档试听目录。
生成器只依赖 numpy 与 lameenc，便于之后按同一参数重新生成。
"""

from __future__ import annotations

import math
import shutil
import wave
from pathlib import Path

import lameenc
import numpy as np


ROOT = Path(__file__).resolve().parent.parent
RESOURCE_DIR = ROOT / "assets" / "resources" / "audio" / "sfx"
PREVIEW_DIR = ROOT / "docs" / "assets" / "audio"
SAMPLE_RATE = 44_100
BITRATE_KBPS = 192
RNG = np.random.default_rng(0x484558)


def timeline(duration: float) -> np.ndarray:
    return np.arange(round(duration * SAMPLE_RATE), dtype=np.float64) / SAMPLE_RATE


def envelope(
    duration: float,
    attack: float = 0.004,
    release: float = 0.04,
    decay: float | None = None,
) -> np.ndarray:
    t = timeline(duration)
    env = np.ones_like(t)
    if attack > 0:
        env *= np.minimum(1.0, t / attack)
    if decay is not None:
        env *= np.exp(-t / decay)
    if release > 0:
        env *= np.minimum(1.0, np.maximum(0.0, (duration - t) / release))
    return env


def sine_sweep(duration: float, start_hz: float, end_hz: float) -> np.ndarray:
    t = timeline(duration)
    if start_hz > 0 and end_hz > 0:
        ratio = end_hz / start_hz
        phase = 2 * np.pi * start_hz * duration / math.log(ratio) * (
            np.power(ratio, t / duration) - 1
        ) if abs(ratio - 1) > 1e-9 else 2 * np.pi * start_hz * t
    else:
        phase = 2 * np.pi * (start_hz * t + (end_hz - start_hz) * t * t / (2 * duration))
    return np.sin(phase)


def sine(duration: float, frequency: float, phase: float = 0.0) -> np.ndarray:
    return np.sin(2 * np.pi * frequency * timeline(duration) + phase)


def square(duration: float, frequency: float) -> np.ndarray:
    return np.tanh(4.0 * sine(duration, frequency))


def white_noise(duration: float) -> np.ndarray:
    return RNG.normal(0.0, 1.0, round(duration * SAMPLE_RATE))


def lowpass(signal: np.ndarray, cutoff_hz: float) -> np.ndarray:
    alpha = 1.0 - math.exp(-2.0 * math.pi * cutoff_hz / SAMPLE_RATE)
    out = np.empty_like(signal)
    state = 0.0
    for i, value in enumerate(signal):
        state += alpha * (value - state)
        out[i] = state
    return out


def highpass(signal: np.ndarray, cutoff_hz: float) -> np.ndarray:
    return signal - lowpass(signal, cutoff_hz)


def delay(signal: np.ndarray, seconds: float, gain: float) -> np.ndarray:
    offset = round(seconds * SAMPLE_RATE)
    out = signal.copy()
    if 0 < offset < len(signal):
        out[offset:] += signal[:-offset] * gain
    return out


def place(target: np.ndarray, source: np.ndarray, start: float, gain: float = 1.0) -> None:
    offset = round(start * SAMPLE_RATE)
    if offset >= len(target):
        return
    count = min(len(source), len(target) - offset)
    target[offset : offset + count] += source[:count] * gain


def crackle(duration: float, density: float = 90.0) -> np.ndarray:
    out = np.zeros(round(duration * SAMPLE_RATE), dtype=np.float64)
    count = max(1, round(duration * density))
    for position in RNG.integers(0, len(out), size=count):
        length = min(len(out) - position, RNG.integers(20, 130))
        if length <= 0:
            continue
        burst = RNG.normal(0.0, 1.0, length) * np.exp(-np.arange(length) / max(5, length / 5))
        out[position : position + length] += burst
    return out


def bell(duration: float, frequency: float) -> np.ndarray:
    t = timeline(duration)
    partials = (
        np.sin(2 * np.pi * frequency * t)
        + 0.52 * np.sin(2 * np.pi * frequency * 2.01 * t + 0.3)
        + 0.28 * np.sin(2 * np.pi * frequency * 3.92 * t + 0.7)
        + 0.13 * np.sin(2 * np.pi * frequency * 6.1 * t)
    )
    return partials * envelope(duration, 0.002, 0.04, duration / 4.2)


def normalize(signal: np.ndarray, target_rms_db: float = -16.0) -> np.ndarray:
    signal = np.nan_to_num(signal)
    signal -= np.mean(signal)
    active = np.abs(signal) > max(1e-6, np.max(np.abs(signal)) * 0.03)
    rms = math.sqrt(float(np.mean(np.square(signal[active])))) if np.any(active) else 0.0
    if rms > 0:
        signal *= 10 ** (target_rms_db / 20.0) / rms
    signal = np.tanh(signal * 1.15) / np.tanh(1.15)
    peak = float(np.max(np.abs(signal)))
    if peak > 10 ** (-1.0 / 20.0):
        signal *= 10 ** (-1.0 / 20.0) / peak
    # 最后 2ms 强制收零，避免 one-shot 结尾爆音。
    fade_samples = min(len(signal), round(0.002 * SAMPLE_RATE))
    signal[-fade_samples:] *= np.linspace(1.0, 0.0, fade_samples)
    return signal


def shoot() -> np.ndarray:
    d = 0.20
    beam = sine_sweep(d, 1680, 430) * envelope(d, 0.001, 0.025, 0.065)
    snap = highpass(white_noise(d), 3800) * envelope(d, 0.0005, 0.018, 0.017)
    body = sine_sweep(d, 330, 145) * envelope(d, 0.001, 0.03, 0.055)
    return normalize(0.60 * beam + 0.18 * snap + 0.28 * body, -17.5)


def hit() -> np.ndarray:
    d = 0.20
    thud = sine_sweep(d, 155, 64) * envelope(d, 0.001, 0.035, 0.045)
    flesh = lowpass(white_noise(d), 720) * envelope(d, 0.001, 0.028, 0.028)
    tail = sine_sweep(d, 920, 360) * envelope(d, 0.001, 0.025, 0.045)
    return normalize(0.70 * thud + 0.25 * flesh + 0.16 * tail, -17.0)


def enemy_die() -> np.ndarray:
    d = 0.50
    growl = (sine_sweep(d, 245, 48) + 0.34 * square(d, 73)) * envelope(d, 0.008, 0.07, 0.20)
    dissolve = highpass(white_noise(d), 1250) * envelope(d, 0.06, 0.03, 0.15)
    digital = crackle(d, 80) * envelope(d, 0.03, 0.03, 0.22)
    return normalize(0.58 * growl + 0.23 * dissolve + 0.21 * digital, -16.0)


def explode() -> np.ndarray:
    d = 0.80
    boom = sine_sweep(d, 115, 31) * envelope(d, 0.001, 0.11, 0.19)
    impact = lowpass(white_noise(d), 1500) * envelope(d, 0.001, 0.08, 0.12)
    debris = crackle(d, 155) * envelope(d, 0.018, 0.05, 0.27)
    distortion = np.tanh((boom * 1.8 + impact * 0.55) * 2.0)
    return normalize(0.60 * distortion + 0.26 * impact + 0.19 * debris, -15.0)


def boss_roar() -> np.ndarray:
    d = 1.20
    t = timeline(d)
    vibrato = 1.0 + 0.055 * np.sin(2 * np.pi * 22 * t)
    phase = np.cumsum((94 - 54 * t / d) * vibrato) * 2 * np.pi / SAMPLE_RATE
    throat = np.tanh((np.sin(phase) + 0.55 * np.sin(2.03 * phase) + 0.27 * np.sin(3.91 * phase)) * 2.2)
    breath = lowpass(white_noise(d), 1400) * (0.5 + 0.5 * sine(d, 31))
    servo = sine_sweep(d, 390, 82) * envelope(d, 0.04, 0.18, 0.48)
    body_env = envelope(d, 0.045, 0.17) * (0.65 + 0.35 * np.sin(np.pi * t / d))
    return normalize(0.70 * throat * body_env + 0.21 * breath * body_env + 0.18 * servo, -15.5)


def player_hurt() -> np.ndarray:
    d = 0.30
    thump = sine_sweep(d, 185, 62) * envelope(d, 0.001, 0.035, 0.055)
    grunt = np.tanh(sine_sweep(d, 132, 88) * 3.0) * envelope(d, 0.01, 0.06, 0.09)
    electric = highpass(crackle(d, 120), 1800) * envelope(d, 0.001, 0.025, 0.085)
    return normalize(0.52 * thump + 0.30 * grunt + 0.17 * electric, -16.5)


def player_die() -> np.ndarray:
    d = 1.50
    fall = sine_sweep(d, 315, 42) * envelope(d, 0.01, 0.24, 0.55)
    sub = sine_sweep(d, 104, 27) * envelope(d, 0.001, 0.27, 0.58)
    poweroff = lowpass(white_noise(d), 2100) * envelope(d, 0.08, 0.20, 0.36)
    pulse = (0.55 + 0.45 * square(d, 7)) * envelope(d, 0.01, 0.25, 0.65)
    return normalize((0.56 * fall + 0.48 * sub + 0.13 * poweroff) * pulse, -17.0)


def gold() -> np.ndarray:
    d = 0.30
    tone = bell(d, 1760)
    sparkle = bell(d, 2637) * 0.34
    return normalize(delay(tone + sparkle, 0.038, 0.20), -18.0)


def buy() -> np.ndarray:
    d = 0.40
    out = np.zeros(round(d * SAMPLE_RATE))
    place(out, bell(0.31, 1320), 0.0, 0.70)
    place(out, bell(0.25, 1760), 0.075, 0.55)
    confirm = sine_sweep(0.27, 690, 1080) * envelope(0.27, 0.004, 0.055, 0.11)
    place(out, confirm, 0.10, 0.28)
    return normalize(out, -17.5)


def button() -> np.ndarray:
    d = 0.15
    click = highpass(white_noise(d), 3100) * envelope(d, 0.0004, 0.012, 0.010)
    tick = sine_sweep(d, 1080, 530) * envelope(d, 0.0005, 0.018, 0.022)
    body = sine_sweep(d, 270, 160) * envelope(d, 0.001, 0.02, 0.018)
    return normalize(0.25 * click + 0.58 * tick + 0.20 * body, -19.0)


def augment_pick() -> np.ndarray:
    d = 0.60
    out = np.zeros(round(d * SAMPLE_RATE))
    for start, frequency, gain in ((0.0, 440, 0.35), (0.085, 659.25, 0.40), (0.17, 880, 0.45)):
        place(out, bell(0.36, frequency), start, gain)
    hum = sine_sweep(d, 118, 238) * envelope(d, 0.025, 0.10, 0.34)
    shimmer = highpass(white_noise(d), 6000) * envelope(d, 0.12, 0.06, 0.22)
    return normalize(out + 0.24 * hum + 0.06 * shimmer, -17.0)


def levelup() -> np.ndarray:
    d = 0.70
    out = np.zeros(round(d * SAMPLE_RATE))
    for start, frequency in ((0.0, 523.25), (0.15, 659.25), (0.30, 783.99)):
        note = bell(0.36, frequency) + 0.18 * sine_sweep(0.36, frequency, frequency * 1.01)
        place(out, note, start, 0.46)
    shine = sine_sweep(0.38, 950, 2100) * envelope(0.38, 0.035, 0.08, 0.18)
    place(out, shine, 0.27, 0.16)
    return normalize(out, -17.0)


def skill_q() -> np.ndarray:
    d = 0.40
    charge = sine_sweep(0.24, 145, 880) * envelope(0.24, 0.025, 0.018)
    release = sine_sweep(0.20, 420, 72) * envelope(0.20, 0.001, 0.05, 0.055)
    blast = lowpass(white_noise(0.20), 1900) * envelope(0.20, 0.001, 0.04, 0.035)
    out = np.zeros(round(d * SAMPLE_RATE))
    place(out, charge, 0.0, 0.33)
    place(out, release, 0.20, 0.68)
    place(out, blast, 0.20, 0.21)
    return normalize(out, -16.0)


def skill_e() -> np.ndarray:
    d = 0.50
    rise = sine_sweep(d, 118, 540) * envelope(d, 0.025, 0.07, 0.26)
    shield = sine_sweep(d, 245, 335) + 0.28 * sine_sweep(d, 492, 672)
    shield *= envelope(d, 0.06, 0.09)
    airy = highpass(white_noise(d), 5200) * envelope(d, 0.04, 0.07, 0.23)
    return normalize(0.39 * rise + 0.43 * shield + 0.06 * airy, -17.0)


def skill_r() -> np.ndarray:
    d = 1.00
    impact = sine_sweep(d, 138, 29) * envelope(d, 0.001, 0.15, 0.25)
    shock = lowpass(white_noise(d), 2100) * envelope(d, 0.001, 0.13, 0.20)
    energy = sine_sweep(d, 720, 96) * envelope(d, 0.003, 0.13, 0.28)
    pulse = delay(impact + 0.35 * shock, 0.095, 0.46)
    pulse = delay(pulse, 0.13, 0.31)
    return normalize(0.58 * np.tanh(pulse * 2.1) + 0.25 * energy + 0.18 * crackle(d, 120), -15.0)


def freeze() -> np.ndarray:
    d = 0.50
    out = np.zeros(round(d * SAMPLE_RATE))
    frost = highpass(white_noise(d), 4800) * envelope(d, 0.03, 0.06, 0.20)
    for start, frequency, gain in ((0.03, 2350, 0.34), (0.10, 3100, 0.28), (0.18, 1820, 0.31)):
        shard = sine_sweep(0.19, frequency, frequency * 0.61) * envelope(0.19, 0.0005, 0.022, 0.040)
        place(out, shard, start, gain)
    fracture = highpass(crackle(d, 155), 2600) * envelope(d, 0.03, 0.04, 0.15)
    return normalize(out + 0.10 * frost + 0.24 * fracture, -17.0)


def lightning() -> np.ndarray:
    d = 0.40
    arcs = highpass(crackle(d, 260), 1450) * envelope(d, 0.001, 0.025, 0.13)
    snap = highpass(white_noise(d), 3400) * envelope(d, 0.0004, 0.018, 0.028)
    zap = sine_sweep(d, 2600, 170) * envelope(d, 0.001, 0.035, 0.075)
    modulation = 0.52 + 0.48 * square(d, 47)
    return normalize(0.40 * arcs + 0.18 * snap + 0.42 * zap * modulation, -16.5)


SOUNDS = (
    ("sfx_shoot", 0.20, shoot),
    ("sfx_hit", 0.20, hit),
    ("sfx_enemy_die", 0.50, enemy_die),
    ("sfx_explode", 0.80, explode),
    ("sfx_boss_roar", 1.20, boss_roar),
    ("sfx_player_hurt", 0.30, player_hurt),
    ("sfx_player_die", 1.50, player_die),
    ("sfx_gold", 0.30, gold),
    ("sfx_buy", 0.40, buy),
    ("sfx_button", 0.15, button),
    ("sfx_augment_pick", 0.60, augment_pick),
    ("sfx_levelup", 0.70, levelup),
    ("sfx_skill_q", 0.40, skill_q),
    ("sfx_skill_e", 0.50, skill_e),
    ("sfx_skill_r", 1.00, skill_r),
    ("sfx_freeze", 0.50, freeze),
    ("sfx_lightning", 0.40, lightning),
)


def encode_mp3(signal: np.ndarray, target_duration: float, path: Path) -> None:
    # lameenc 会在 PCM 后额外写一个 MPEG 帧。预先裁到目标帧数减一，
    # 让播放器读到的 MP3 容器时长尽量贴近提示词中的目标时长。
    target_frames = max(2, round(target_duration * SAMPLE_RATE / 1152))
    pcm_samples = (target_frames - 1) * 1152
    signal = signal[:pcm_samples].copy()
    fade_samples = min(len(signal), round(0.004 * SAMPLE_RATE))
    signal[-fade_samples:] *= np.linspace(1.0, 0.0, fade_samples)
    pcm = np.round(np.clip(signal, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(BITRATE_KBPS)
    encoder.set_in_sample_rate(SAMPLE_RATE)
    encoder.set_channels(1)
    encoder.set_quality(2)
    encoded = encoder.encode(pcm) + encoder.flush()
    path.write_bytes(bytes(encoded))


def main() -> None:
    RESOURCE_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[SFX] 开始生成 {len(SOUNDS)} 条音效")
    for index, (name, duration, generator) in enumerate(SOUNDS, start=1):
        signal = generator()
        expected_samples = round(duration * SAMPLE_RATE)
        if len(signal) != expected_samples:
            raise ValueError(f"{name}: {len(signal)} samples，预期 {expected_samples}")
        resource_path = RESOURCE_DIR / f"{name}.mp3"
        encode_mp3(signal, duration, resource_path)
        shutil.copy2(resource_path, PREVIEW_DIR / resource_path.name)
        print(
            f"[{index:02d}/{len(SOUNDS)}] {resource_path.name}: "
            f"{duration:.2f}s, {SAMPLE_RATE}Hz, mono, {resource_path.stat().st_size} bytes"
        )
    print("[SFX] 17 条音效全部生成完成")


if __name__ == "__main__":
    main()
