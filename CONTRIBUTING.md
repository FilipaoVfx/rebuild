# Desarrollo

## Arranque

Requiere PostgreSQL 16 con PostGIS y pgRouting. En local:

```bash
./scripts/dev_db.sh                    # levanta la base en el puerto 5433
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env
export PYTHONPATH=src

.venv/bin/python scripts/migrate.py --reset
.venv/bin/python scripts/run_pipeline.py      # ingesta -> features -> score -> portafolio
./scripts/serve.sh                            # API + visor en http://127.0.0.1:8099
```

El pipeline completo tarda ~12 s sobre el dataset de referencia de Pereira.

## Datos

**El contexto urbano de OSM está versionado** en `db/seed/osm_pereira.json.gz`
y el pipeline lo usa por defecto. Es deliberado: OSM no versiona aguas arriba,
así que el extracto archivado es lo único que permite reconstruir una
`data_version` (`fuentes.md` §11, regla 3). También evita que cada ejecución
dependa de que Overpass esté en pie.

**Todas las fuentes están versionadas** en `db/seed/`: daño de Copernicus EMS,
huellas de Microsoft, uso de suelo y red de OSM, estaciones de Megabús. El
pipeline corre sin descargar nada. El extracto del SGC se borró: archivarlo
en un repositorio público era redistribuirlo (ADR-18).

```bash
.venv/bin/python scripts/run_pipeline.py
```

**No se admiten datos sintéticos.** El generador está retirado y la migración
006 lo impone con un `CHECK` en la base: una fila con `is_synthetic = true` en
una capa de contexto falla al insertarse.

## Los esquemas van prefijados

Cuatro esquemas, todos con prefijo `rebuild_`:

```
rebuild_core          dominio: fuentes, evidencia, sitios, escenarios
rebuild_analytics     derivado: features, catchments, exclusiones
rebuild_osm_raw       OSM crudo        ─┐ aislados por el share-alike
rebuild_osm_derived   grafo peatonal   ─┘ de ODbL (fuentes.md §8)
```

El prefijo no es decorativo: la base de producción es **compartida con otro
producto**, que vive entero en `public`. Sin él, `core` y `analytics` son
nombres lo bastante genéricos como para que alguien los reclame algún día.

Nada usa `public`, así que la separación es total y se ve en el desplegable de
esquemas de cualquier cliente SQL.

## Comprobaciones

```bash
.venv/bin/ruff check src tests scripts && .venv/bin/ruff format --check src tests scripts
.venv/bin/lint-imports                       # fronteras de ADR-01
.venv/bin/python -m pytest -q                # 123 con pipeline, 112 + 11 saltadas sin él
.venv/bin/python scripts/checks/browser_check.py   # el visor, en un navegador real
.venv/bin/python scripts/checks/signal_check.py    # ¿señal o ruido? cinco mediciones
```

`signal_check.py` es el semáforo del proyecto. La prueba 4 comprueba que no
queda ninguna capa simulada en el resultado. La prueba 5 mide dos cosas por
feature: **cobertura** y **valores distintos**. La segunda columna es la que
importa — una feature presente en el 100 % de los sitios con un solo valor
está poblada y no ordena nada. Hoy `land_use` sale así.

## Escenas Sentinel (opcional)

### En CI: secretos de GitHub

El camino de producción. `.github/workflows/sentinel.yml` corre el pipeline
contra la base persistente con tres secretos de repositorio:

| Secreto | Qué es |
|---|---|
| `CDSE_CLIENT_ID` | Cliente OAuth de CDSE |
| `CDSE_CLIENT_SECRET` | Su secreto (se muestra una sola vez) |
| `URI_DATABASE_URL` | **Session pooler** de Supabase, puerto 5432 |

Ojo con el último: tiene que ser el *session pooler*
(`aws-<region>.pooler.supabase.com:5432`), **no** la conexión directa. Las
conexiones directas de Supabase son IPv6 en el plan Free y los runners de
GitHub Actions son IPv4 — la propia documentación de Supabase lista GitHub
Actions entre las plataformas que solo aceptan IPv4. Y tampoco el puerto 6543
(modo transacción): no admite prepared statements, y psycopg3 los usa.

