"""Transcribe Pamela's StreamToday program mixes with faster-whisper.

Reads only the top-level *.mp4 program mixes (not raw ISOs) and writes, per video:
  content/video/transcripts/<slug>.json  — segments with start/end seconds
  content/video/transcripts/<slug>.srt   — subtitles
  content/video/transcripts/<slug>.txt   — [mm:ss] timestamped plain text
Skips videos already transcribed, so it is safe to re-run.
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

SOURCES = [
    Path(r"E:\StreamToday -  AUNTYMEL - Pamela origin"),
    Path(r"E:\StreamToday -  AUNTYMEL REC 1"),
]
OUT = Path(__file__).resolve().parents[2] / "content" / "video" / "transcripts"
MODEL = sys.argv[1] if len(sys.argv) > 1 else "medium.en"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("streamtoday", "")).strip("-")


def ts(sec: float, srt: bool = False) -> str:
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if srt:
        return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int((s % 1) * 1000):03d}"
    return f"{int(h * 60 + m):02d}:{int(s):02d}"


def load_audio(path: Path) -> np.ndarray:
    """Decode to 16kHz mono float32 via ffmpeg — avoids faster-whisper's PyAV
    decoder, which breaks on PyAV versions lacking the `metadata_errors` kwarg."""
    return load_audio_window(path)


def load_audio_window(path, start: float = 0, duration: float | None = None) -> np.ndarray:
    seek = ["-ss", str(start)] if start else []
    span = ["-t", str(duration)] if duration else []
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", *seek, *span, "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    videos = sorted(p for d in SOURCES for p in d.glob("*.mp4") if not p.name.startswith("._"))
    print(f"{len(videos)} videos, model={MODEL}", flush=True)
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")

    for v in videos:
        s = slug(v.stem)
        if (OUT / f"{s}.json").exists():
            print(f"skip {s}", flush=True)
            continue
        t0 = time.time()
        segments, info = model.transcribe(load_audio(v), language="en", vad_filter=True, beam_size=5)
        segs = [{"start": round(x.start, 2), "end": round(x.end, 2), "text": x.text.strip()} for x in segments]

        (OUT / f"{s}.json").write_text(
            json.dumps({"source": str(v), "duration": info.duration, "model": MODEL, "segments": segs}, indent=1),
            encoding="utf-8",
        )
        (OUT / f"{s}.txt").write_text(
            "\n".join(f"[{ts(x['start'])}] {x['text']}" for x in segs), encoding="utf-8"
        )
        (OUT / f"{s}.srt").write_text(
            "\n".join(
                f"{i}\n{ts(x['start'], True)} --> {ts(x['end'], True)}\n{x['text']}\n" for i, x in enumerate(segs, 1)
            ),
            encoding="utf-8",
        )
        print(f"done {s}: {info.duration:.0f}s audio in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
