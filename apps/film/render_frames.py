#!/usr/bin/env python3
"""Renderiza la película fotograma a fotograma y la codifica con ffmpeg.

Cada fotograma se pide por su tiempo (`window.__render(t)`): no depende del
reloj ni de la velocidad de la máquina, así que el resultado es idéntico en
cualquier equipo.

Es reanudable: los fotogramas se guardan en `--frames` y los que ya existen
no se vuelven a pedir. Si el proceso se corta, se relanza igual y sigue.
`--max` limita cuántos fotogramas nuevos hace en esta pasada. Cuando están
todos, se codifican con ffmpeg en `--out`.

    python3 render_frames.py --url http://127.0.0.1:8816/film/index.html \\
        --frames /ruta/fotogramas --out rebuild-pipeline.mp4 [--max 600]
"""

from __future__ import annotations

import argparse
import asyncio
import subprocess
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

CHROMIUM = "/opt/pw-browsers/chromium"


async def main(a: argparse.Namespace) -> int:
    frames = Path(a.frames)
    frames.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROMIUM, args=["--disable-background-networking"])
        page = await b.new_page(viewport={"width": 2560, "height": 1440}, device_scale_factor=a.scale)
        page.on("pageerror", lambda e: print("pageerror:", e, file=sys.stderr))
        await page.goto(a.url, wait_until="domcontentloaded")
        await page.wait_for_function("window.__ready !== undefined", timeout=60000)
        await page.evaluate("window.__ready")
        end = a.to if a.to is not None else await page.evaluate("window.__duration")
        n = round((end - a.start) * a.fps)
        todo = [i for i in range(n) if not (frames / f"{i:05d}.png").exists()]
        print(f"{n - len(todo)}/{n} fotogramas ya en disco; quedan {len(todo)}", flush=True)
        t0 = time.time()
        for k, i in enumerate(todo[: a.max]):
            t = a.start + i / a.fps
            await page.evaluate(f"window.__render({t:.5f})")
            tmp = frames / f"{i:05d}.tmp.png"
            await page.screenshot(path=str(tmp), type="png")
            tmp.rename(frames / f"{i:05d}.png")
            if k % 60 == 0:
                print(f"fotograma {i}/{n} t={t:.2f}s · {(time.time() - t0) / max(k, 1):.2f} s/fotograma", flush=True)
        await b.close()
    left = sum(1 for i in range(n) if not (frames / f"{i:05d}.png").exists())
    if left:
        print(f"quedan {left} fotogramas: relanzar para seguir", flush=True)
        return 0
    print("todos los fotogramas listos; codificando", flush=True)
    return subprocess.call(
        ["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(a.fps), "-i", str(frames / "%05d.png"),
         "-c:v", "libx264", "-preset", "slow", "-crf", str(a.crf), "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", a.out],
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--url", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--frames", required=True, help="carpeta de fotogramas (reanudable)")
    p.add_argument("--max", type=int, default=10**9, help="fotogramas nuevos en esta pasada")
    p.add_argument("--from", dest="start", type=float, default=0.0)
    p.add_argument("--to", type=float, default=None)
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--scale", type=float, default=1.0)
    p.add_argument("--crf", type=int, default=16)
    sys.exit(asyncio.run(main(p.parse_args())))
