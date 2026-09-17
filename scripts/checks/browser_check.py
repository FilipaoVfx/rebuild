#!/usr/bin/env python3
"""Verificacion del visor en un navegador real.

El validador de paleta comprueba color, no geometria, y las pruebas de Python
no abren una pagina. Esto ejerce el flujo completo y captura pantallas para
poder mirarlas.

Acepta una URL para poder verificar tanto el visor servido por la API como el
paquete estatico publicado.

Los selectores usan `data-uri`, no clases de Tailwind: una clase cambia cuando
alguien ajusta el diseño y la comprobacion empezaria a fallar por algo que no
es un fallo.
"""

from __future__ import annotations

import asyncio
import sys

from playwright.async_api import async_playwright

CHROMIUM = "/opt/pw-browsers/chromium"

#: Contextos del mapa (ADR-20, ADR-21). Sin "riesgo": la capa del SGC se retiro
#: por licencia (ADR-18) y un contexto que no enciende nada es una promesa vacia.
CONTEXTS = ("SITUACION", "DANO", "NECESIDAD", "DEFICIT", "ACCESO", "OPORTUNIDADES")

#: Fuentes retiradas. No pueden quedar anunciadas en ningun sitio: un credito a
#: quien no aporto dato y un control que no enciende nada son la misma clase de
#: mentira pequeña.
RETIRED = ("SERTIT", "SGC", "Servicio Geologico", "Servicio Geológico")

