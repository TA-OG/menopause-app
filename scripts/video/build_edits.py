"""Generate content/video/edits/*.json from word-timed cut specs.

Each cut is (src, take, first_word_start, last_word_start): the in/out points are
snapped to word boundaries with a little breathing room, never into a neighbour word.
Re-run after changing CLIPS; render with render_clip.py.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORDS = ROOT / "content" / "video" / "transcripts" / "words"
EDITS = ROOT / "content" / "video" / "edits"
PAD_IN, PAD_OUT = 0.25, 0.35
NAME = {"title": "Pamela", "subtitle": "Founder, Aunty Mel", "from": 0.8, "to": 5.5}

_cache: dict = {}


def words(src, take):
    key = f"{src}-{take:02d}"
    if key not in _cache:
        _cache[key] = json.loads((WORDS / f"{key}.json").read_text(encoding="utf-8"))["words"]
    return _cache[key]


def cut(src, take, first, last, **extra):
    ws = words(src, take)
    i = min(range(len(ws)), key=lambda k: abs(ws[k]["s"] - first))
    j = min(range(len(ws)), key=lambda k: abs(ws[k]["s"] - last))
    prev_end = ws[i - 1]["e"] if i > 0 else 0
    next_start = ws[j + 1]["s"] if j + 1 < len(ws) else ws[j]["e"] + 1
    seg = {
        "src": src, "take": take,
        "in": round(max(ws[i]["s"] - PAD_IN, prev_end + 0.05), 2),
        "out": round(min(ws[j]["e"] + PAD_OUT, next_start - 0.05), 2),
        "text": " ".join(w["w"] for w in ws[i:j + 1]),
    }
    seg.update(extra)
    return seg


CLIPS = {
    "lost-my-mind": {"feeling": "foggy", "line": "You're not alone",
                     "cuts": [cut("ssa", 6, 1.49, 24.21, lower_third=NAME)]},
    "the-3am-wake-up": {"feeling": "cant_sleep", "line": "Better nights start here",
                        "cuts": [cut("ssa", 6, 36.73, 56.61, lower_third=NAME)]},
    "nobody-warns-you-about-the-rage": {"feeling": "anxious", "line": "Breathe. You're not alone",
                                        "cuts": [cut("ssa", 6, 72.10, 86.02, lower_third=NAME),
                                                 cut("ssa", 6, 96.72, 99.98)]},
    "its-not-your-relationship": {"feeling": "overwhelmed", "line": "You're not alone in this",
                                  "cuts": [cut("ssa", 6, 112.37, 135.19, lower_third=NAME)]},
    "told-its-stress": {"feeling": "low", "line": "Your symptoms are real",
                        "cuts": [cut("ssa", 6, 149.45, 174.97, lower_third=NAME)]},
    "your-window-of-opportunity": {"learn": "perimenopause", "line": "Your window starts now",
                                   "cuts": [cut("ssa", 6, 191.26, 210.88, lower_third=NAME)]},
    "hrt-and-the-bigger-picture": {"learn": "hrt", "review": "Pamela to approve HRT framing",
                                   "line": "Talk to your GP about what's right for you",
                                   "cuts": [cut("ssa", 7, 90.55, 112.15, lower_third=NAME)]},
    "tests-to-ask-your-gp-for": {"learn": "normal-bloodwork-doesnt-mean-youre-fine",
                                 "line": "Take this list to your GP",
                                 "cuts": [cut("origin", 3, 373.62, 427.32, lower_third=NAME),
                                          cut("origin", 3, 442.74, 459.40),
                                          cut("origin", 3, 460.88, 478.32),
                                          cut("origin", 3, 483.94, 533.84, lower_third={
                                              "title": "SHBG", "subtitle": "Sex hormone binding globulin",
                                              "from": 4.5, "to": 11}),
                                          cut("origin", 3, 538.52, 575.18),
                                          cut("origin", 3, 582.62, 603.76)]},
    "signs-to-notice": {"learn": "check-in", "line": "Start noticing, and check in daily",
                        "cuts": [cut("origin", 3, 21.77, 63.31, lower_third=NAME),
                                 cut("origin", 3, 78.49, 82.95),
                                 cut("origin", 3, 83.45, 124.41)]},
    "your-story-matters": {"learn": "my-plan", "line": "Your story matters",
                           "cuts": [cut("origin", 2, 372.33, 388.43, lower_third=NAME),
                                    cut("origin", 2, 448.67, 491.77),
                                    cut("origin", 2, 493.41, 517.31)]},
}

if __name__ == "__main__":
    EDITS.mkdir(parents=True, exist_ok=True)
    for slug, c in CLIPS.items():
        edit = {"output": f"aunty-mel-{slug}", "segments": c["cuts"], "end_card": {"line": c["line"]},
                **{k: c[k] for k in ("feeling", "learn", "review") if k in c}}
        (EDITS / f"{slug}.json").write_text(json.dumps(edit, indent=1, ensure_ascii=False), encoding="utf-8")
        dur = sum(s["out"] - s["in"] for s in c["cuts"])
        print(f"{slug:36s} {len(c['cuts'])} cuts  {dur:6.1f}s")
