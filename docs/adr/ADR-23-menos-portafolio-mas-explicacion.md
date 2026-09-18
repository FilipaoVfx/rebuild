# ADR-23 — Se retira la vista Portafolio, las oportunidades se filtran por idoneidad y el lateral explica el contexto activo

**Estado:** aceptada
**Fecha:** 2026-09-18
**Enmienda:** [ADR-21](ADR-21-el-visor-como-superficie-principal.md) (cinco vistas → cuatro más Territorio), [ADR-22](ADR-22-territorio-como-vista-de-entrada.md)
**Origen:** decisión de producto del dueño del repositorio

---

## Contexto

Con Territorio como entrada y cada sitio con su lugar (ADR-22), el dueño pidió
tres cosas más: quitar el portafolio, ver solo las oportunidades que valen la
pena a menos que se pida lo contrario, y que el texto lateral explique al
analista qué está mirando según la opción elegida en la barra inferior del mapa.

La vista Portafolio mostraba la salida del optimizador greedy: 19 proyectos por
presupuesto, cobertura marginal, huecos de población no alcanzada, relieve 3D.
Es la parte del sistema con menos sustento hoy: los costos son estimados sin
fuente oficial (OI-05), los pesos no tienen dueño institucional (D7), y el
propio optimizador declara que el presupuesto no es lo que limita
(`cobertura_saturada` en los cuatro escenarios). Presentarlo como pantalla
principal era presentar una conclusión sobre premisas que el mismo visor marca
como abiertas.

## Decisión

### 1. La vista Portafolio se retira del visor; el optimizador, no

Quedan cinco vistas: **Territorio, Situación, Oportunidades, Escenarios,
Evidencia**. Escenarios sigue mostrando qué cambia con las prioridades y el
motivo de parada del optimizador; lo que desaparece es la lista de proyectos
como producto. La API (`POST /scenarios`, `/scenarios/{id}/coverage`), el
optimizador, sus pruebas y `build_static.py` no cambian: la decisión es de
superficie, no de modelo. Con ella se van del mapa el relieve de cobertura 3D,
los huecos y los arcos, y del código `lib/clusters.ts` y `PortfolioView.tsx`.

### 2. Idoneidad mínima: 64 por defecto, ajustable a 0

Oportunidades abre mostrando las de idoneidad ≥ 64 (34 de 105 con el estado
actual) con un control deslizante 0–100 y dos atajos («≥ 64», «Ver todas»). El
umbral no borra nada: las oportunidades por debajo siguen en el mapa,
atenuadas, y la cifra «X de Y» dice cuántas quedan fuera. El valor 64 es el
que pidió el dueño; queda como constante nombrada (`DEFAULT_MIN_SUITABILITY`) y
no como número suelto.

### 3. El primer panel del lateral sigue al contexto del mapa

Cada opción de la barra inferior —Territorio, Situación, Daño, Necesidad,
Déficit, Acceso, Oportunidades— tiene un panel de introducción con la pregunta
que responde, las **variables** que usa (cómo se calculan, con qué fuente y
hasta dónde llegan), cómo leer el mapa y una advertencia final. Los textos
describen lo que hace el pipeline, con sus constantes (750 m de recorrido a
10 min, 10 m²/hab, 12 km/km², 6.000 personas de techo, fiabilidad 0,65 del
sensor remoto), y los números salen del estado cargado. Territorio conserva
«¿Dónde estamos?» como su panel propio; en las demás vistas, el contexto
Territorio también se explica.

Cambiar de vista desde Territorio lleva al contexto que la responde
(Oportunidades → `OPORTUNIDADES`, Situación → `SITUACION`): abrir la lista de
oportunidades con los sitios en gris era contradecir lo que la vista dice.

### 4. La cobertura de daño en toda la ciudad tiene fuente, y está bloqueada por razones no técnicas

El research pedido por el dueño ([cobertura-de-dano-ciudad.md](../plan/cobertura-de-dano-ciudad.md))
encontró que la Alcaldía publica inspecciones de daño edificio por edificio
para toda la ciudad (~7.700 registros, validadas en campo, con habitabilidad y
nivel de daño). Es 25 veces más registros que Copernicus dentro del mismo AOI
y cubre las comunas que hoy quedan fuera. No entra todavía porque el ítem no
declara licencia y porque trae datos personales que hay que suprimir antes.
El panel del contexto Daño lo dice en pantalla en vez de esconderlo: un visor
que cita solo lo que tiene tiene que decir también lo que sabe que existe.

## Consecuencias

- **Visor.** `PortfolioView.tsx` y `lib/clusters.ts` eliminados; `ViewKey` sin
  `portafolio`; `store` sin `unreached`, `showRelief`, `selectedClusterId`;
  nuevo `minSuitability`; nuevo `components/ContextIntro.tsx`; Situación y
  Escenarios enlazan entre sí en vez de al portafolio; `MethodPanel` plegado por
  defecto porque el panel de contexto ya lista las variables.
- **Verificación.** `browser_check.py` comprueba que el lateral cambia con cada
  contexto y cita fuentes y límites, que el umbral por defecto es 64 y que «Ver
  todas» recupera la lista completa; retira las comprobaciones del portafolio y
  prueba el relieve desde Territorio.
- **Seguimiento.** Registrar `pereira_edam` (UNCLEAR) con la auditoría del
  research; pedir términos a SIGPER; diseñar la ampliación del AOI al perímetro
  urbano como versión nueva del sistema (D1/D2).

## Alternativas rechazadas

- **Ocultar Portafolio detrás de un toggle "avanzado".** Una pantalla que
  existe pero no se muestra sigue siendo una pantalla que hay que mantener y
  que alguien terminará abriendo sin leer sus advertencias.
- **Aplicar el umbral en el servidor.** El umbral es una preferencia de
  lectura, no una regla del modelo: los 105 candidatos siguen existiendo y la
  API los devuelve todos.
- **Un texto por vista en vez de por contexto.** El dueño fue explícito: lo
  que cambia el mapa es la barra inferior, y el lateral tiene que seguirla.
