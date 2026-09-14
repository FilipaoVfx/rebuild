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

`data/raw/` no está versionado. Para poblarlo:

```bash
curl -o data/raw/sertit_damage.geojson https://datosdelterremoto.org/data/public/sertit_damage.geojson
curl -o data/raw/unosat_damage.geojson https://datosdelterremoto.org/data/public/unosat_damage.geojson
# Contexto urbano OSM del AOI (ver docs/plan/conexiones.md §7)
curl -X POST --data-urlencode "data@db/seed/pereira.overpass" \
  https://overpass-api.de/api/interpreter -o data/raw/osm_pereira.json
```

## Comprobaciones

```bash
.venv/bin/ruff check src tests scripts && .venv/bin/ruff format --check src tests scripts
.venv/bin/lint-imports                       # fronteras de ADR-01
.venv/bin/python -m pytest -q                # 98 pruebas
.venv/bin/python scripts/checks/browser_check.py   # el visor, en un navegador real
.venv/bin/python scripts/checks/signal_check.py    # ¿señal o ruido? cinco mediciones
```

`signal_check.py` es el semáforo del proyecto. Su prueba 4 regenera las capas
simuladas con otra semilla y recalcula todo: si el top-20 cambia, el ranking
describe el generador y no el territorio. Hoy conserva 3 de 20.

## Paquete estático (GitHub Pages)

```bash
.venv/bin/python scripts/build_static.py   # vuelca dist/
(cd dist && python3 -m http.server 8100)
.venv/bin/python scripts/checks/browser_check.py http://127.0.0.1:8100/ static
```

Los escenarios van precalculados a presupuestos fijos y los exportes no se
publican: la puerta de licencia por perfil es lógica de servidor, y servirla
como descarga estática la eliminaría.

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

**No ajustar los pesos del modelo mirando resultados calculados sobre capas
sintéticas.** Las capas de población, riesgo y uso de suelo son generadas; si
los pesos se afinan contra ellas, el sistema aprende el generador y no el
territorio. Ver `docs/plan/antes-de-empezar.md` §5.
