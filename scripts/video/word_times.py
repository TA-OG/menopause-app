"""Word-level timestamps for source windows, used to place frame-accurate cuts.

Writes content/video/transcripts/words/<src>-<take>.json as
  {"windows": [[in, out], ...], "words": [{"w": "text", "s": start, "e": end}, ...]}
with times in SOURCE seconds. Usage: python scripts/video/word_times.py
"""
import json
from pathlib import Path

from faster_whisper import WhisperModel

from render_clip import SOURCES
from transcribe import load_audio_window

OUT = Path(__file__).resolve().parents[2] / "content" / "video" / "transcripts" / "words"

# (src, take, [(in, out), ...]) — the regions the clip edits draw from.
WINDOWS = [
    ("ssa", 6, [(0, 288)]),
    ("ssa", 7, [(15, 126)]),
    ("ssa", 5, [(0, 30)]),
    ("origin", 2, [(300, 530)]),
    ("origin", 3, [(0, 130), (365, 615), (765, 862)]),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    model = WhisperModel("medium.en", device="cpu", compute_type="int8")
    for src, take, wins in WINDOWS:
        dest = OUT / f"{src}-{take:02d}.json"
        if dest.exists():
            print(f"skip {dest.name}", flush=True)
            continue
        words = []
        for a, b in wins:
            segs, _ = model.transcribe(
                load_audio_window(SOURCES[src].format(take), a, b - a),
                language="en", word_timestamps=True, vad_filter=True,
            )
            words += [{"w": w.word.strip(), "s": round(a + w.start, 2), "e": round(a + w.end, 2)}
                      for s in segs for w in s.words]
        dest.write_text(json.dumps({"windows": wins, "words": words}, indent=0), encoding="utf-8")
        print(f"done {dest.name}: {len(words)} words", flush=True)


if __name__ == "__main__":
    main()
