#!/usr/bin/env python3
"""Verificacion del visor en un navegador real.

El validador de paleta comprueba color, no geometria, y las pruebas de Python
no abren una pagina. Esto ejerce el flujo completo y captura pantallas para
poder mirarlas.

Acepta una URL para poder verificar tanto el visor servido por la API como el
paquete estatico publicado.
"""

from __future__ import annotations

import asyncio
import sys

from playwright.async_api import async_playwright

CHROMIUM = "/opt/pw-browsers/chromium"


async def main(base: str, prefix: str) -> int:
    async with async_playwright() as playwright:
        # Chromium contacta servicios de Google en segundo plano; tras un proxy
        # esas conexiones cuelgan y "networkidle" nunca llega.
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
            "console",
            lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None,
        )
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        await page.goto(base, wait_until="domcontentloaded")

        # El mapa es la superficie primaria y arranca visible.
        await page.wait_for_selector("#layer-control input[data-layer]", timeout=45000)
        await page.wait_for_timeout(6000)
        rendered = await page.evaluate(
            "() => !!document.querySelector('#map canvas')"
            " && document.querySelector('#map canvas').width > 0"
        )
        print("mapa renderizado:", rendered)
        if not rendered:
            errors.append("el canvas del mapa no se renderizo")
        print("capas en el control:", await page.locator("#layer-control input").count())
        await page.screenshot(path=f"/tmp/{prefix}_mapa.png")

        # Activar las capas opcionales para comprobar que existen y se pintan.
        # Sin "risk": la capa del SGC se retiro por licencia (ADR-18).
        optional = ("population", "catchments", "facilities")
        for layer in optional:
            await page.click(f'#layer-control input[data-layer="{layer}"]')
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"/tmp/{prefix}_mapa_capas.png")
        for layer in optional:
            await page.click(f'#layer-control input[data-layer="{layer}"]')

        # Ninguna fuente retirada puede quedar anunciada en el control de capas
        # ni en la atribucion: un control que no enciende nada, o un credito a
        # quien no aporto, son la misma clase de mentira pequeña.
        for gone in ("risk",):
            if await page.locator(f'#layer-control input[data-layer="{gone}"]').count():
                errors.append(f"la capa retirada '{gone}' sigue en el control")
        attribution = await page.locator(".maplibregl-ctrl-attrib-inner").inner_text()
        for gone in ("SERTIT", "SGC", "Servicio Geologico"):
            if gone.lower() in attribution.lower():
                errors.append(f"la atribucion nombra a '{gone}', que no aporta dato")
        print("atribucion:", attribution.strip())

        # ── Relieve 3D (deck.gl) ─────────────────────────────────────────
        #
        # deck.gl se carga en diferido, asi que hasta aqui NO debe estar en la
        # pagina: si lo estuviera, el arranque pagaria 575 KB comprimidos por
        # una vista que nadie pidio.
        if await page.evaluate("() => !!window.deck"):
            errors.append("deck.gl se cargo en el arranque; debia ser en diferido")

        await page.click('#layer-control input[data-layer="relief"]')
        try:
            await page.wait_for_function("() => !!window.deck", timeout=60000)
            await page.wait_for_function(
                "() => { const n = document.querySelector('#relief-note');"
                " return n && !n.hidden && n.textContent.includes('Altura'); }",
                timeout=60000,
            )
        except Exception as exc:  # noqa: BLE001 - se reporta, no se traga
            errors.append(f"el relieve 3D no se activo: {exc}")

        await page.wait_for_timeout(3500)
        relief = await page.evaluate(
            "() => ({"
            " canvases: document.querySelectorAll('#map canvas').length,"
            " pitch: window.__uriPitch ? window.__uriPitch() : null,"
            " nota: (document.querySelector('#relief-note') || {}).textContent || ''"
            "})"
        )
        print("lienzos tras activar 3D:", relief["canvases"])
        print("nota del relieve:", " ".join(relief["nota"].split())[:150])
        # deck.gl dibuja en su propio lienzo sobre el de MapLibre.
        if relief["canvases"] < 2:
            errors.append("deck.gl no anadio su lienzo al mapa")
        # La nota tiene que llevar numeros medidos, no una frase generica.
        if "%" not in relief["nota"] or "personas" not in relief["nota"]:
            errors.append("la nota del relieve no reporta la cobertura medida")
        await page.screenshot(path=f"/tmp/{prefix}_relieve3d.png")

        # La nota explica los colores que la leyenda define: si se superponen,
        # la vista pierde justo lo que la hace legible.
        boxes = await page.evaluate(
            "() => { const r = (s) => { const e = document.querySelector(s);"
            " return e && !e.hidden ? e.getBoundingClientRect().toJSON() : null; };"
            " return { nota: r('#relief-note'), leyenda: r('.map-legend') }; }"
        )
        nota, leyenda = boxes["nota"], boxes["leyenda"]
        if nota and leyenda:
            solapa = (
                nota["left"] < leyenda["right"]
                and leyenda["left"] < nota["right"]
                and nota["top"] < leyenda["bottom"]
                and leyenda["top"] < nota["bottom"]
            )
            if solapa:
                errors.append("la nota del relieve se superpone con la leyenda del mapa")

        # El recorrido mueve la camara: si no, es un boton que no hace nada.
        antes = await page.evaluate("() => window.__uriCenter()")
        await page.click("#tour")
        await page.wait_for_timeout(4000)
        despues = await page.evaluate("() => window.__uriCenter()")
        if antes == despues:
            errors.append("el recorrido del portafolio no movio la camara")
        print("recorrido movio la camara:", antes != despues)

        await page.click('#layer-control input[data-layer="relief"]')
        await page.wait_for_timeout(1200)

        # Seleccion desde el mapa -> panel de detalle.
        box = await page.locator("#map").bounding_box()
        await page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        await page.wait_for_timeout(1500)

        # Tabla densa.
        await page.click('[data-panel="p-sites"]')
        await page.wait_for_selector("tbody tr", timeout=30000)
        print("filas en tabla:", await page.locator("tbody tr").count())

        bars = await page.evaluate(
            """() => {
                const fills = [...document.querySelectorAll('.bar-fill')];
                return {
                    n: fills.length,
                    widths: fills.slice(0, 6).map(e => +e.getBoundingClientRect().width.toFixed(1)),
                };
            }"""
        )
        print("barras inline:", bars)
        # Una barra de 0 px no rompe nada y no se ve: hay que comprobarla.
        if bars["n"] and not any(w > 0 for w in bars["widths"]):
            errors.append("las barras inline se renderizan con ancho 0")

        await page.locator("tbody tr").first.click()
        await page.wait_for_selector(".decomp-bar", timeout=30000)
        await page.screenshot(path=f"/tmp/{prefix}_tabla.png")

        await page.click("#optimize")
        await page.wait_for_selector("#p-portfolio table tbody tr", timeout=90000)
        print("portafolio filas:", await page.locator("#p-portfolio table tbody tr").count())
        await page.screenshot(path=f"/tmp/{prefix}_portafolio.png")

        await page.click('[data-panel="p-sources"]')
        await page.wait_for_timeout(600)
        await page.screenshot(path=f"/tmp/{prefix}_fuentes.png")

        print("errores de consola:", errors or "ninguno")
        await browser.close()
        return 1 if errors else 0


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8099/"
    name = sys.argv[2] if len(sys.argv) > 2 else "ui"
    sys.exit(asyncio.run(main(url, name)))
