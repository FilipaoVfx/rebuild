# ADR-27 — El visor es un espacio de análisis sobre el mapa

**Estado:** aceptada
**Fecha:** 2026-09-25
**Enmienda:** [ADR-21](ADR-21-el-visor-como-superficie-principal.md) (el visor
sigue siendo la superficie principal; cambia su forma),
[ADR-22](ADR-22-territorio-como-vista-de-entrada.md) (el territorio deja de ser
una vista: es la pantalla entera), [ADR-23](ADR-23-menos-portafolio-mas-explicacion.md)
(el umbral de idoneidad y el lateral por contexto salen de la interfaz)
**Implementa:** [`docs/designs/recovery-mapa-analista-20260925`](../designs/recovery-mapa-analista-20260925/README.md)
y las variantes B y C de [`docs/designs/recovery-recorrido-20260925`](../designs/recovery-recorrido-20260925/README.md)
**Origen:** requerimiento del dueño del repositorio: «la UI que usaremos desde
ahora», conservando los fundamentos del proyecto en cuanto a datos

---

## Contexto

El visor de ADR-21 organizaba el producto en cinco vistas (Territorio,
Situación, Oportunidades, Escenarios, Evidencia) y siete contextos de mapa. La
exploración de diseño del 2026-09-25 concluyó que la interfaz explicaba una
oportunidad pero ofrecía poco recorrido después de entenderla, y que la
pregunta abierta era cómo comparar *intervenciones para un mismo lugar* y
convertir las dudas en una comprobación.

De esa exploración salieron tres documentos: el mockup del mapa como espacio
de análisis, la mesa de decisiones (variante B) y el cuaderno de verificación
(variante C), con una hipótesis de recorrido: entrar por un lugar, comparar al
estilo B, cerrar con las preguntas al estilo C. El dueño del repositorio la
adopta como interfaz.

## Decisión

### 1. El mapa ocupa toda la pantalla; todo lo demás flota

El producto se llama **REBUILD**. No hay cabecera ni barra lateral fija: el
mapa ocupa todo el alto de la ventana. Abajo y al centro, una sola barra con la
marca, el buscador, Fuentes, Guardadas, Ayuda y Ajustes. Arriba, lo que explica
el mapa: la tarjeta del sector de estudio («Cobertura parcial: este mapa no
representa toda la ciudad») con la leyenda debajo, el selector de cinco capas
(Territorio, Daño, Población, Espacio público, Equipamientos) y la franja de
procedencia. La tarjeta del lugar va centrada en el lateral derecho.

Papel marfil, tinta azul marino, cobalto para lo seleccionado y lo accionable;
Source Serif 4 y Source Sans 3 empaquetadas desde npm, sin CDN. Hay **modo
oscuro**: los mismos tokens redefinidos sobre azul marino profundo y la misma
cartografía de OpenStreetMap recoloreada de noche. El tema sigue al sistema
salvo que el analista elija otro.

