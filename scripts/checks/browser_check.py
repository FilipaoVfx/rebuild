#!/usr/bin/env python3
"""Verificacion del visor en un navegador real.

El validador de paleta comprueba color, no geometria. Esto abre la pagina,
ejerce el flujo completo y captura pantallas para poder mirarlas.
"""

import asyncio
import sys

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8099/"
CHROMIUM = "/opt/pw-browsers/chromium"


async def main() -> int:
    async with async_playwright() as playwright:
        # Chromium intenta contactar servicios de Google en segundo plano;
        # tras un proxy esas conexiones cuelgan y "networkidle" nunca llega.
        browser = await playwright.chromium.launch(
            executable_path=CHROMIUM,
            args=[
                "--disable-features=Translate,OptimizationHints,AutofillServerCommunication",
                "--disable-background-networking",
                "--no-first-run",
            ],
        )
        page = await browser.new_page(viewport={"width": 1680, "height": 1000})
        errors: list[str] = []
        page.on(
            "console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None
        )
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_selector("tbody tr", timeout=30000)
        print("filas en tabla:", await page.locator("tbody tr").count())

        bars = await page.evaluate(
            """() => {
                const fills = [...document.querySelectorAll('.bar-fill')];
                return {
                    n: fills.length,
                    widths: fills.slice(0, 6).map(e => +e.getBoundingClientRect().width.toFixed(1)),
                    color: getComputedStyle(fills[0]).backgroundColor,
                };
            }"""
        )
        print("barras inline:", bars)
        # Una barra de 0 px no rompe nada y no se ve: hay que comprobarla.
        if bars["n"] and not any(w > 0 for w in bars["widths"]):
            errors.append("las barras inline se renderizan con ancho 0")

        await page.locator("tbody tr").first.click()
        await page.wait_for_selector(".decomp-bar", timeout=30000)
        await page.screenshot(path="/tmp/ui_tabla.png")

        await page.click("#optimize")
        await page.wait_for_selector("#p-portfolio table tbody tr", timeout=90000)
        print("portafolio filas:", await page.locator("#p-portfolio table tbody tr").count())
        await page.screenshot(path="/tmp/ui_portfolio.png")

        await page.click('[data-panel="p-map"]')
        await page.wait_for_timeout(6000)
        await page.screenshot(path="/tmp/ui_mapa.png")

        await page.click('[data-panel="p-sources"]')
        await page.wait_for_timeout(600)
        await page.screenshot(path="/tmp/ui_fuentes.png")

        print("errores de consola:", errors or "ninguno")
        await browser.close()
        return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
