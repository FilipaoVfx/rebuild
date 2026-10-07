"""Clips de ultrademo -> 2560x1440 con cursor; velocidad por escena."""
import json, subprocess, sys
from pathlib import Path
A = Path(sys.argv[1]); OUT = Path(sys.argv[2]); OUT.mkdir(exist_ok=True)
SPEED = {"c1-capas": 1.6, "c2-buscar": 1.6, "c8-intervenciones": 1.5, "c9-verificar": 1.5}
DEFAULT = 1.3      # las fotos y su porqué se leen: van más despacio
HOLD = 0.5
sb = json.load(open(A / "storyboard.json"))
parts = []
for sc in sb["scenes"]:
    S = SPEED.get(sc["id"], DEFAULT)
    ev = sorted(sc["events"], key=lambda e: e["t"])
    K = 2560 / 1440
    pts = [(e["t"] / S, round(K * e["x"]), round(K * e["y"])) for e in ev]
    def expr(i):
        e = f"{pts[-1][i]}"
        for (t0, *a), (t1, *b) in reversed(list(zip(pts, pts[1:]))):
            v0, v1 = a[i - 1], b[i - 1]
            seg = f"{v0}" if t1 <= t0 else f"({v0}+({v1}-{v0})*(t-{t0:.3f})/({t1 - t0:.3f}))"
            e = f"if(lt(t,{t1:.3f}),{seg},{e})"
        return f"if(lt(t,{pts[0][0]:.3f}),{pts[0][i]},{e})"
    clicks = [(t, x, y) for (t, x, y), e in zip(pts, ev) if e["type"] == "click"]
    f = [f"[0:v]scale=2560:1440:flags=lanczos,setpts=PTS/{S},fps=30,tpad=stop_mode=clone:stop_duration={HOLD}[b0]"]
    cur = "b0"
    for k, (t, x, y) in enumerate(clicks):
        f.append(f"[{cur}][2:v]overlay=shortest=1:x={x - 60}:y={y - 60}:enable='between(t,{t:.3f},{t + 0.35:.3f})'[r{k}]")
        cur = f"r{k}"
    f.append(f"[{cur}][1:v]overlay=shortest=1:x='{expr(1)}-4':y='{expr(2)}-4':eval=frame,format=yuv420p[out]")
    out = OUT / f"{sc['id']}.mp4"
    dur = sc["clipDuration"] / S + HOLD
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(A / "captures" / f"{sc['id']}.mp4"),
                    "-loop", "1", "-i", "/tmp/m4k/cursor.png", "-loop", "1", "-i", "/tmp/m4k/ring.png",
                    "-filter_complex", ";".join(f), "-map", "[out]", "-t", f"{dur:.3f}", "-an",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-r", "30", str(out)], check=True)
    print(sc["id"], f"{dur:.1f}s", f"x{S}", flush=True)
    parts.append(str(out))
json.dump(parts, open(OUT / "parts.json", "w"))
