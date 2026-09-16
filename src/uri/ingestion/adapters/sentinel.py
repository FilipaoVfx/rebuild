"""Cliente de Copernicus Data Space Ecosystem — Sentinel-1 GRD y Sentinel-2 L2A.

Primera fase del pipeline de evidencia de cambio: catalogar escenas pre/post
del sismo y recortar el AOI. **Nada de lo que produce este módulo es daño.**

Un cambio de retrodispersión o de NDVI entre dos fechas es un cambio observado
en la señal. Un edificio demolido, una obra nueva, un cultivo cosechado, un
suelo mojado y un techo repintado producen cambios comparables. Por eso lo que
sale de aquí alimentará `change_score` y, más adelante, `DAMAGE_EVIDENCE` —
nunca `CONFIRMED_DAMAGE`, y nunca una columna llamada `damage_score`.

Licencia (verificada 2026-09-15, `fuentes.md` §10): el aviso legal de
Copernicus concede «free, full and open access» con reproducción,
distribución, comunicación pública y modificación (Reg. UE 1159/2013, art. 7).
Obliga a la nota de atribución del art. 8, que aquí es la forma de dato
modificado porque todo se recorta al AOI.

**Las credenciales no salen del backend.** Se leen del entorno y no se
escriben en la procedencia: `request_parameters` guarda qué se pidió, no con
qué llave.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

SOURCE_ID = "copernicus_sentinel"


def _assert_usable() -> None:
    """Control C1 de `fuentes.md` §6 — una fuente `UNCLEAR` no alimenta nada.

    El import va dentro y no arriba: `loader` importa adaptadores a nivel de
    módulo, así que un import recíproco arriba dejaría un ciclo esperando a
    que alguien añada la línea que lo cierra.
    """
    from uri.ingestion.loader import assert_source_usable

    assert_source_usable(SOURCE_ID)


TOKEN_URL = (
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
)
CATALOG_URL = "https://sh.dataspace.copernicus.eu/catalog/v1/search"
PROCESS_URL = "https://sh.dataspace.copernicus.eu/process/v1"

#: El catálogo habla STAC y negocia el tipo de contenido: sin `geo+json`
#: en el Accept responde 406 sin llegar a leer la consulta.
STAC_ACCEPT = "application/geo+json, application/json;q=0.9"

S1 = "sentinel-1-grd"
S2 = "sentinel-2-l2a"

#: El sismo. Las ventanas se definen alrededor de esta fecha y no al revés.
EVENT_DATE = date(2026, 8, 10)
PRE_WINDOW = (date(2026, 7, 20), date(2026, 8, 9))
POST_WINDOW = (date(2026, 8, 11), date(2026, 9, 1))

#: Bandas priorizadas. S1 son polarizaciones; S2 son las que alimentan NDVI
#: (B08/B04), NDBI (B11/B08), NDWI (B03/B08) y el cambio espectral.
S1_BANDS = ("VV", "VH")
S2_BANDS = ("B02", "B03", "B04", "B08", "B11", "B12")

#: Resolución de salida. 10 m es la nativa de B02/B03/B04/B08; B11 y B12 son
#: de 20 m y el servicio las remuestrea. Pedirlas a 10 m no las mejora, pero
#: mantiene una sola rejilla y evita alinear dos mallas a mano.
RESOLUTION_M = 10


class CdseAuthMissing(RuntimeError):
    """No hay credenciales. Es un fallo de configuración, no de red."""


class CdseError(RuntimeError):
    """El servicio respondió con un error. Lleva el cuerpo, no solo el código."""


@dataclass(frozen=True)
class Scene:
    """Una escena del catálogo, con lo que hace falta para volver a pedirla."""

    scene_id: str
    collection: str
    acquisition: datetime
    bbox: tuple[float, float, float, float]
    geometry: dict
    cloud_cover: float | None = None
    platform: str | None = None
    processing_baseline: str | None = None
    orbit_direction: str | None = None
    relative_orbit: int | None = None
    raw: dict = field(default_factory=dict, repr=False)

    @property
    def is_radar(self) -> bool:
        return self.collection == S1


class CdseClient:
    """OAuth2 client_credentials + catálogo STAC + API de proceso.

    El token se cachea con su expiración: pedir uno nuevo por petición
    funciona, pero multiplica por dos las llamadas y CDSE aplica cuotas.
    """

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        *,
        timeout: int = 120,
    ) -> None:
        self._client_id = client_id or os.environ.get("CDSE_CLIENT_ID")
        self._client_secret = client_secret or os.environ.get("CDSE_CLIENT_SECRET")
        if not self._client_id or not self._client_secret:
            raise CdseAuthMissing(
                "Faltan credenciales de CDSE. Exporta CDSE_CLIENT_ID y "
                "CDSE_CLIENT_SECRET (se crean en dataspace.copernicus.eu, "
                "User Settings → OAuth clients). Nunca en el frontend ni en "
                "un archivo del repositorio: este cliente es de backend."
            )
        self._timeout = timeout
        self._token: str | None = None
        self._expires_at = 0.0

    # ── Auth ────────────────────────────────────────────────────────────
    def _fetch_token(self) -> str:
        body = urllib.parse.urlencode(
            {
                "grant_type": "client_credentials",
                "client_id": self._client_id,
                "client_secret": self._client_secret,
            }
        ).encode()
        request = urllib.request.Request(
            TOKEN_URL,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                payload = json.load(response)
        except urllib.error.HTTPError as exc:  # pragma: no cover - requiere red
            # El cuerpo del error de Keycloak dice si la credencial es inválida
            # o si es otra cosa. Tragárselo deja al operador adivinando.
            detail = exc.read().decode("utf-8", "replace")[:400]
            raise CdseError(f"CDSE rechazo las credenciales ({exc.code}): {detail}") from exc
        self._token = payload["access_token"]
        # Margen de 60 s: un token que caduca a mitad de una descarga larga
        # produce un 401 que parece un problema de permisos.
        self._expires_at = time.monotonic() + float(payload.get("expires_in", 600)) - 60
        return self._token

    def token(self) -> str:
        if self._token is None or time.monotonic() >= self._expires_at:
            return self._fetch_token()
        return self._token

    def _post(self, url: str, payload: dict, *, accept: str) -> bytes:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {self.token()}",
                "Content-Type": "application/json",
                "Accept": accept,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:  # pragma: no cover - requiere red
            detail = exc.read().decode("utf-8", "replace")[:600]
            raise CdseError(f"{url} respondio {exc.code}: {detail}") from exc

    # ── Catálogo ────────────────────────────────────────────────────────
    def search(
        self,
        collection: str,
        bbox: tuple[float, float, float, float],
        window: tuple[date, date],
        *,
        limit: int = 100,
    ) -> list[Scene]:
        """Escenas del catálogo que cubren el AOI en la ventana dada.

        Control C1 de `fuentes.md`: una fuente sin licencia verificada no
        alimenta nada, y eso se comprueba antes de gastar una llamada.
        """
        _assert_usable()
        start, end = window
        payload = {
            "collections": [collection],
            "bbox": list(bbox),
            "datetime": f"{start.isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z",
            "limit": limit,
        }
        # El catálogo es STAC: responde `application/geo+json`. Pedir
        # `application/json` a secas devuelve 406 antes de mirar la consulta.
        body = json.loads(self._post(CATALOG_URL, payload, accept=STAC_ACCEPT))
        return [_scene_from_feature(feature, collection) for feature in body.get("features", [])]

    # ── Proceso ─────────────────────────────────────────────────────────
    def fetch_aoi(
        self,
        scene: Scene,
        bbox: tuple[float, float, float, float],
        *,
        evalscript: str,
        resolution_m: int = RESOLUTION_M,
        image_format: str = "image/tiff",
    ) -> tuple[bytes, dict]:
        """Recorta el AOI de una escena y lo devuelve como GeoTIFF.

        Devuelve también los parámetros exactos de la petición, que son la
        mitad de la procedencia: sin ellos, el GeoTIFF es un archivo del que
        nadie puede decir cómo se produjo.
        """
        _assert_usable()
        width, height = _pixel_size(bbox, resolution_m)
        payload = {
            "input": {
                "bounds": {
                    "bbox": list(bbox),
                    "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
                },
                "data": [
                    {
                        "type": scene.collection,
                        "dataFilter": {
                            # Una sola escena, no un mosaico: mezclar fechas
                            # dentro de una ventana produciría un compuesto del
                            # que no se puede decir qué día se observó.
                            "timeRange": {
                                "from": _instant(scene.acquisition, -1),
                                "to": _instant(scene.acquisition, 1),
                            }
                        },
                    }
                ],
            },
            "output": {
                "width": width,
                "height": height,
                "responses": [{"identifier": "default", "format": {"type": image_format}}],
            },
            "evalscript": evalscript,
        }
        content = self._post(PROCESS_URL, payload, accept=image_format)
        # La procedencia NO lleva credenciales. Guarda qué se pidió.
        request_parameters = {
            "url": PROCESS_URL,
            "bbox": list(bbox),
            "resolution_m": resolution_m,
            "width": width,
            "height": height,
            "collection": scene.collection,
            "scene_id": scene.scene_id,
            "time_range": payload["input"]["data"][0]["dataFilter"]["timeRange"],
            "evalscript_sha256": _sha256(evalscript),
            "format": image_format,
        }
        return content, request_parameters


# ── Evalscripts ─────────────────────────────────────────────────────────
#
# Se emiten en float32 y sin reescalar a 8 bits: un índice espectral
# cuantizado a 256 niveles pierde justamente la diferencia pequeña que un
# análisis de cambio busca.


def s1_evalscript() -> str:
    bands = ", ".join(f'"{b}"' for b in S1_BANDS)
    return f"""//VERSION=3
