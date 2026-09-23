# Daño en toda la ciudad, no solo en el recuadro — qué existe y qué se puede usar

Research del 2026-09-18, a pedido del dueño. Pregunta: ¿se puede tener acceso a
toda Pereira y sus afectaciones, en vez del rectángulo de 21,66 km² que cubre el
visor?

**Respuesta corta: sí existe el dato, y es mejor que el que tenemos.** La
Alcaldía levantó inspecciones **edificio por edificio en toda la ciudad**
(~7.700 registros con habitabilidad y nivel de daño, validadas en campo) y las
publica en su ArcGIS Online. Frente a eso, las 182 observaciones de Copernicus
son foto-interpretación satelital de un sector. Lo que impide usarlas hoy no es
técnico: es que el ítem no declara licencia y trae datos personales que hay que
suprimir antes de que entre una sola fila. Las dos cosas tienen solución escrita
abajo.

## 1. Lo que hay, verificado el 2026-09-18

Todo en la org de la Alcaldía de Pereira en ArcGIS Online (`Zdpg0E6lri7EggIc`).
Ninguno declara `licenseInfo` ni `copyrightText` salvo donde se indica.

| Ítem | Qué es | Registros | Cobertura | Campos útiles (no personales) | Campos personales | Veredicto |
|---|---|---|---|---|---|---|
| **`ReporteEdificaciones300826`** — "habitabilidad terremoto 10 de agosto" | Inspección rápida de daños (formulario regional EDAM), corte 30-08-2026 | **7.697** (6.386 con coordenada) | **Toda la ciudad y corregimientos**: 5.781 dentro del perímetro urbano, 4.543 dentro del AOI actual; 64 valores de comuna, incluidas Cuba, San Joaquín, Olímpica (fuera del AOI) | `COMUNA`, `BARRIO`, `PISOS`, `SÓTANOS`, `USO_PRINCIPAL`, `TIPO_PROPIEDAD`, `TIPO_EDIFICACIÓN`, **`HABITABILIDAD`** (habitable / uso restringido / no habitable), **`NIVEL_DE_DAÑO`** (menor / moderado / severo), `COLAPSO_TOTAL`, `COLAPSO_PARCIAL`, `INCLINACIÓN`, `RIESGO_ADYACENTE`, `MOVIMIENTO_EN_MASA`, `FECHA_INSP` | `DIRECCIÓN` (predio) | **La fuente de daño que falta.** UNCLEAR hasta que declaren términos; ingesta solo sin `DIRECCIÓN`, publicación por manzana. |
| `BD_Inspecciones_Corregidas_EDAM20260901` | Misma inspección, base corregida al 01-09-2026 | **8.048** | Idem | Los mismos, más `CODIGO_PREDIAL`, `TIPO_DE_INSPECCION`, `RECOMENDACIONES` | **`NOMBRE_DEL_EVALUADOR`, `PERSONA_DE_CONTACTO`, `NUMERO_DE_CONTACTO`, `DIRECCION`, `CODIGO_PREDIAL`** | Más completa y **mucho más sensible**. Si se pide algo, pedir esta con los personales fuera. |
| `PrediosEnDemolicionSismoPereira2026_Web` | Predios con resolución de demolición | 170 polígonos | Ciudad | `EstadoDemolicion`, `area_terreno`, `RESOLUCIÓN` | **`PROPIETARIO`, `IDENTIFICACIÓN`, `cédula`, `matrícula`, `dirección`** — y su `licenseInfo` dice literalmente «La capa tiene habeas data…» | **No se toca.** Publica nombres y cédulas de propietarios; que esté disponible no lo hace usable, y menos redistribuible. Si algún día entra, solo el polígono y el estado, por manzana. |
| `FORMULARIO REGIONAL PARA LA EVALUACIÓN RÁPIDA DE DAÑOS DE EDIFICACIONES` (Survey123) | El formulario de campo detrás de las dos bases | (vista de formulario) | — | Sistema estructural, material de muros y cubierta, piso débil, columna corta, cambios de rigidez, amenaza por cuerpos hídricos… | Evaluador, contacto, teléfono, dirección | Referencia del esquema; no se consulta. |
| `ZRS` | "Evaluación del riesgo sísmico… afectaciones en el ambiente construido" (UNGRD) | (capa 1, no consultable sin ítem) | Ciudad | Zonificación de riesgo sísmico | — | Podría ser la microzonificación que D6 pregunta si existe. Pendiente. |
| `mapaortofoto` | Ortofoto del 14-08-2026 | teselas | Ciudad | — | — | Ver `db/terms/pereira_ortofoto_post_20260918.txt`. |

Distribución de la inspección (7.697 registros, campos sin datos personales,
exploración en memoria, nada archivado):

| Variable | Valores |
|---|---|
| Habitabilidad | USO RESTRINGIDO 2.280 · HABITABLE 2.001 · **NO HABITABLE 1.938** · sin dato 167 |
| Nivel de daño | MODERADO 2.498 · **SEVERO 1.709** · MENOR 1.576 · sin dato 603 |
| Colapso total | SÍ **615** · NO 5.094 · sin información 670 |
| Colapso parcial | SÍ 2.418 · NO 3.053 |
| Dentro del AOI actual | 4.543 registros: SEVERO 1.215 · NO HABITABLE 1.408 |

