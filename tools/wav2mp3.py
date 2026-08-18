# 临时脚本：把 docs/assets/audio/ 下所有 wav 批量转为 mp3，输出到同一文件夹
# 依赖：pip install lameenc（自带 LAME 编码器，无需 ffmpeg）
import sys
import wave
from pathlib import Path

import lameenc

AUDIO_DIR = Path(__file__).resolve().parent.parent / "docs" / "assets" / "audio"
BITRATE_KBPS = 192


def wav_to_mp3(wav_path: Path) -> Path:
    mp3_path = wav_path.with_suffix(".mp3")
    with wave.open(str(wav_path), "rb") as w:
        channels, rate, width = w.getnchannels(), w.getframerate(), w.getsampwidth()
        if width != 2:
            raise ValueError(f"{wav_path.name}: 仅支持 16bit PCM，实际 {width * 8}bit")
        pcm = w.readframes(w.getnframes())

    encoder = lameenc.Encoder()
    encoder.set_bit_rate(BITRATE_KBPS)
    encoder.set_in_sample_rate(rate)
    encoder.set_channels(channels)
    encoder.set_quality(2)  # 0 最高质量最慢，2 为高质量推荐值
    data = encoder.encode(pcm)
    data += encoder.flush()

    mp3_path.write_bytes(bytes(data))
    return mp3_path


def main() -> None:
    wav_files = sorted(AUDIO_DIR.glob("*.wav"))
    if not wav_files:
        print(f"[wav2mp3] 未找到 wav 文件：{AUDIO_DIR}")
        sys.exit(1)
    for wav_path in wav_files:
        if wav_path.with_suffix(".mp3").exists():
            print(f"[wav2mp3] 跳过（mp3 已存在）：{wav_path.name}")
            continue
        mp3_path = wav_to_mp3(wav_path)
        print(
            f"{wav_path.name} -> {mp3_path.name}"
            f"（{wav_path.stat().st_size // 1024}KB -> {mp3_path.stat().st_size // 1024}KB）"
        )


if __name__ == "__main__":
    main()