function setup() {{
  return {{
    input: [{{ bands: [{bands}] }}],
    output: {{ bands: {len(S1_BANDS)}, sampleType: "FLOAT32" }}
  }};
}}
function evaluatePixel(s) {{
  return [{", ".join(f"s.{b}" for b in S1_BANDS)}];
}}"""


def s2_evalscript() -> str:
    bands = ", ".join(f'"{b}"' for b in S2_BANDS)
    return f"""//VERSION=3
function setup() {{
  return {{
    input: [{{ bands: [{bands}] }}],
    output: {{ bands: {len(S2_BANDS)}, sampleType: "FLOAT32" }}
  }};
}}
function evaluatePixel(s) {{
  return [{", ".join(f"s.{b}" for b in S2_BANDS)}];
}}"""


EVALSCRIPTS = {S1: s1_evalscript, S2: s2_evalscript}


# ── Evalscripts de VISTA ────────────────────────────────────────────────
#
# Producto SEPARADO del de análisis, y a propósito. El GeoTIFF float32 de
# arriba es el que alimenta los índices; estos emiten PNG de 8 bits, ya
# estirados para que un ojo humano distinga algo. Ese estiramiento es una
# decisión de presentación: cambia cómo se ve y no cambia lo que se mide.
#
# Mezclarlos sería el error clásico. Quien mirase una imagen realzada y
# creyera estar viendo el dato mediría contraste inventado por la rampa.
# Por eso viven en funciones distintas, con su propio sha256 en la
# procedencia, y el de análisis nunca se reescala.
#
# Lo que estas imágenes muestran es REFLECTANCIA y RETRODISPERSIÓN. Una
# mancha oscura no es un edificio caído: puede ser sombra, agua, asfalto
# nuevo o un tejado repintado. Siguen sin ser daño.

#: Ganancia de la composición verdadero color. 2.5 es el valor que usa el
#: propio Sentinel Hub en sus ejemplos: la reflectancia de superficie rara
#: vez pasa de 0.4, así que sin ganancia la imagen sale casi negra.
TRUE_COLOR_GAIN = 2.5


def s2_preview_evalscript() -> str:
    """Verdadero color: B04 rojo, B03 verde, B02 azul."""
    return f"""//VERSION=3
