#!/usr/bin/env python3
"""Verificacion del visor en un navegador real.

Recorre el flujo del analista de la interfaz REBUILD (ADR-27): ubicar un
lugar, examinar su evidencia, explorar su entorno, comparar dos hipotesis y
preparar la verificacion. En cada paso comprueba lo que la interfaz no puede
perder aunque cambie el diseño: que diga que la cobertura es parcial, que la
evidencia no esta validada en campo, que el POT no tiene dato publicable, que
lo que falta se diga en vez de pintarse como cero, y que la procedencia siga
en pantalla.

Acepta una URL para verificar tanto el visor servido por la API como el
paquete estatico publicado. Los selectores usan `data-uri`, no clases: una
clase cambia cuando alguien ajusta el diseño y la comprobacion fallaria por
algo que no es un fallo.
"""

from __future__ import annotations

import asyncio
import os
import sys

from playwright.async_api import async_playwright

CHROMIUM = os.environ.get("URI_CHROMIUM", "/opt/pw-browsers/chromium")

#: La barra de capas del diseño: cinco maneras de mirar el mismo lugar.
LAYERS = ("territorio", "dano", "poblacion", "espacio", "equipamientos")

#: Fuentes retiradas. No pueden quedar anunciadas: un credito a quien no aporto
#: dato es una mentira pequeña (ADR-18).
RETIRED = ("SERTIT", "SGC", "Servicio Geologico", "Servicio Geológico")

#: Sitios de prueba con propiedades conocidas en los datos publicados.
COROCITO = "site_0028"  # barrio con 3 sitios; captacion degenerada (1.680 m²)
EXCLUDED = "site_0009"  # excluido por area minima: sin hipotesis que comparar

ARGS = [
    "--disable-features=Translate,OptimizationHints,AutofillServerCommunication",
    "--disable-background-networking",
    "--no-first-run",
]


async def text(page, selector: str) -> str:
    return " ".join((await page.locator(selector).first.inner_text()).split())