El workflow es manual y arranca con `dry_run` activado, que cataloga y elige
sin gastar cuota de proceso.

### En local: `.env`

Las credenciales van en `.env` (ignorado por git) o en el entorno. Las dos
formas funcionan; `cp .env.example .env` y rellena:

```bash
CDSE_CLIENT_ID=...
CDSE_CLIENT_SECRET=...
```

Se crean en `dataspace.copernicus.eu` → Dashboard → **User Settings → OAuth
clients → Create**. El secreto se muestra **una sola vez**.

```bash
.venv/bin/python scripts/fetch_sentinel.py --dry-run   # cataloga y elige, sin descargar
.venv/bin/python scripts/fetch_sentinel.py             # recorta el AOI a data/sentinel/
```

El script pide el token **antes** de empezar, así que una credencial ausente o
mal pegada sale con código 2 y un mensaje, no con un traceback a mitad del
catálogo. Nunca en el visor ni en un archivo versionado. Los `.tif` no se versionan: `core.satellite_scene` guarda `scene_id` y
`request_parameters` completos, que es lo que permite reconstruirlos.

## Paquete estático (GitHub Pages)

```bash
.venv/bin/python scripts/build_static.py   # vuelca dist/
(cd dist && python3 -m http.server 8100)
.venv/bin/python scripts/checks/browser_check.py http://127.0.0.1:8100/ static
```

Los escenarios van precalculados a presupuestos fijos y los exportes no se
publican: la puerta de licencia por perfil es lógica de servidor, y servirla
como descarga estática la eliminaría.

### Primer despliegue a GitHub Pages

Hay **un paso manual que no se puede automatizar**: Settings → Pages →
Source: **GitHub Actions**.

Crear un sitio de Pages por API exige permisos de administrador del
repositorio, y el `GITHUB_TOKEN` de un workflow no los tiene aunque se le
conceda `pages: write` — ese permiso habilita desplegar en un sitio que ya
existe, no crearlo. Intentarlo devuelve
`Resource not accessible by integration`.

Después de ese clic, `Actions → Pages → Run workflow` despliega, y los pushes
a `main` lo hacen solos.

Las pruebas que necesitan PostGIS se saltan solas si no hay base, en vez de
fallar con un error de conexión que no dice nada.

## Reglas que el código impone, no solo documenta

| Regla | Dónde se impone |
|---|---|
| Las restricciones duras preceden al scoring (`FR-CONS-01`) | `evaluate_constraints` produce el conjunto de candidatos; `score_site` solo recibe ese conjunto |
| Las versiones de dataset son inmutables (`FR-ING-02`) | Trigger en `core.dataset_version` |
| El log de auditoría no se edita (`FR-AUDIT-01`) | Trigger en `core.audit_log` |
| Cero PII en el esquema analítico (`FR-PII-02`) | `prohibited_columns` + escaneo de `information_schema` en CI |
| Una fuente `UNCLEAR` no alimenta nada | `assert_source_usable` + `CHECK` en `source_register` |
| Un export comercial no incluye fuentes no comerciales | Puerta de perfil en `/api/v1/exports` |
| Las fronteras entre módulos (ADR-01) | `lint-imports` en CI |
| La descomposición del score suma el score (`FR-REC-02`) | `Explanation.sums_to_score`, verificado con property-based testing |

## Lo que NO se debe hacer

**No ajustar los pesos del modelo mirando el ranking.** El riesgo cambió de
forma pero no desapareció: ya no hay generador que aprender, pero el 67,2 %
del score proviene de un reparto dasimétrico que asume densidad uniforme por
área construida. Afinar los pesos hasta que el orden "se vea bien" enseña al
sistema ese supuesto, no el territorio. Los pesos se fijan por elicitación y
se congelan con versión. Ver `docs/plan/antes-de-empezar.md` §5 y
`docs/plan/estado-actual.md` §2.

**No rellenar una feature ausente con un valor por defecto.** `vulnerability`
es nula en los 115 sitios y `land_use_compatibility` en 114: se declaran no
disponibles y la restricción se salta. Un `COALESCE(..., 0)` convertiría
"no lo sé" en "medí cero", que es lo que excluyó los 115 sitios antes de que
se corrigiera.
