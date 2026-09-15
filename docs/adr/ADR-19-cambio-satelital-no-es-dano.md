# ADR-19 — Un cambio satelital no es daño, y el esquema lo impide

**Estado:** aceptada
**Fecha:** 2026-09-15
**Documentos padre:** PRD v1.0 §5 (no presentar salidas inciertas como hechos); SRS `FR-DC-02`
**Relacionada:** ADR-16 (evidencia multifuente), ADR-17 (prohibición de datos sintéticos)

---

## Contexto

El sistema tiene 182 observaciones de daño de Copernicus EMS sobre 6,91 km².
Es poco y es un sector. La vía para ampliarlo sin esperar a nadie es la imagen
cruda: Sentinel-1 GRD y Sentinel-2 L2A, pre y post del sismo del 2026-08-10,
comparando retrodispersión e índices espectrales.

La licencia sale bien, y por una vez en la dirección permisiva. El aviso legal
de Copernicus concede «free, full and open access» con reproducción,
distribución, comunicación pública y modificación (Reg. UE 1159/2013, art. 7).
Ojo con la distinción, que es la misma que hundió al SGC pero al revés: los
términos de CDSE separan el **dato** del **portal**. El dato es libre; «any
other contents of the Copernicus Data Space Ecosystem portal are intended for
non-commercial use».

El riesgo aquí no es de licencia. Es de vocabulario.

Un píxel cuya retrodispersión cae 6 dB entre agosto y septiembre ha cambiado.
Eso es todo lo que el dato dice. Ese mismo cambio lo produce una demolición,
una obra nueva, un cultivo cosechado, un suelo mojado, un techo repintado o un
coche aparcado donde antes no había ninguno. Nombrar esa columna `damage_score`
no la hace más precisa: hace que todo lo que la consuma —el modelo, el
portafolio, el mapa, el reporte que lee una alcaldía— trate una diferencia de
reflectancia como daño confirmado, sin que nadie vuelva a mirar de dónde salió.

Es el mismo mecanismo que ya costó dos rectificaciones: `is_synthetic` que se
leía como dato real (ADR-17), y `risk_score` que valía 0,28 en los 115 sitios y
aparecía al 100 % de cobertura (ADR-18). En los dos casos el problema no fue el
dato, fue que su nombre prometía más de lo que contenía.

## Decisión

**1. Lo que se mide se llama como se mide.** `core.satellite_observation.band`
nombra la medición: `VV`, `VH`, `B02`…`B12`, `NDVI`, `NDBI`, `NDWI`,
`delta_backscatter`, `ratio_pre_post`, `spectral_change`. Lo derivado de
comparar dos fechas es `change_score`.

**2. La prohibición está en la base, no en revisión de código.**

```sql
ALTER TABLE core.satellite_observation
    ADD CONSTRAINT band_is_a_measurement_not_a_verdict
    CHECK (lower(band) NOT LIKE '%damage%' AND lower(band) NOT LIKE '%destroy%'
           AND lower(band) NOT LIKE '%dano%'  AND lower(band) NOT LIKE '%destru%');
```

Bastaría un adaptador nuevo escribiendo `damage_score` para que el resto del
sistema empezara a tratar reflectancia como daño. Una convención no lo impide;
un `CHECK` sí.

**3. Cuando se cruce con huellas de edificio, el resultado es
`DAMAGE_EVIDENCE`, nunca `CONFIRMED_DAMAGE`.** Entra en `core.damage_evidence`
como una fila más, con `method = 'REMOTE_SENSING'`, su `confidence` y su
`original_source`, y la fusión de ADR-16 la pondera contra lo demás. No
sustituye a nada ni se promueve solo.

**4. La selección de escenas guarda su criterio.** `selected = true` exige
`selection_reason` por `CHECK`. «La mejor escena» sin el porqué es una
afirmación que nadie puede auditar ni reproducir.

**5. Se catalogan todas las escenas consideradas, no solo las elegidas.** Las
descartadas son lo que convierte la selección en una decisión entre
alternativas.

**6. Dos restricciones que vienen de la física del sensor.**

- Una escena S1 no puede declarar nubosidad: el radar atraviesa la nube, y un
  `0` se leería como «despejado» en vez de «no aplica».
- La escena S1 post debe compartir dirección de órbita y órbita relativa con
  la pre. Comparar una ascendente con una descendente mide el ángulo de
  observación, no el terreno. Sin pareja compatible el pipeline **se detiene**
  en vez de producir un cambio que no ocurrió.

**7. Las credenciales no salen del backend.** `CDSE_CLIENT_ID` y
`CDSE_CLIENT_SECRET` se leen del entorno y **no entran en la procedencia**:
`request_parameters` guarda qué se pidió, no con qué llave. `dataset_version`
es inmutable por trigger, así que un secreto escrito ahí no se podría borrar.

## Consecuencias

**El pipeline está completo y sin correr.** No hay credenciales de CDSE en este
entorno. Los endpoints sí son alcanzables (`/catalog/v1/search` responde 401,
el de token responde 400), así que lo que falta es una credencial, no acceso.
`core.satellite_scene` y `core.satellite_observation` están **vacías**, y eso
se declara en vez de rellenarse: ADR-17 prohíbe exactamente el atajo de
sembrarlas con escenas inventadas para enseñar la tubería funcionando.

**Lo verificable sin red se verifica.** El criterio de selección y las
restricciones de la base son lo que decide si el resultado es honesto, y ambos
se prueban sin credenciales: 13 pruebas cubren la cobertura del AOI, el umbral
de nubosidad, el emparejamiento de geometría radar, que la credencial no llega
a la procedencia, y los cuatro invariantes de la base.

**Lo que este ADR no autoriza.** No hay clasificación de «edificio destruido»,
no hay `damage_score`, no hay entrenamiento de nada, y SERTIT no vuelve como
dependencia. Esa etapa necesita ground truth, y hoy el único ground truth
disponible son las 182 observaciones de EMS sobre un sector — suficiente para
validar un método, no para entrenar uno.

## Alternativas descartadas

**Llamarlo `damage_score` y documentar la salvedad en un comentario.** Es lo
que hacía `risk_score` antes de ADR-18: el nombre viajaba a la API, al export y
al mapa; el comentario se quedaba en el repositorio.

**Clasificar directamente con un umbral sobre `delta_backscatter`.** Un umbral
sin ground truth es una opinión con dos decimales. Además convertiría el
sistema en su propia fuente de verdad: el mismo pipeline produciría la
evidencia y el veredicto, sin nada contra qué contrastarlo.

**Guardar solo las escenas elegidas.** Ahorra filas y elimina la posibilidad de
auditar la elección. La tabla de escenas descartadas es barata; reconstruir por
qué se eligió una escena seis meses después, no.
