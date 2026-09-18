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
import os
import sys

from playwright.async_api import async_playwright

CHROMIUM = os.environ.get("URI_CHROMIUM", "/opt/pw-browsers/chromium")

#: Contextos del mapa (ADR-20, ADR-21, ADR-22). Sin "riesgo": la capa del SGC
#: se retiro por licencia (ADR-18) y un contexto que no enciende nada es una
#: promesa vacia. TERRITORIO es orientacion: nombres, sin coropleta.
CONTEXTS = (
    "TERRITORIO",
    "SITUACION",
    "DANO",
    "NECESIDAD",
    "DEFICIT",
    "ACCESO",
    "OPORTUNIDADES",
)

#: Fuentes retiradas. No pueden quedar anunciadas en ningun sitio: un credito a
#: quien no aporto dato y un control que no enciende nada son la misma clase de
#: mentira pequeña.
RETIRED = ("SERTIT", "SGC", "Servicio Geologico", "Servicio Geológico")

VIEWS = ("territorio", "situacion", "oportunidades", "escenarios", "portafolio", "evidencia")


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
        for needed in ("Copernicus", "OpenStreetMap", "data v"):
            if needed.lower() not in prov.lower():
                errors.append(f"la barra de procedencia no nombra '{needed}'")
        print("procedencia:", " ".join(prov.split())[:160])

        # ── Territorio: donde estamos, antes de que pasa (ADR-22) ────────
        #
        # La vista por defecto situa: ciudad, evento, comunas, imagen. Si el
        # visor vuelve a abrir en un panel de cifras, el lugar se perdio.
        activa = await page.locator('[data-uri="nav"][data-active="true"]').get_attribute(
            "data-view"
        )
        if activa != "territorio":
            errors.append(f"la vista por defecto es '{activa}', no 'territorio'")
        ciudad = await page.locator('[data-uri="city-line"]').inner_text()
        if "pereira" not in ciudad.lower():
            errors.append("el cromo no dice en que ciudad estamos")
        if not await page.locator('[data-uri="locator"] svg').count():
            errors.append("el localizador (Colombia > Risaralda > Pereira) no se dibujo")
        etiquetas = await page.evaluate("() => window.__uriLabels && window.__uriLabels()")
        print("etiquetas:", etiquetas)
        if not etiquetas or not etiquetas.get("comunas"):
            errors.append("el mapa no etiqueta ninguna comuna")
        if not etiquetas or not etiquetas.get("landmarks"):
            errors.append("el mapa no etiqueta ningun hito")
        comunas = await page.locator('[data-uri="comuna"]').count()
        print("comunas listadas:", comunas)
        if not comunas:
            errors.append("Territorio no lista comunas")
        else:
            antes = await page.evaluate("() => window.__uriCenter && window.__uriCenter()")
            await page.locator('[data-uri="comuna"]').first.click()
            await page.wait_for_timeout(2000)
            despues = await page.evaluate("() => window.__uriCenter && window.__uriCenter()")
            if antes == despues:
                errors.append("elegir una comuna no encuadra el mapa")
            await page.locator('[data-uri="comuna"]').first.click()
            await page.wait_for_timeout(1200)
        await page.screenshot(path=f"/tmp/{prefix}_territorio.png")

        # La imagen nunca va sola: fecha, razon y limitacion al lado (ADR-19).
        sentinel = page.locator('[data-uri="imagery-toggle"]').first
        if await sentinel.locator("input").is_enabled():
            await sentinel.click()
            await page.wait_for_timeout(3500)
            if not await page.locator('[data-uri="swipe"]').count():
                errors.append("la cortina Sentinel no aparece al activar la imagen")
            leyenda_img = (
                await page.locator('[data-uri="imagery-caption"]').first.inner_text()
            ).lower()
            for needed in ("sentinel", "no dano", "2026"):
                if needed not in leyenda_img.replace("ñ", "n"):
                    errors.append(f"la leyenda de la imagen no dice '{needed}'")
            await page.screenshot(path=f"/tmp/{prefix}_sentinel.png")
            await sentinel.click()
            await page.wait_for_timeout(800)
        else:
            print("sin vistas Sentinel versionadas en este despliegue: se omite la cortina")

        # Las ortofotos sin licencia verificada aparecen, deshabilitadas y con
        # la razon: un control que desaparece es una fuente que nadie audita.
        ortos = page.locator('[data-uri="imagery-toggle"]', has_text="Ortofoto")
        for i in range(await ortos.count()):
            toggle = ortos.nth(i)
            if await toggle.locator("input").is_enabled():
                continue
            texto = (await toggle.inner_text()).lower()
            if "no se publica" not in texto:
                errors.append("una ortofoto deshabilitada no dice por que")

        # Tipo de mapa (ADR-22 §8): la cartografia base de OSM servida por
        # nosotros es la vista por defecto; el mapa de solo datos sigue ahi.
        tipos = await page.locator('[data-uri="basemap"]').count()
        if tipos != 3:
            errors.append(f"hay {tipos} tipos de mapa y se esperaban 3")
        base = await page.locator('[data-uri="basemap"][data-active="true"]').get_attribute(
            "data-basemap"
        )
        print("tipo de mapa por defecto:", base)
        if base not in ("calles", "datos"):
            errors.append(f"tipo de mapa por defecto inesperado: {base}")
        await page.locator('[data-uri="basemap"][data-basemap="datos"]').click()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"/tmp/{prefix}_datos.png")
        await page.locator('[data-uri="basemap"][data-basemap="calles"]').click()
        await page.wait_for_timeout(2500)

        await page.locator('[data-uri="territory-cta"]').click()
        await page.wait_for_timeout(1500)
        activa = await page.locator('[data-uri="nav"][data-active="true"]').get_attribute(
            "data-view"
        )
        if activa != "situacion":
            errors.append("el enlace de Territorio no lleva a Situacion")
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
        # La vista explica el metodo antes de listar resultados (ADR-22 §9), y
        # lo dice como lo que es: multicriterio explicable, no aprendizaje
        # automatico ni prediccion.
        metodo = (await page.locator('[data-uri="method"]').inner_text()).lower()
        for needed in ("multicriterio", "restricciones", "pesos", "no hay aprendizaje"):
            if needed not in metodo:
                errors.append(f"el panel de metodo no dice '{needed}'")
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

        # Cada tarjeta dice donde, antes de que (ADR-22).
        lugar_tarjeta = (await page.locator('[data-uri="card-place"]').first.inner_text()).lower()
        if not any(k in lugar_tarjeta for k in ("barrio", "comuna", "sin fuente")):
            errors.append("la tarjeta de oportunidad no dice en que barrio o comuna esta")

        await page.locator('[data-uri="opportunity-card"]').first.click()
        await page.wait_for_selector('[data-uri="detail"]', timeout=30000)

        # La ficha abre con el lugar: barrio, comuna, esquina, hito — o "sin fuente".
        lugar = (await page.locator('[data-uri="place-line"]').inner_text()).lower()
        print("lugar de la ficha:", " ".join(lugar.split())[:120])
        if not any(k in lugar for k in ("barrio", "comuna", "sin fuente")):
            errors.append("la ficha no abre con el lugar del sitio")
        migas = (await page.locator('[data-uri="breadcrumb"]').inner_text()).lower()
        if "pereira" not in migas or "comuna" not in migas:
            errors.append("las migas no leen Pereira > Comuna > Barrio > sitio")

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

        # Las seis vistas cargan sin error.
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