Comparación con lo que el visor usa hoy: Copernicus EMS, 182 observaciones,
6,91 km², sin validación de campo, clases *posiblemente dañado / dañado /
destruido*. La inspección municipal tiene **25 veces más registros dentro del
mismo AOI**, cubre el resto de la ciudad, y está validada en campo — que es
exactamente el `+0,10` de confianza que la fusión (ADR-16) nunca ha podido dar.

Calidad, para no idealizarla: 17 % de registros sin coordenada; texto libre en
comuna, barrio y tipo de edificación (64 valores de comuna, «SIN ESPECIFICAR» en
1.899); fechas inconsistentes; coordenadas con valores atípicos fuera del
municipio (rango de longitud −76,05 a −75,23). Entra con limpieza declarada en el
manifiesto de la versión, no con la ilusión de que es una base limpia.

## 2. Otras fuentes con cobertura regional

| Fuente | Qué da | Licencia | Utilidad |
|---|---|---|---|
| **USGS ShakeMap `us6000tjl2`** (versión 2026-09-07) | Intensidad instrumental (MMI) y PGA/PGV interpolados para toda la región; `grid.xml`, `shape.zip`, contornos MMI | Dominio público (USGS) | Contexto: intensidad esperada en cada comuna de Pereira, la variable que falta desde que se retiró la capa del SGC. No es daño. |
| **USGS PAGER** | Exposición de población por nivel de intensidad y estimación de pérdidas | Dominio público | Contexto regional. |
| **Copernicus EMS EMSR916**, otras AOI | La activación cubrió 409 municipios con varias AOI; solo tenemos AOI02 | CC BY 4.0 | Hay que revisar el listado de productos de la activación (la API pública devolvió 404 en esta sesión): si existe otra AOI sobre Pereira, entra por el adaptador que ya existe. |
| **UNOSAT, producto 4250** ("M 7.4 in South of San José del Palmar") | Evaluación satelital del evento | Por producto (UNCLEAR en el registro) | La página no expone su contenido sin navegador; verificar si incluye Pereira. El registro decía «no cubre Pereira» el 2026-09-13; el producto es posterior. |
| **datosdelterremoto.org** (Monitor Terremoto) | Agregador con reportes y puntos de otras fuentes | CC BY 4.0 sobre derivados; los crudos conservan la suya | Ya registrado (`monitor_terremoto`). Verificar si agregó las inspecciones municipales. |
| UNGRD / RUD | Registro único de damnificados (personas) | — | Bloqueado por D3: agregado por manzana ≥ 20 hogares o nada. |

## 3. Qué habría que hacer para usar la inspección municipal

En este orden, y ninguno es opcional:

1. **Términos.** Pedir a SIGPER (`sigper@pereira.gov.co`) que declare en la ficha
   de `ReporteEdificaciones300826` (o de la base corregida) el mismo texto de
   datos abiertos (Ley 1712 de 2014) que ya usa en «Equipamientos actual», y el
   productor. Mientras tanto la fuente se registra como `pereira_edam`, UNCLEAR,
   con esta auditoría: el control C1 la bloquea por construcción.
2. **Datos personales.** El adaptador pide y archiva solo las columnas no
   personales de la tabla de arriba. `DIRECCIÓN`, `CODIGO_PREDIAL`, evaluador,
   contacto y teléfono **no se piden**: FR-PII-01 rechazaría el lote y con razón.
   Mismo patrón que `pereira_sig` con `DIRECCION`.
3. **Unidad de publicación.** Cada inspección entra a `damage_evidence` como
   observación con `method = FIELD_SURVEY`, `field_validated = true`,
   `original_source = 'pereira_edam'`, y la clase se mapea de forma declarada
   (NO HABITABLE / colapso total → destruido; SEVERO → dañado; MODERADO /
   MENOR → posiblemente dañado, con el mapeo escrito en el manifiesto). Pero lo
   que se **publica** es por manzana (DANE, ya cargadas): conteos por
   habitabilidad y nivel de daño con supresión bajo 20 unidades
   (antes-de-empezar.md §3, FR-PII-03). Un punto a nivel de estructura con
   «no habitable» encima y el catastro público al lado identifica un hogar.
4. **Ampliar el AOI.** El AOI actual es el de Copernicus porque era la única
   evidencia. Con la inspección municipal, el área de trabajo pasa a ser el
   perímetro urbano (32,8 km², 16 comunas) y los sitios se derivan de las dos
   fuentes fusionadas. Esto cambia `PEREIRA_BBOX`, `AOI_POPULATION` (el reparto
   dasimétrico tendría que pasar al censo DANE, que ya está por manzana), las
   features, los hashes y las 123 pruebas: es una versión nueva del sistema, no
   una capa más. Decisión D1/D2 con dueño.
5. **Limpieza declarada.** Normalizar comuna y barrio contra los polígonos de
   OSM por posición (no por texto), descartar coordenadas fuera del municipio,
   y contar todo lo descartado en el manifiesto.

## 4. Lo que no se hace

- Descargar la base con nombres y teléfonos «para explorar»: `fuentes.md` §0
  permite explorar en sandbox, no archivar datos personales en ningún sitio.
- Publicar puntos de inspección con habitabilidad a nivel de edificio.
- Tomar «NO HABITABLE» como «destruido» sin escribir el mapeo: son escalas
  distintas (habitabilidad es una decisión administrativa; daño, una
  observación).
- Presentar la inspección municipal como cobertura completa: 7.697 edificios
  inspeccionados no son todos los edificios de Pereira; son los que alguien
  reportó o el operativo alcanzó.
