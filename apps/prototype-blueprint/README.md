# Prototipo de interfaz sobre Blueprint

Prototipo para evaluar qué aporta [Blueprint](https://github.com/palantir/blueprint)
—el toolkit de React de Palantir para interfaces densas de escritorio— al dominio
de este proyecto. **Sin backend, con datos sintéticos, no es el producto.**

## Por qué existe, y por qué los datos son sintéticos

[ADR-17](../../docs/adr/ADR-17-prohibicion-de-datos-sinteticos.md) prohíbe los
datos sintéticos **en el pipeline**. Esto no es el pipeline: no tiene base de
datos, no toca la ingesta y nunca se publica como producto. Rige el
[manifiesto](../../docs/URBAN_RECOVERY_ONTOLOGY_MANIFESTO.md) §31 — el dato
simulado debe *verse* simulado — y por eso cada objeto lleva `simulated: true`,
el cromo lo declara de forma permanente y el generador usa semilla fija.

## Qué demuestra

| Vista | Componentes | Qué responde |
|---|---|---|
| **Resumen** | `Section`, `ProgressBar`, `Popover`, `Callout`, `HTMLTable` | Métricas con numerador y denominador siempre visibles; procedencia al pasar el cursor sobre cualquier fuente |
| **Oportunidades** | `Table2` virtualizada, `MultiSelect`, `Slider`, `Switch`, `Drawer` | 105 filas, columnas redimensionables, cabeceras con menú de orden; la ficha completa en un panel lateral |
| **Ontología** | `Tree` | Objetos, propiedades y enlaces recorribles: `opportunity → site → damage_evidence → source` |
| **Casos límite** | `NonIdealState`, `Tag`, `Card` | Los quince estados que un dato puede tener, cada uno con su código, intent e icono |

Transversal: `Omnibar` (`⌘K`) con búsqueda sobre los tres tipos de objeto,
`useHotkeys` (`1`–`4`, `?`), tema oscuro `bp5-dark`.

## El hallazgo que justifica todo esto

Blueprint tiene `NonIdealState` como componente de primera clase. El visor real
declara **45 ausencias en cinco redacciones distintas** —`sin fuente`,
`Sin fuente`, `no ordena`, `sin colorear`, `Sin fotos`— escritas a mano cada vez.

`src/ui.tsx` las convierte en **quince códigos cerrados** con intent, icono y
explicación, y una sola forma de dibujarlas. Es [ADR-25](../../docs/adr/ADR-25-la-ontologia-es-un-artefacto-declarado.md)
regla 2 aplicada a la interfaz: hoy la ausencia es texto libre en la UI igual que
`stop_reason` es texto libre en el optimizador.

Con códigos, `browser_check.py` puede verificar que cada ausencia declarada en la
base aparece declarada en pantalla. Hoy eso no se puede comprobar.

## Los quince casos límite

`SIN_FUENTE` · `NO_DISCRIMINA` · `SUPRIMIDO` · `AMBIGUO` · `SIN_ENLACE` ·
`BLOQUEADA_LICENCIA` · `DESACTUALIZADA` · `EN_CONFLICTO` · `VACIO` · `PARCIAL` ·
`CONFIANZA_BAJA` · `SIMULADO` · `SIN_DENOMINADOR` · `FUERA_DE_ALCANCE` ·
`SIN_REVISAR`

## Correr

```bash
npm install
npm run dev      # desarrollo
npm run build    # a dist/
```

## Lo que este prototipo NO resuelve

Blueprint se define como optimizado para *«complex, data-dense web interfaces for
desktop applications»*. Es la caja de herramientas de aquello que
[ADR-15](../../docs/adr/ADR-15-sin-frontend-generico.md) prohibió y
[ADR-23](../../docs/adr/ADR-23-menos-portafolio-mas-explicacion.md) retiró. Este
prototipo lo usa a propósito para enseñar de qué es capaz, no para proponer que
sustituya al visor: colisiona con Tailwind, impone su lenguaje visual y pesa.

Donde sí encajaría es en la cola de validación de la fase B — bandeja, estados,
asignación, operaciones en lote — cuando exista ruta de escritura.
