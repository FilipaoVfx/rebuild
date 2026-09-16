"""DANE — Censo Nacional de Población y Vivienda 2018, agregado por manzana.

La primera fuente del proyecto que **mide** población en vez de repartirla.
Hasta ahora el 67,2 % del score colgaba de un total de 190.000 personas
repartido uniformemente sobre huellas de edificio; esto lo sustituye por
2.348 conteos con geometría propia.

Licencia auditada (`db/terms/dane_censo2018_manzanas_20260916.txt`): esquema
Open Data de la Ley 1712 de 2014, `ATTRIBUTION`, redistribuible, sin
restricción comercial y sin share-alike.

**El proveedor es el DANE, no Esri.** Es la trampa del SGC al revés: allí un
agregador escondía a su proveedor. Aquí la vía de acceso es Esri Colombia y el
productor es el DANE, así que la fuente se registra a nombre del DANE y la vía
queda anotada. La licencia además prohíbe presentar a Esri Colombia como
partícipe o patrocinadora.

**Esto no es microdato.** Son conteos por manzana (CON-04, `FR-PII-01`). Pero
`FR-PII-03` exige umbral con marcador, y el riesgo aquí es real y medido: en el
AOI hay 64 manzanas de menos de 20 personas donde alguien tiene condición
física registrada. Una de 15 habitantes con un caso señala a una persona
concreta.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

SOURCE_ID = "dane_censo_2018"

SEED = (
    Path(__file__).resolve().parents[4] / "db" / "seed" / "dane_censo2018_manzanas_pereira.json.gz"
)

#: Umbral de supresión (`FR-PII-03`). Por debajo de esto no se publican los
#: atributos que permitirían reidentificar; la población sí, porque un conteo
#: de personas no identifica a nadie y el cruce de atributos sí.
PII_THRESHOLD = 20

#: Estrato socioeconómico colombiano: 1 el más bajo, 6 el más alto. Se invierte
#: para que la escala apunte en la misma dirección que el resto (más alto =
#: más vulnerable).
STRATUM_MAX = 6


def vulnerability(props: dict) -> float | None:
    """Compuesto de vulnerabilidad social, DECLARADO y no validado.

    Media de cuatro indicadores normalizados a 0-1, cada uno apuntando en la
    dirección de mayor vulnerabilidad:

    - estrato invertido — el proxy socioeconómico estándar en Colombia
    - tasa de analfabetismo
    - proporción de mayores de 70
    - proporción con condición física declarada

    Los pesos son iguales **por decisión explícita**, igual que los pesos del
    score: no es un índice oficial del DANE ni está validado contra nada. Lo
    que lo separa del 0,5 inventado que hubo antes no es que sea correcto, es
    que cada término se puede rastrear hasta un conteo del censo y el método
    está escrito aquí en vez de vivir en la cabeza de quien lo programó.

    Devuelve `None` cuando no hay población: una manzana vacía no tiene
    vulnerabilidad cero, no tiene vulnerabilidad.
    """
    total = props.get("SEXO_TOTAL") or 0
    if total <= 0:
        return None

    terminos: list[float] = []

    estrato = props.get("ESTRATO_PREDOMINANTE")
    if estrato:
        terminos.append((STRATUM_MAX - float(estrato)) / (STRATUM_MAX - 1))

    for campo in ("ALFABETA_NO", "TOTAL_MAYORES_70", "CONDICION_FISICA_SI"):
        valor = props.get(campo)
        if valor is not None:
            terminos.append(min(1.0, float(valor) / total))

    if not terminos:
        return None
    return round(sum(terminos) / len(terminos), 6)


def load_blocks(path: Path | None = None) -> list[dict]:
    """Manzanas del extracto archivado, con la supresión ya aplicada.

    La supresión se hace AQUÍ y no en la consulta de publicación: si el dato
    sensible entra a la base, cualquier consulta nueva puede sacarlo. La base
    ademas lo exige con un `CHECK`, que es el cinturón del tirante.
    """
    origen = path or SEED
    with gzip.open(origen, "rt", encoding="utf-8") as f:
        datos = json.load(f)

    manzanas = []
    for rasgo in datos.get("features", []):
        props = rasgo.get("properties") or {}
        geom = rasgo.get("geometry")
        if not geom:
            continue
        poblacion = int(props.get("SEXO_TOTAL") or 0)
        suprimida = poblacion < PII_THRESHOLD

        manzanas.append(
            {
                "block_id": props.get("ID_UNIFICADO_MANZANA"),
                "municipality": props.get("MPIO"),
                "geometry": json.dumps(geom),
                "population": poblacion,
                "illiterate": None if suprimida else props.get("ALFABETA_NO"),
                "over_70": None if suprimida else props.get("TOTAL_MAYORES_70"),
                "disabled": None if suprimida else props.get("CONDICION_FISICA_SI"),
                "no_education": None if suprimida else props.get("NIVEL_EDUC_NINGUNO"),
                "stratum": None if suprimida else props.get("ESTRATO_PREDOMINANTE"),
                "vulnerability": None if suprimida else vulnerability(props),
                "pii_suppressed": suprimida,
            }
        )
    return manzanas