function setup() {{
  return {{
    input: [{{ bands: ["B04", "B03", "B02", "dataMask"] }}],
    output: {{ bands: 4, sampleType: "UINT8" }}
  }};
}}
function stretch(v) {{
  return Math.max(0, Math.min(255, Math.round(v * {TRUE_COLOR_GAIN} * 255)));
}}
function evaluatePixel(s) {{
  // El canal alfa viene de dataMask: fuera de la huella de la escena el
  // pixel es transparente en vez de negro, que se leeria como suelo oscuro.
  return [stretch(s.B04), stretch(s.B03), stretch(s.B02), s.dataMask * 255];
}}"""


def s1_preview_evalscript() -> str:
    """Composición de radar: VV en rojo, VH en verde, VV/VH en azul.

    Es la composición habitual de S1 porque separa lo que interesa: lo
    construido devuelve mucho en VV, la vegetación despolariza y sube en VH,
    y el cociente marca el agua y el suelo desnudo. En pantalla: rosados y
    blancos para lo urbano, verdes para vegetación, oscuro para agua.
    """
    return """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["VV", "VH", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
// Cada canal con SU rango, no uno compartido.
//
// Medido sobre la escena pre del AOI (percentiles 1 y 99): VV va de -16,7 a
// +5,8 dB y VH de -24,1 a -3,9. VH esta unos 7 dB por debajo de VV siempre,
// porque la despolarizacion devuelve menos energia que la copolarizacion.
// Pasar los dos por un mismo rango dejaba el verde permanentemente por
// debajo del rojo y tenia toda la imagen en magenta, en la vista y no en el
// terreno. Con el rango propio de cada banda, la vegetacion sale verde, lo
// construido violeta por doble rebote y el agua oscura.
function esc(db, lo, hi) {
  return Math.max(0, Math.min(255, Math.round((db - lo) / (hi - lo) * 255)));
}
function db(v) {
  return 10 * Math.log(Math.max(v, 1e-6)) / Math.LN10;
}
function evaluatePixel(s) {
  var vv = db(s.VV), vh = db(s.VH);
  return [esc(vv, -18, 6), esc(vh, -25, -3), esc(vv - vh, 0, 18), s.dataMask * 255];
}"""


PREVIEW_EVALSCRIPTS = {S1: s1_preview_evalscript, S2: s2_preview_evalscript}


# ── Utilidades ──────────────────────────────────────────────────────────
def _sha256(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode()).hexdigest()


def _instant(moment: datetime, offset_seconds: int) -> str:
    return (moment + timedelta(seconds=offset_seconds)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _pixel_size(bbox: tuple[float, float, float, float], resolution_m: int) -> tuple[int, int]:
    """Tamaño en píxeles del AOI a la resolución pedida.

    Grados a metros con la aproximación estándar y corrección por latitud. El
    AOI son ~7 km²: a esa escala la diferencia frente a una reproyección real
    es de pocos píxeles, y el recorte se define por el bbox, no por el tamaño.
    """
    import math

    min_lon, min_lat, max_lon, max_lat = bbox
    mid_lat = math.radians((min_lat + max_lat) / 2)
    metres_per_degree = 111_320.0
    width_m = (max_lon - min_lon) * metres_per_degree * math.cos(mid_lat)
    height_m = (max_lat - min_lat) * metres_per_degree
    # El servicio rechaza peticiones por encima de 2500 px de lado.
    width = max(1, min(2500, round(width_m / resolution_m)))
    height = max(1, min(2500, round(height_m / resolution_m)))
    return width, height


def _scene_from_feature(feature: dict, collection: str) -> Scene:
    properties = feature.get("properties", {})
    bbox = feature.get("bbox") or [0, 0, 0, 0]
    acquisition = properties.get("datetime") or properties.get("start_datetime")
    orbit = properties.get("sat:orbit_state") or properties.get("orbitDirection")
    return Scene(
        scene_id=feature.get("id", ""),
        collection=collection,
        acquisition=datetime.fromisoformat(str(acquisition).replace("Z", "+00:00")),
        bbox=(float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])),
        geometry=feature.get("geometry") or {},
        # S1 no trae nubosidad: el radar atraviesa la nube. Un 0 aquí se
        # leería como "despejado" en vez de "no aplica".
        cloud_cover=(
            None
            if collection == S1
            else _maybe_float(properties.get("eo:cloud_cover", properties.get("cloudCover")))
        ),
        platform=properties.get("platform") or properties.get("constellation"),
        processing_baseline=str(
            properties.get("processing:software")
            or properties.get("s2:processing_baseline")
            or properties.get("processingBaseline")
            or ""
        )
        or None,
        orbit_direction=str(orbit).upper() if orbit else None,
        relative_orbit=_maybe_int(
            properties.get("sat:relative_orbit", properties.get("relativeOrbitNumber"))
        ),
        raw=feature,
    )


def _maybe_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _maybe_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ── Selección de escenas ────────────────────────────────────────────────
#
# "La mejor escena" es una afirmación auditable o no es nada. Cada elección
# guarda su razón en `selection_reason` y la base lo exige por CHECK.


class NoUsableScene(RuntimeError):
    """Ninguna escena de la ventana sirve. Es un resultado, no un fallo."""


#: Nubosidad por encima de la cual una escena S2 no sirve para comparar. No
#: es un número redondo por gusto: por encima de ~40 % el AOI queda cubierto
#: con probabilidad alta, y un índice calculado sobre nube mide la nube.
MAX_CLOUD_COVER = 40.0


def covers_aoi(scene: Scene, bbox: tuple[float, float, float, float]) -> bool:
    """El bbox de la escena contiene el AOI.

    Comparación de bbox, no de geometría: una escena Sentinel es un
    cuadrilátero de cientos de km frente a un AOI de 7 km², y la diferencia
    entre bbox y huella real solo importa en los bordes de la pasada.
    """
    min_lon, min_lat, max_lon, max_lat = bbox
    s_min_lon, s_min_lat, s_max_lon, s_max_lat = scene.bbox
    return (
        s_min_lon <= min_lon
        and s_min_lat <= min_lat
        and s_max_lon >= max_lon
        and s_max_lat >= max_lat
    )


def select_optical(scenes: list[Scene], *, window_label: str) -> tuple[Scene, str]:
    """La escena S2 menos nublada; a igualdad, la más cercana al evento.

    La nubosidad manda porque es lo que decide si hay dato: una escena a un
    día del sismo y 90 % de nube no observa el suelo.
    """
    usable = [s for s in scenes if s.cloud_cover is not None and s.cloud_cover <= MAX_CLOUD_COVER]
    if not usable:
        nubes = sorted(s.cloud_cover for s in scenes if s.cloud_cover is not None)
        raise NoUsableScene(
            f"Ninguna escena {S2} {window_label} baja de {MAX_CLOUD_COVER:.0f}% de nube "
            f"(mejor disponible: {nubes[0]:.1f}%)"
            if nubes
            else f"El catalogo no devolvio escenas {S2} {window_label}"
        )
    best = min(usable, key=lambda s: (s.cloud_cover, abs((s.acquisition.date() - EVENT_DATE).days)))
    return best, (
        f"nubosidad {best.cloud_cover:.1f}% (minima de {len(usable)} escenas utilizables "
        f"de {len(scenes)} halladas); a {abs((best.acquisition.date() - EVENT_DATE).days)} "
        f"dias del evento"
    )


def select_pairs(
    found: dict[tuple[str, str], list[Scene]], *, windows: tuple[str, ...] = ("PRE", "POST")
) -> tuple[dict[tuple[str, str], tuple[Scene, str]], list[str]]:
    """Elige la escena de cada colección y ventana, con su motivo.

    Devuelve `(elegidas, avisos)`. El motivo sale de la misma llamada que
    eligió la escena y no se recalcula después: la selección de radar depende
    de la escena pre, así que recalcularla sin ese contexto describe una
    escena distinta de la que quedó marcada. Esa fila diría, con toda la
    apariencia de procedencia, por qué se eligió algo que no se eligió.
    """
    chosen: dict[tuple[str, str], tuple[Scene, str]] = {}
    warnings: list[str] = []

    for label in windows:
        try:
            chosen[(S2, label)] = select_optical(found.get((S2, label), []), window_label=label)
        except NoUsableScene as exc:
            warnings.append(f"{S2} {label}: SIN ESCENA — {exc}")

    # La post de radar se ata a la geometría de la pre.
    radar_pre: Scene | None = None
    for label in windows:
        try:
            scene, reason = select_radar(
                found.get((S1, label), []),
                window_label=label,
                match=radar_pre if label != windows[0] else None,
            )
        except NoUsableScene as exc:
            warnings.append(f"{S1} {label}: SIN ESCENA — {exc}")
            continue
        if label == windows[0]:
            radar_pre = scene
        chosen[(S1, label)] = (scene, reason)

    return chosen, warnings


def select_radar(
    scenes: list[Scene], *, window_label: str, match: Scene | None = None
) -> tuple[Scene, str]:
    """La escena S1 más cercana al evento, con la geometría de `match`.

    La condición de geometría no es un refinamiento: comparar una pasada
    ascendente con una descendente, o dos órbitas relativas distintas, produce
    una diferencia de retrodispersión que viene del ángulo de observación y no
    del terreno. Leerla como cambio sería inventar el hallazgo.
    """
    pool = scenes
    constraint = ""
    if match is not None:
        pool = [
            s
            for s in scenes
            if s.orbit_direction == match.orbit_direction
            and s.relative_orbit == match.relative_orbit
        ]
        constraint = (
            f"; misma geometria que la escena pre ({match.orbit_direction}, "
            f"orbita relativa {match.relative_orbit})"
        )
        if not pool:
            raise NoUsableScene(
                f"Ninguna escena {S1} {window_label} comparte geometria con la pre "
                f"({match.orbit_direction}, orbita relativa {match.relative_orbit}). "
                "Comparar geometrias distintas mediria el angulo de observacion, no el terreno."
            )
    if not pool:
        raise NoUsableScene(f"El catalogo no devolvio escenas {S1} {window_label}")

    best = min(pool, key=lambda s: abs((s.acquisition.date() - EVENT_DATE).days))
    return best, (
        f"a {abs((best.acquisition.date() - EVENT_DATE).days)} dias del evento, "
        f"{best.orbit_direction} orbita relativa {best.relative_orbit} "
        f"({len(pool)} candidatas de {len(scenes)} halladas){constraint}"
    )