async def main(base: str, prefix: str) -> int:
    base = base.split("#")[0]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path=CHROMIUM, args=ARGS)
        page = await browser.new_page(viewport={"width": 1536, "height": 1000})
        errors: list[str] = []
        page.on(
            "console",
            lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None,
        )
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        await page.goto(base, wait_until="domcontentloaded")

        # ── El mapa es la superficie ─────────────────────────────────────
        await page.wait_for_selector('[data-uri="map"] canvas', timeout=45000)
        await page.wait_for_timeout(4000)
        if not await page.evaluate(
            "() => [...document.querySelectorAll('[data-uri=\"map\"] canvas')]"
            ".some(c => c.width > 0)"
        ):
            errors.append("el lienzo del mapa no tiene ancho")

        # Sin cabecera: el mapa ocupa toda la altura y la barra va abajo (ADR-27).
        if await page.locator("header").count():
            errors.append("volvio a aparecer una cabecera: la barra va abajo")
        alto = await page.evaluate(
            "() => [document.querySelector('[data-uri=\"map\"]').getBoundingClientRect().height,"
            " innerHeight]"
        )
        if alto[0] < alto[1] - 1:
            errors.append(f"el mapa no ocupa toda la altura: {alto[0]} de {alto[1]} px")
        barra = await text(page, '[data-uri="toolbar"]')
        print("barra:", barra[:120])
        for needed in ("REBUILD", "Fuentes", "Guardadas", "Ayuda", "Ajustes"):
            if needed not in barra:
                errors.append(f"la barra inferior no ofrece '{needed}'")
        caja = await page.locator('[data-uri="toolbar"]').bounding_box()
        if caja and caja["y"] < alto[1] / 2:
            errors.append("la barra no esta en la parte inferior")

        # La cobertura parcial se dice antes de mirar nada.
        estudio = (await text(page, '[data-uri="study-card"]')).lower()
        print("sector de estudio:", estudio[:120])
        if "cobertura parcial" not in estudio:
            errors.append("la tarjeta del sector no dice que la cobertura es parcial")
        if "115 sitios" not in estudio:
            errors.append("la tarjeta del sector no cuenta los sitios")

        # La procedencia viaja en pantalla y sale de los datos.
        prov = await text(page, '[data-uri="provenance"]')
        print("procedencia:", prov[:160])
        for needed in ("Copernicus", "OpenStreetMap", "datos n.º"):
            if needed.lower() not in prov.lower():
                errors.append(f"la barra de procedencia no nombra '{needed}'")
        for gone in RETIRED:
            if gone.lower() in prov.lower():
                errors.append(f"la procedencia nombra a '{gone}', que no aporta dato")

        # ── Capas: una a la vez, cada una con su leyenda ────────────────
        present = await page.locator('[data-uri="layer"]').count()
        if present != len(LAYERS):
            errors.append(f"hay {present} capas y se esperaban {len(LAYERS)}")
        for key in LAYERS:
            boton = page.locator(f'[data-uri="layer"][data-layer="{key}"]')
            if not await boton.count():
                errors.append(f"falta la capa '{key}'")
                continue
            await boton.click()
            await page.wait_for_timeout(1500)
            if await boton.get_attribute("data-active") != "true":
                errors.append(f"la capa '{key}' no queda activa al elegirla")
            leyenda = (await text(page, '[data-uri="legend"]')).lower()
            esperado = {
                "territorio": "sitio con evidencia",
                "dano": "destruido",
                "poblacion": "estimación",
                "espacio": "espacio público",
                "equipamientos": "equipamiento",
            }[key]
            if esperado not in leyenda:
                errors.append(f"la leyenda de '{key}' no dice '{esperado}'")
            await page.screenshot(path=f"/tmp/{prefix}_capa_{key}.png")
        await page.locator('[data-uri="layer"][data-layer="territorio"]').click()

        # ── Ubicar: buscar un barrio abre su tarjeta ─────────────────────
        # La barra se ensancha y se vuelve buscador (Toolbar Dynamic).
        await page.locator('[data-uri="search-open"]').click()
        await page.get_by_placeholder("Buscar lugar o sitio").fill("corocito")
        await page.wait_for_selector('#search-results [role="option"]', timeout=15000)
        await page.keyboard.press("Enter")
        await page.wait_for_selector('[data-uri="place-card"]', timeout=15000)
        await page.wait_for_timeout(1800)
        tarjeta = await text(page, '[data-uri="place-card"]')
        print("tarjeta:", tarjeta[:200])
        if "Corocito" not in tarjeta:
            errors.append("buscar 'corocito' no abre la tarjeta de Corocito")
        filas = await page.locator('[data-uri="place-card"] [data-uri="place-row"]').count()
        if filas != 4:
            errors.append(f"la tarjeta tiene {filas} filas y el diseño pide 4")
        for needed in (
            "Sin validar en campo",
            "POT sin dato publicable",
            "Ver posibles intervenciones",
        ):
            if needed not in tarjeta:
                errors.append(f"la tarjeta del lugar no dice '{needed}'")
        if "sitio=" not in page.url:
            errors.append("la URL no guarda el sitio seleccionado")
        if not await page.locator('[data-uri="leader"]').count():
            errors.append("no se dibuja la linea entre el pin y la tarjeta")
        await page.screenshot(path=f"/tmp/{prefix}_lugar.png")

        # Una captacion degenerada no se presenta como alcance.
        await page.goto(f"{base}#sitio={COROCITO}", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-uri="place-card"]', timeout=30000)
        await page.wait_for_timeout(1500)
        if "no confiable" not in (await text(page, '[data-uri="place-card"]')).lower():
            errors.append(f"{COROCITO} tiene una captacion de 1.680 m² y la tarjeta no lo advierte")

        # ── Examinar evidencia ───────────────────────────────────────────
        await page.get_by_role("button", name="Examinar evidencia").click()
        await page.wait_for_selector('[data-uri="panel"][data-panel="evidencia"]', timeout=15000)
        await page.wait_for_timeout(1500)
        evid = (await text(page, '[data-uri="panel"][data-panel="evidencia"]')).lower()
        for needed in ("foto-interpretación", "sin validar en campo", "no dice", "copernicus"):
            if needed not in evid:
                errors.append(f"el panel de evidencia no dice '{needed}'")
        if "sintétic" in evid:
            errors.append(
                "el panel de evidencia repite la etiqueta 'sintético', retirada por ADR-17"
            )
        crops = await page.locator('[data-uri="sentinel-crop"]').count()
        print("recortes Sentinel:", crops)
        if crops and crops != 2:
            errors.append("las imagenes antes/despues no van en pareja")
        activa = await page.locator('[data-uri="layer"][data-active="true"]').get_attribute(
            "data-layer"
        )
        if activa != "dano":
            errors.append("abrir la evidencia no enciende la capa de daño")
        await page.screenshot(path=f"/tmp/{prefix}_evidencia.png")

        # ── Explorar el entorno ──────────────────────────────────────────
        await page.get_by_role("button", name="Explorar el entorno").click()
        await page.wait_for_selector('[data-uri="panel"][data-panel="entorno"]', timeout=15000)
        await page.wait_for_timeout(2000)
        entorno = (await text(page, '[data-uri="panel"][data-panel="entorno"]')).lower()
        for needed in ("500 m", "sigper", "no prueba"):
            if needed not in entorno:
                errors.append(f"el panel de entorno no dice '{needed}'")
        await page.screenshot(path=f"/tmp/{prefix}_entorno.png")

        # ── Comparar dos hipotesis ───────────────────────────────────────
        await page.get_by_role("button", name="Ver posibles intervenciones").click()
        await page.wait_for_selector(
            '[data-uri="panel"][data-panel="intervenciones"]', timeout=15000
        )
        await page.wait_for_timeout(1000)
        alts = await page.locator('[data-uri="alternative"]').count()
        print("alternativas:", alts)
        if alts != 2:
            errors.append(f"la comparacion muestra {alts} alternativas y deberian ser 2")
        comp = (await text(page, '[data-uri="panel"][data-panel="intervenciones"]')).lower()
        for needed in ("qué falta comprobar", "pendiente de validación", "estimación paramétrica"):
            if needed not in comp:
                errors.append(f"la comparacion no dice '{needed}'")
        falsas = await page.locator(
            '[data-uri="evidence-chip"][data-available="true"]', has_text="Fotos de campo"
        ).count()
        if falsas:
            errors.append("la comparacion anuncia fotos de campo que no existen en esta version")
        await page.screenshot(path=f"/tmp/{prefix}_comparacion.png")
        await page.get_by_role("button", name="Guardar comparación").click()
        await page.wait_for_timeout(400)
        barra = await text(page, '[data-uri="toolbar"]')
        if "Guardadas 1" not in barra and "Guardadas1" not in barra.replace(" ", ""):
            errors.append("guardar la comparacion no se refleja en 'Guardadas'")

        # ── Preparar la verificacion ─────────────────────────────────────
        await page.get_by_role("button", name="Preparar verificación").click()
        await page.wait_for_selector('[data-uri="panel"][data-panel="verificacion"]', timeout=15000)
        await page.wait_for_timeout(1500)
        items = await page.locator('[data-uri="verify-item"]').count()
        print("puntos de verificacion:", items)
        if items < 5:
            errors.append("la lista de verificacion tiene menos de 5 puntos")
        if not await page.locator('[data-uri="verify-item"][data-item="pot"]').count():
            errors.append("la verificacion no incluye la normativa POT")
        await page.locator('[data-uri="verify-item"][data-item="estado"] input').check()
        await page.screenshot(path=f"/tmp/{prefix}_verificacion.png")
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_selector('[data-uri="verify-item"][data-item="estado"]', timeout=30000)
        if not await page.locator(
            '[data-uri="verify-item"][data-item="estado"] input'
        ).is_checked():
            errors.append("el borrador de verificacion no sobrevive a recargar la pagina")

        # Escape cierra el panel y vuelve a la tarjeta del lugar.
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(600)
        if await page.locator('[data-uri="panel"]').count():
            errors.append("Escape no cierra el panel")

        # ── Un sitio excluido no inventa hipotesis ───────────────────────
        await page.goto(
            f"{base}#sitio={EXCLUDED}&panel=intervenciones", wait_until="domcontentloaded"
        )
        await page.wait_for_selector(
            '[data-uri="panel"][data-panel="intervenciones"]', timeout=30000
        )
        await page.wait_for_timeout(1200)
        excl = (await text(page, '[data-uri="panel"][data-panel="intervenciones"]')).lower()
        if "no propone" not in excl or "área" not in excl:
            errors.append(f"{EXCLUDED} esta excluido y la comparacion no lo explica")

        # ── Ajustes: popover que nace de su boton; el tema cambia todo ────
        await page.locator('[data-uri="settings-open"]').click()
        await page.wait_for_selector('[data-uri="settings"]', timeout=10000)
        await page.locator('[data-uri="settings"] [role="radio"]', has_text="Oscuro").click()
        await page.wait_for_timeout(1800)
        tema = await page.evaluate("() => document.documentElement.dataset.theme")
        fondo = await page.evaluate(
            "() => getComputedStyle(document.querySelector('main')).backgroundColor"
        )
        print("tema oscuro:", tema, fondo)
        if tema != "dark":
            errors.append("elegir 'Oscuro' en Ajustes no activa el modo oscuro")
        await page.screenshot(path=f"/tmp/{prefix}_oscuro.png")
        await page.locator('[data-uri="settings"] [role="radio"]', has_text="Claro").click()
        await page.wait_for_timeout(600)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(400)

        # Fuentes: dialogo que nace de su boton y nombra lo que no se publica.
        await page.get_by_role("button", name="Fuentes y licencias").click()
        await page.wait_for_selector('[role="dialog"]', timeout=10000)
        await page.wait_for_timeout(700)
        fuentes = (await text(page, '[role="dialog"]')).lower()
        for needed in ("en uso", "sin publicar", "ide amco"):
            if needed not in fuentes:
                errors.append(f"el dialogo de fuentes no dice '{needed}'")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(600)

        # ── Movil: tarjeta abajo, sin desborde lateral ───────────────────
        movil = await browser.new_page(viewport={"width": 390, "height": 844})
        movil.on("pageerror", lambda e: errors.append(f"pageerror (movil): {e}"))
        await movil.goto(f"{base}#sitio={COROCITO}", wait_until="domcontentloaded")
        await movil.wait_for_selector('[data-uri="place-card"]', timeout=30000)
        await movil.wait_for_timeout(2500)
        ancho = await movil.evaluate("() => [document.documentElement.scrollWidth, innerWidth]")
        if ancho[0] > ancho[1]:
            errors.append(f"en movil la pagina desborda: {ancho[0]} px sobre {ancho[1]}")
        await movil.screenshot(path=f"/tmp/{prefix}_movil.png")

        print("errores:", errors or "ninguno")
        await browser.close()
        return 1 if errors else 0


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8099/"
    name = sys.argv[2] if len(sys.argv) > 2 else "ui"
    sys.exit(asyncio.run(main(url, name)))
