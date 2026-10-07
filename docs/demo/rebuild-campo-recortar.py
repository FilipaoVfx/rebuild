"""Recorta tiempo muerto: cada tramo quieto se deja en KEEP s; el cursor se reajusta."""
import json, re, subprocess, sys
from pathlib import Path
A = Path(sys.argv[1]); OUT = Path(sys.argv[2]); OUT.mkdir(exist_ok=True)
PHOTO = {"c3-galeria", "c4-medida", "c5-ambigua", "c6-encuadre", "c7-sin-enlace"}
sb = json.load(open(A / "storyboard.json"))
for sc in sb["scenes"]:
    src = A / "captures" / f"{sc['id']}.mp4"
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
                               capture_output=True, text=True).stdout)
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(src), "-vf", "freezedetect=n=0.002:d=1.5", "-map", "0:v",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", log)]
    en = [float(x) for x in re.findall(r"freeze_end: ([\d.]+)", log)]
    en += [dur] * (len(st) - len(en))
    merged = []
    for a, b in zip(st, en):
        if merged and a - merged[-1][1] < 0.6:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    keep = 3.0 if sc["id"] in PHOTO else 2.2
    cuts = []
    for i, (a, b) in enumerate(merged):
        k = keep + (0.8 if i == len(merged) - 1 else 0)   # el final se lee un poco más
        if b - a > k + 0.2:
            cuts.append((a + k, b))
    sel = "+".join(f"between(t,{a:.3f},{b:.3f})" for a, b in cuts) or "0"
    out = OUT / f"{sc['id']}.mp4"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-vf",
                    f"select='not({sel})',setpts=N/FRAME_RATE/TB", "-an", "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "10", str(out)], check=True)
    removed = lambda t: sum(min(b, t) - a for a, b in cuts if t > a)
    ev = [dict(e, t=round(e["t"] - removed(e["t"]), 3)) for e in sc["events"]
          if not any(a < e["t"] < b for a, b in cuts)]
    sc["events"] = ev
    newdur = dur - sum(b - a for a, b in cuts)
    sc["clipDuration"] = round(min(sc["clipDuration"] - sum(b - a for a, b in cuts), newdur), 3)
    print(sc["id"], f"{dur:.1f} -> {newdur:.1f}s", len(cuts), "cortes", flush=True)
(OUT / "captures").mkdir(exist_ok=True)
for p in OUT.glob("c*.mp4"):
    p.replace(OUT / "captures" / p.name)
json.dump(sb, open(OUT / "storyboard.json", "w"))
