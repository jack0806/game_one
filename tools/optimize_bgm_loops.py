"""将 Hexblast 的 BGM 处理为可循环、统一响度且不削波的 MP3。

对每首曲的尾部与头部做 1.5 秒等功率交叉淡化，再从原曲
1.5 秒处作为新循环起点。这样 MP3 重复时的边界与原始连续采样一致，
同时保留了尾部到头部的音乐过渡。
"""

from __future__ import annotations

import math
from pathlib import Path

import lameenc
import numpy as np
import soundfile as sf


ROOT = Path(__file__).resolve().parent.parent
BGM_DIR = ROOT / "assets" / "resources" / "audio" / "bgm"
SAMPLE_RATE = 44_100
BITRATE_KBPS = 192
CROSSFADE_SECONDS = 1.5
MIN_SOURCE_SECONDS = 59.5
PEAK_DBFS = -1.0
TARGET_RMS_DBFS = {
    "bgm_title": -16.5,
    "bgm_ch1": -16.0,
    "bgm_ch2": -16.0,
    "bgm_ch3": -16.0,
    "bgm_ch4": -16.0,
    "bgm_boss": -14.5,
    "bgm_shop": -17.0,
}


def db(value: float) -> float:
    return 20.0 * math.log10(max(value, 1e-12))


def encode_mp3(stereo: np.ndarray, path: Path) -> None:
    pcm = np.round(np.clip(stereo, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(BITRATE_KBPS)
    encoder.set_in_sample_rate(SAMPLE_RATE)
    encoder.set_channels(2)
    encoder.set_quality(2)
    path.write_bytes(bytes(encoder.encode(pcm) + encoder.flush()))


def optimize(signal: np.ndarray, target_rms_dbfs: float) -> np.ndarray:
    if signal.ndim == 1:
        signal = np.column_stack((signal, signal))
    elif signal.shape[1] > 2:
        signal = signal[:, :2]

    fade_count = round(CROSSFADE_SECONDS * SAMPLE_RATE)
    if len(signal) <= fade_count * 3:
        raise ValueError("曲目太短，无法安全交叉淡化")

    # 删去新起点前的一段；尾部平滑融入被删去的头部。
    loop = signal[fade_count:].astype(np.float64, copy=True)
    phase = np.linspace(0.0, math.pi / 2.0, fade_count, endpoint=False)
    tail_gain = np.cos(phase)[:, None]
    head_gain = np.sin(phase)[:, None]
    loop[-fade_count:] = loop[-fade_count:] * tail_gain + signal[:fade_count] * head_gain

    rms = math.sqrt(float(np.mean(np.square(loop))))
    if rms > 0:
        loop *= 10 ** (target_rms_dbfs / 20.0) / rms
    peak_limit = 10 ** (PEAK_DBFS / 20.0)
    peak = float(np.max(np.abs(loop)))
    if peak > peak_limit:
        loop *= peak_limit / peak
    return loop


def main() -> None:
    for name, target_rms in TARGET_RMS_DBFS.items():
        path = BGM_DIR / f"{name}.mp3"
        signal, sample_rate = sf.read(path, dtype="float64", always_2d=True)
        if sample_rate != SAMPLE_RATE:
            raise ValueError(f"{path.name}: {sample_rate}Hz，预期 {SAMPLE_RATE}Hz")
        if len(signal) / SAMPLE_RATE < MIN_SOURCE_SECONDS:
            print(f"[BGM] {path.name}: 已是优化版，跳过重复裁切")
            continue
        result = optimize(signal, target_rms)
        encode_mp3(result, path)
        rms = math.sqrt(float(np.mean(np.square(result))))
        peak = float(np.max(np.abs(result)))
        print(
            f"[BGM] {path.name}: {len(result) / SAMPLE_RATE:.2f}s, "
            f"RMS {db(rms):.1f}dBFS, peak {db(peak):.1f}dBFS"
        )


if __name__ == "__main__":
    main()
