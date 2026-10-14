"""Render an in-app video from an edit list (content/video/edits/*.json).

Every video gets the same branded end card: stacked Aunty Mel logo on the warm
cream background, plus an optional per-video line underneath.

Edit list shape:
{
  "output": "aunty-mel-welcome",           # file name, no extension
  "segments": [                             # source cuts, played in order
    {"src": "origin", "take": 2, "in": 183.08, "out": 212.05,
     "lower_third": {"title": "Pamela", "subtitle": "Founder, Aunty Mel", "from": 1.5, "to": 7}}
  ],
  "end_card": {"line": "Let's start with how you're feeling today"}
}

src "origin" / "ssa" map to the two StreamToday sessions; always CAM 2 (Pamela to camera).
Output lands in OneDrive CONTENT/exports as <output>.mp4, loudness-normalised to -16 LUFS.

Usage: python scripts/video/render_clip.py content/video/edits/welcome.json
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    "origin": r"E:\StreamToday -  AUNTYMEL - Pamela origin\Video ISO Files\StreamToday -  Pamela origin CAM 2 {:02d}.mp4",
    "ssa": r"E:\StreamToday -  AUNTYMEL REC 1\Video ISO Files\StreamToday -  ssa CAM 2 {:02d}.mp4",
}
OUTDIR = Path(r"D:\OneDrive - TheOkelloGroup.com Ltd\Menopause App\CONTENT\exports")
LOGO = ROOT / "content" / "video" / "brand" / "logo-stacked.png"

CREAM, BROWN, MUTED = "0xF6EFE9", "0x5A3E36", "0x8A6A5E"
FONT = r"C\:/Windows/Fonts/georgia.ttf"
FONT_I = r"C\:/Windows/Fonts/georgiai.ttf"
XFADE = 0.4
CARD_SECS = 4.5


def esc(text: str) -> str:
    """drawtext-safe text: straight apostrophes become typographic ones (they
    can't be escaped reliably inside a filtergraph); colons and % are escaped."""
    return text.replace("'", "\u2019").replace(":", r"\:").replace("%", r"\%")


def end_card_filter(input_idx: int, logo_idx: int, line: str | None) -> list[str]:
    logo_h = 420 if line else 480
    logo_y = "(H-h)/2-60" if line else "(H-h)/2"
    f = [
        f"[{logo_idx}:v]scale=-1:{logo_h},format=rgba,fade=t=in:st=0.2:d=0.8:alpha=1[logo]",
        f"[{input_idx}:v][logo]overlay=x=(W-w)/2:y={logo_y}:format=auto,format=yuv420p[cardbase]",
    ]
    if line:
        f.append(
            f"[cardbase]drawtext=fontfile='{FONT_I}':text='{esc(line)}':fontsize=46:fontcolor={MUTED}"
            f":x=(w-tw)/2:y=h/2+{logo_h // 2 - 20}:alpha='min(1,max(0,(t-0.8)/0.6))'[vc]"
        )
    else:
        f.append("[cardbase]null[vc]")
    return f


def render(edit_path: Path) -> Path:
    edit = json.loads(edit_path.read_text(encoding="utf-8"))
    segs = edit["segments"]
    OUTDIR.mkdir(parents=True, exist_ok=True)
    final = OUTDIR / f"{edit['output']}.mp4"
    pre = OUTDIR / f"{edit['output']}.pre.mp4"

    args = ["ffmpeg", "-v", "error", "-y"]
    for s in segs:
        args += ["-ss", str(s["in"]), "-t", f"{s['out'] - s['in']:.3f}", "-i", SOURCES[s["src"]].format(s["take"])]
    card_idx, logo_idx, silence_idx = len(segs), len(segs) + 1, len(segs) + 2
    args += ["-f", "lavfi", "-t", str(CARD_SECS), "-i", f"color=c={CREAM}:s=1920x1080:r=30"]
    args += ["-loop", "1", "-t", str(CARD_SECS), "-i", str(LOGO)]
    args += ["-f", "lavfi", "-t", str(CARD_SECS), "-i", "anullsrc=r=48000:cl=stereo"]

    f, vids, auds = [], [], []
    for i, s in enumerate(segs):
        chain = f"[{i}:v]scale=1920:1080,fps=30,format=yuv420p,setpts=PTS-STARTPTS"
        lt = s.get("lower_third")
        if lt:
            on = f"enable='between(t,{lt['from']},{lt['to']})'"
            chain += (
                f",drawbox=x=90:y=880:w=640:h=120:color={CREAM}@0.85:t=fill:{on}"
                f",drawtext=fontfile='{FONT}':text='{esc(lt['title'])}':fontsize=48:fontcolor={BROWN}:x=120:y=895:{on}"
                f",drawtext=fontfile='{FONT_I}':text='{esc(lt['subtitle'])}':fontsize=32:fontcolor={MUTED}:x=120:y=952:{on}"
            )
        f.append(chain + f"[v{i}]")
        f.append(f"[{i}:a]aresample=48000,asetpts=PTS-STARTPTS[a{i}]")
        vids.append(f"v{i}")
        auds.append(f"a{i}")

    f += end_card_filter(card_idx, logo_idx, (edit.get("end_card") or {}).get("line"))
    f.append(f"[{silence_idx}:a]anull[ac]")
    vids.append("vc")
    auds.append("ac")

    durs = [s["out"] - s["in"] for s in segs] + [CARD_SECS]
    cur_v, cur_a, total = vids[0], auds[0], durs[0]
    for k in range(1, len(vids)):
        f.append(f"[{cur_v}][{vids[k]}]xfade=transition=fade:duration={XFADE}:offset={total - XFADE:.3f}[xv{k}]")
        f.append(f"[{cur_a}][{auds[k]}]acrossfade=d={XFADE}[xa{k}]")
        cur_v, cur_a = f"xv{k}", f"xa{k}"
        total += durs[k] - XFADE
    f.append(f"[{cur_v}]fade=t=in:st=0:d=0.6,fade=t=out:st={total - 0.8:.3f}:d=0.8[vout]")
    f.append(f"[{cur_a}]afade=t=in:st=0:d=0.4,afade=t=out:st={total - 0.8:.3f}:d=0.8[aout]")

    args += ["-filter_complex", ";".join(f), "-map", "[vout]", "-map", "[aout]",
             "-c:v", "libx264", "-preset", "medium", "-crf", "19",
             "-c:a", "pcm_s16le", "-ar", "48000", str(pre).replace(".mp4", ".mov")]
    pre = Path(str(pre).replace(".mp4", ".mov"))
    subprocess.run(args, check=True)

    # Two-pass loudness normalisation to -16 LUFS (single-pass undershoots on speech).
    err = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(pre), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    m = json.loads(err[err.rindex("{"): err.rindex("}") + 1])
    af = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
          f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(pre), "-c:v", "copy", "-af", af,
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(final)],
        check=True,
    )
    os.remove(pre)
    # 720p web copy — what the app will actually stream.
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(final), "-vf", "scale=-2:720", "-c:v", "libx264",
         "-preset", "slow", "-crf", "25", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
         str(final.with_name(final.stem + "-720p.mp4"))],
        check=True,
    )
    print(f"{final}  {total:.1f}s", flush=True)
    return final


if __name__ == "__main__":
    for p in sys.argv[1:]:
        render(Path(p))