**Componentes de [motion-primitives](https://motion-primitives.com).** La
interfaz usa esta librería desde ahora, copiada al proyecto como ella indica
(`apps/viewer/src/components/motion-primitives/`, con `motion`, `clsx` y
`tailwind-merge`): la barra inferior sigue el patrón *Toolbar Dynamic* (se
ensancha con un muelle y se vuelve buscador), los ajustes son un *Morphing
Popover*, Fuentes, Guardadas y Ayuda son *Morphing Dialog* que nacen de su
botón, y los selectores de capa, tema y radio usan *Animated Background*.

**Ajustes.** Tema (sistema, claro u oscuro), radio del entorno (300, 500 u
800 m, el que cuentan la tarjeta y el panel de entorno) y el velo fuera del
área de estudio. Se guardan en el navegador del analista.

### 2. El recorrido lo elige el analista, y la obra va al final

Al tocar un sitio aparece su tarjeta, unida al pin por una línea: evidencia de
daño, entorno cercano, población y normativa, cada una con lo que hay y lo que
falta. Desde ahí:

| Camino | Qué responde |
|---|---|
| **Examinar evidencia** | Qué se observó, cuándo, con qué método y confianza; imágenes Sentinel antes y después recortadas al sitio; qué baja la confianza; qué no dice esa evidencia |
| **Explorar el entorno** | Dónde está; el alcance a 10 minutos a pie; espacio público y equipamientos a 500 m, de SIGPER y OSM |
| Ver posibles intervenciones *(enlace discreto)* | **¿Qué aportaría más a este lugar?** Dos hipótesis del modelo de reglas lado a lado: qué necesidad atienden, a quién servirían, qué falta comprobar, la viabilidad normativa y el costo como estimación paramétrica |
| **Preparar verificación** | **¿Qué debemos comprobar?** Una lista que sale de los huecos de datos de *ese* sitio, una pregunta para la visita y una ficha imprimible |

Las intervenciones no encabezan: una recomendación del sistema no es una
instrucción para construir.

### 3. Sale de la interfaz, no del sistema

Salen de la pantalla las vistas Situación, Oportunidades (la lista ordenada
por idoneidad), Escenarios (el optimizador por presupuesto) y Evidencia como
vista; los siete contextos de mapa; el umbral de idoneidad 64; los tipos de
mapa oscuro y «solo datos»; la cortina Sentinel sobre el mapa y el relieve 3D.
**La API, el optimizador y el paquete estático no cambian**: siguen
calculando y exportando lo mismo. Si el portafolio vuelve a hacer falta, entra
como una herramienta flotante más, no como otra vista.

### 4. Lo que no cambia: las reglas de datos

- **Nada inventado (ADR-17).** Cada cifra de la interfaz sale de la salida
  versionada. El mockup dibujaba conteos, fotos y disponibilidades de
  ejemplo; la implementación solo muestra lo que existe.
- **Lo que falta se dice.** Un dato ausente se raya y se nombra («sin dato»,
  «no disponible»), nunca se pinta como cero ni se esconde. En la comparación,
  las fotos y notas de campo aparecen como *no disponibles*, no con el punto
  verde del mockup.
- **Una imagen no es daño (ADR-19).** Los recortes Sentinel llevan fecha,
  sensor y la limitación al lado.
- **Licencia antes que disponibilidad (ADR-18, ADR-22 §6, ADR-26).** Las
  ortofotos y el POT de IDE AMCO no se publican: la tarjeta dice «POT sin dato
  publicable». La procedencia sale de los datos y la atribución de
  OpenStreetMap queda visible también en móvil.
- **Cobertura parcial.** Fuera del recuadro EMSR916 el mapa se vela, y la
  malla de población, que se sale del recuadro, queda debajo del velo.
- **Grano de cuadra, nunca de predio (SRS §6).**

### 5. Reglas nuevas que la implementación hizo necesarias

- **Un alcance degenerado no se presenta como alcance.** Si la captación a
  10 minutos mide menos de 5 ha, la red peatonal no conectó el sitio: la
  tarjeta dice «alcance no confiable» y no muestra la cifra de personas como
  alcance. Son 10 de los 115 sitios en los datos n.º 135; Corocito
  (`site_0028`) calcula 1.680 m² y «13,8 personas».
- **Los nombres del pipeline no se repiten si mienten.** `engine.py` sigue
  restando 0,20 de confianza a todos los sitios bajo el nombre
  `synthetic_context_layers`, aunque ADR-17 retiró lo simulado. La interfaz lo
  muestra como «descuento fijo heredado, pendiente de corregir». Corregir el
  cálculo es trabajo del pipeline, no del visor.
- **Lo del analista se queda en su navegador.** Las comparaciones guardadas y
  los borradores de verificación viven en `localStorage`: no se envían ni se
  publican, y la interfaz lo dice («Borrador local · no enviado»).
- **Un lugar se puede enviar.** La URL lleva el sitio, el panel y la capa
  (`#sitio=site_0028&panel=intervenciones`).

### 6. Lo diseñado que no se implementa

Adjuntar fotos, notas o audio desde la ficha: ADR-24 hace entrar la evidencia
de campo por la aplicación de campo y con revisión humana, y este visor no la
recibe todavía; la ficha impresa deja espacio para anotar. Tampoco las
ilustraciones conceptuales de las alternativas ni el usuario con avatar: no
hay dato detrás de ninguna de las dos.

## Consecuencias

- El recorrido que el diseño quería probar existe y se puede poner delante de
  un analista: «al abrir Corocito, ¿encuentra la evidencia, entiende sus
  límites y escoge por dónde seguir sin que el sistema lo empuje a una obra?».
- La capacidad de portafolio queda invisible. Es una pérdida real para quien
  necesitaba comparar presupuestos; se acepta porque el diseño la retiró a
  propósito, y la API la conserva.
- `scripts/checks/browser_check.py` se reescribe para este recorrido. Ya no
  mide vistas: comprueba que cada paso siga diciendo lo que la interfaz no
  puede perder, que no vuelva una cabecera, que la barra esté abajo y que el
  modo oscuro cambie toda la interfaz.
- El demo del recorrido, sin voz ni audio, vive en `docs/demo/`.