VIEWS = ("situacion", "oportunidades", "escenarios", "portafolio", "evidencia")


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
        await page.wait_for_selector('[data-uri="map"] canvas', timeout=45000)
        await page.wait_for_timeout(6000)
        drew = await page.evaluate(
            "() => { const c = document.querySelector('[data-uri=\"map\"] canvas');"
            " return !!c && c.width > 0; }"
        )
        if not drew:
            errors.append("el lienzo del mapa no tiene ancho")

        # La procedencia viaja en el cromo, no en una pestaña (ADR-21).
        prov = await page.locator('[data-uri="provenance"]').inner_text()
        for needed in ("Copernicus", "data v"):
            if needed.lower() not in prov.lower():
                errors.append(f"la barra de procedencia no nombra '{needed}'")
        print("procedencia:", " ".join(prov.split())[:160])

        await page.screenshot(path=f"/tmp/{prefix}_situacion.png")

        # ── Contextos ────────────────────────────────────────────────────
        #
        # Uno a la vez y partiendo de todo apagado. Se recorren todos porque un
        # contexto que no pinta nada solo se nota mirandolo.
        present = await page.locator('[data-uri="context"]').count()
        if present != len(CONTEXTS):
            errors.append(f"hay {present} contextos y se esperaban {len(CONTEXTS)}")

        for key in CONTEXTS:
            boton = page.locator(f'[data-uri="context"][data-context="{key}"]')
            if not await boton.count():
                errors.append(f"falta el contexto '{key}'")
                continue
            await boton.click()
            await page.wait_for_timeout(2500)
            leyenda = await page.locator('[data-uri="legend"]').inner_text()
            if not leyenda.strip():
                errors.append(f"el contexto '{key}' no describe su leyenda")
        await page.screenshot(path=f"/tmp/{prefix}_contextos.png")

        # Un eje cubierto puede no ordenar nada, y el visor tiene que decirlo
        # (ADR-21, regla 3). `pedestrian_accessibility` vale 1,0 en 112 de 115
        # sitios: si esta advertencia desaparece, el color empezo a mentir.
        await page.locator('[data-uri="context"][data-context="ACCESO"]').click()
        await page.wait_for_timeout(2000)
        aviso = page.locator('[data-uri="flat-axis"]')
        if await aviso.count():
            print("aviso de eje plano:", " ".join((await aviso.inner_text()).split())[:120])
        else:
            errors.append(
                "el contexto ACCESO no advierte que el eje no ordena, "
                "y en el AOI actual no discrimina"
            )

        # Ninguna fuente retirada puede quedar anunciada en la atribucion.
        atribucion = await page.locator('[data-uri="attribution"]').inner_text()
        for gone in RETIRED:
            if gone.lower() in atribucion.lower():
                errors.append(f"la atribucion nombra a '{gone}', que no aporta dato")
        print("atribucion:", atribucion.strip()[:160])

        # ── Oportunidad: de la lista al detalle y a la descomposicion ────
        await page.locator('[data-uri="nav"][data-view="oportunidades"]').click()
        await page.wait_for_selector('[data-uri="opportunity-card"]', timeout=30000)
        tarjetas = await page.locator('[data-uri="opportunity-card"]').count()
        print("tarjetas de oportunidad:", tarjetas)
        if not tarjetas:
            errors.append("no se listo ninguna oportunidad")

        # Una barra de 0 px no rompe nada y no se ve: hay que comprobarla.
        barras = await page.evaluate(
            """() => {
                const fills = [...document.querySelectorAll('[data-uri="bar-fill"]')];
                return {
                    n: fills.length,
                    widths: fills.slice(0, 8).map(e => +e.getBoundingClientRect().width.toFixed(1)),
                };
            }"""
        )
        print("barras inline:", barras)
        if barras["n"] and not any(w > 0 for w in barras["widths"]):
            errors.append("las barras inline se renderizan con ancho 0")

        await page.locator('[data-uri="opportunity-card"]').first.click()
        await page.wait_for_selector('[data-uri="detail"]', timeout=30000)

        # El titular explica; el puntaje solo ordena (ADR-20, regla 3).
        # Se compara en minusculas: `innerText` aplica `text-transform`, asi que
        # los titulos de seccion llegan en mayusculas.
        detalle = (await page.locator('[data-uri="detail"]').inner_text()).lower()
        for needed in ("problema", "viabilidad", "impacto", "evidencia"):
            if needed not in detalle:
                errors.append(f"la ficha no muestra la seccion '{needed}'")
        # Las incognitas se cuentan, no se esconden.
        if "sin fuente" not in detalle:
            errors.append("la ficha no declara ninguna condicion sin fuente")
        await page.screenshot(path=f"/tmp/{prefix}_detalle.png")

        await page.locator('[data-uri="technical-toggle"]').click()
        await page.wait_for_selector('[data-uri="decomposition"]', timeout=30000)
        filas = await page.locator('[data-uri="decomposition"] tbody tr').count()
        print("filas de la descomposicion:", filas)
        if filas < 2:
            errors.append("la descomposicion exacta no tiene filas")
        await page.screenshot(path=f"/tmp/{prefix}_tecnica.png")

        # La camara sigue al sitio seleccionado: exploracion progresiva.
        centro_sitio = await page.evaluate("() => window.__uriCenter && window.__uriCenter()")
        await page.locator('[data-uri="detail"] button:has-text("✕")').first.click()
        await page.wait_for_timeout(2000)
        centro_aoi = await page.evaluate("() => window.__uriCenter && window.__uriCenter()")
        if centro_sitio and centro_aoi and centro_sitio == centro_aoi:
            errors.append("la camara no volvio al AOI al cerrar la ficha")
        print("la camara se movio al seleccionar:", centro_sitio != centro_aoi)

        # ── Escenarios y portafolio ──────────────────────────────────────
        await page.locator('[data-uri="nav"][data-view="escenarios"]').click()
        await page.wait_for_timeout(1500)
        escenarios = await page.locator("main, div").first.inner_text()
        del escenarios
        await page.screenshot(path=f"/tmp/{prefix}_escenarios.png")

        await page.locator('[data-uri="nav"][data-view="portafolio"]').click()
        await page.wait_for_selector('[data-uri="portfolio-items"] li', timeout=60000)
        proyectos = await page.locator('[data-uri="portfolio-items"] li').count()
        print("proyectos del portafolio:", proyectos)
        if not proyectos:
            errors.append("el portafolio no listo proyectos")

        # ── Quién queda fuera ────────────────────────────────────────────
        #
        # La contracara de la cifra de cobertura. Si esta lista desaparece, el
        # visor vuelve a contar solo a quien alcanza, que es la mitad que
        # favorece al portafolio.
        huecos = await page.locator('[data-uri="unreached-cluster"]').count()
        print("huecos de cobertura listados:", huecos)
        if not huecos:
            errors.append("el portafolio no lista la poblacion que no alcanza")
        else:
            primero = await page.locator('[data-uri="unreached-cluster"]').first.inner_text()
            if "personas sin alcanzar" not in primero.lower():
                errors.append("un hueco no reporta la poblacion que deja fuera")
            # Un hueco tiene que decir si algun candidato lo alcanzaria: es lo
            # que distingue un limite de presupuesto de uno de generacion de
            # sitios, y son problemas con dueños distintos.
            if "candidato" not in primero.lower():
                errors.append("un hueco no dice si algun candidato lo alcanzaria")
            await page.locator('[data-uri="unreached-cluster"]').first.click()
            await page.wait_for_timeout(1500)

        # Relieve 3D: deck.gl dibuja en su propio lienzo sobre el de MapLibre.
        relieve = page.locator('[data-uri="layer-toggle"]').first
        await relieve.click()
        await page.wait_for_timeout(4000)
        lienzos = await page.evaluate(
            "() => document.querySelectorAll('[data-uri=\"map\"] canvas').length"
        )
        print("lienzos tras activar el relieve:", lienzos)
        if lienzos < 2:
            errors.append("deck.gl no anadio su lienzo al mapa")
        await page.screenshot(path=f"/tmp/{prefix}_portafolio.png")

        # ── Evidencia ────────────────────────────────────────────────────
        await page.locator('[data-uri="nav"][data-view="evidencia"]').click()
        await page.wait_for_timeout(1500)
        evidencia = await page.locator('[data-uri="nav"][data-view="evidencia"]').evaluate(
            "() => document.body.innerText"
        )
        # La prohibicion de datos sinteticos y la puerta de licencia son las dos
        # cosas que esta vista existe para decir (ADR-17, fuentes.md §6).
        for needed in ("sintética", "licencia"):
            if needed.lower() not in evidencia.lower():
                errors.append(f"la vista de evidencia no menciona '{needed}'")
        await page.screenshot(path=f"/tmp/{prefix}_evidencia.png")

        # Las cinco vistas cargan sin error.
        for view in VIEWS:
            await page.locator(f'[data-uri="nav"][data-view="{view}"]').click()
            await page.wait_for_timeout(900)

        print("errores de consola:", errors or "ninguno")
        await browser.close()
        return 1 if errors else 0


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8099/"
    name = sys.argv[2] if len(sys.argv) > 2 else "ui"
    sys.exit(asyncio.run(main(url, name)))
