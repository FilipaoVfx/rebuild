---
name: Urban Recovery Intelligence — Visor
description: A signed technical concept on white paper; the city is its cartographic annex.
colors:
  sheet: "#ffffff"
  sheet-2: "#f4f5f7"
  sheet-3: "#e8eaee"
  rule: "#dde0e5"
  rule-2: "#c2c7ce"
  toner: "#17181b"
  graphite-700: "#33363c"
  graphite-600: "#484c54"
  graphite-500: "#5c616a"
  graphite-400: "#7a7f88"
  mark: "#17181b"
  stamp: "#5b3aa3"
  ok: "#1d6b45"
  warn: "#8a5300"
  bad: "#a8261d"
  unknown: "#6b7079"
typography:
  letterhead:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.12em"
    fontVariation: "'wdth' 122"
  document-title:
    fontFamily: "Source Serif 4 Variable, Source Serif 4, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.25
  consideration:
    fontFamily: "Source Serif 4 Variable, Source Serif 4, Georgia, serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.5
  note:
    fontFamily: "Source Serif 4 Variable, Source Serif 4, Georgia, serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.625
  figure-lg:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum'"
  figure-md:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    fontFeature: "'tnum'"
  body:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "'tnum'"
  label:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  mono:
    fontFamily: "ui-monospace, SF Mono, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "10px"
    lineHeight: 1.625
rounded:
  sheet: "0px"
  sm: "3px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  panel:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "16px 0"
  chip:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.graphite-700}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
  chip-active:
    backgroundColor: "{colors.toner}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
  button-primary:
    backgroundColor: "{colors.toner}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "4px 10px"
  button-primary-hover:
    backgroundColor: "{colors.graphite-700}"
  segmented-active:
    backgroundColor: "{colors.toner}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "3px 8px"
  segmented:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.graphite-600}"
    rounded: "{rounded.sheet}"
    padding: "3px 8px"
  input-search:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.toner}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  status-badge:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
    typography: "{typography.label}"
  stamp:
    textColor: "{colors.stamp}"
    rounded: "{rounded.sheet}"
    padding: "3px"
  rotulo:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.toner}"
    rounded: "{rounded.sheet}"
    width: "248px"
---

# Design System: Urban Recovery Intelligence — Visor

## Overview

**Creative North Star: "El concepto técnico firmado"**

The viewer reads as a document a technical office issues and signs: a white bond sheet, toner-black type, fine rules instead of boxes, and one heavy rule under the letterhead. The considerations on the left say what the evidence covers and where it stops; the city on the right is the cartographic annex that proves them. The stamp is the only place the document marks itself, in violet ink, and that ink appears nowhere else except where the concept certifies a limit.

Density is that of an administrative document: small, exact sans-serif for the interface, a text serif for the document's voice, and tabular numbers written the Colombian way (69,6 · 477.027). Everything is still. Only three things move: the stamp presses once on load, a reference rule draws when a consideration or section is pointed at, and panels fade up when they open. The dark GIS dashboard of floating panels and layer checkboxes was deliberately discarded. The sheet is light and flat.

What the evidence doesn't cover is shown, never left blank or drawn as a zero. One hatch sign means "sin información" on both the map and the interface. Unknown gets its own grey, dashed treatment, never green and never red.

**Key Characteristics:**
- White paper, toner ink, hairline rules; a 3px toner rule under the letterhead.
- Expanded Archivo capitals for the letterhead and section titles; Source Serif 4 for the document's voice.
- Violet stamp ink only where the concept certifies something.
- One hatch for "sin información", shared by map and UI.
- The map annex takes most of the sheet, framed by a single toner line.
- Honest absences: "sin fuente", hatch, dashed borders, never an invented zero.

## Colors

A monochrome paper-and-toner system with one rare certifying ink and four printed state colors.

### Primary
- **Toner Black** (toner): All primary text, the heavy letterhead rule, the annex frame line, active tabs and their underline, active chips and segmented buttons, the primary button. Toner is both ink and the selection color.
- **Selection Mark** (mark): An alias of toner. Selection and emphasis are made with ink, not a hue. Used for selected comunas (10% tint), compare state (15% tint) and the search field focus border (full toner, alongside the global 2px focus outline).

### Secondary
- **Stamp Violet** (stamp): Certifying ink. Used only on the SALIDA CONSULTIVA stamp, the covered-area (AOI) frame on the map and on the local locator, consideration 2 (coverage) and its annex marker, LÍMITE labels in the context introductions, and license-blocked marks (a dashed checkbox plus "bloqueada por licencia"). The browser's own surfaces are the single tinted exception: text selection is stamp at 22% and the text caret is stamp.

### Tertiary
- **Printed Green** (ok): Condition met, a positive contribution in signed bars, real data, high confidence.
- **Printed Amber** (warn): With reservations, and axes that are covered but don't rank anything.
- **Printed Red** (bad): Blocked, a negative contribution, sources that exist and can't be used.
- **Unknown Grey** (unknown): Unverified. It is a separate state and never collapses into ok or bad.

### Neutral
- **Sheet** (sheet): Page, panels, the rótulo, fields, chip rest state.
- **Sheet 2** (sheet-2): Quiet inset blocks such as the technical toggle, comuna chips and NO_BUILD notices.
- **Sheet 3** (sheet-3): Bar tracks.
- **Rule** (rule): Hairline section dividers and inset borders.
- **Rule 2** (rule-2): Chip and segmented borders, inactive context swatches, scrollbar thumb.
- **Graphite 700 → 400** (graphite-700, graphite-600, graphite-500, graphite-400): The secondary text ladder. 500 is labels and metadata, 400 is separators, hints and the hatch line itself.

### Map inks (sidecar)
Sequential ramps are six stops on one shared lightness curve (HSL L 91→28), one hue per context. Roads get darker and wider as their OSM class rises. Buildings are pale paper-grey fabric. The exact values are in `.impeccable/design.json` → `extensions.mapInks`.

### Named Rules
**The Stamp Ink Rule.** Violet means the document certifies something: a non-binding output, the covered area, a limit, a license block. If the element doesn't certify, it doesn't get violet.

**The Paper Ramp Rule.** On paper, lighter to darker means more value, and every context uses the same lightness curve. Changing context changes the hue, never how the map reads. No ramp or map ink may fall in the 250–300° hue band, because that band belongs to the stamp.

**The Unknown Is Its Own Color Rule.** Unknown uses the unknown grey with a dashed border or the hatch. It is never shown as green or red.

**The Ink Not Color Rule.** Selection, active state and emphasis are toner (solid, or tinted with alpha), never a hue.

## Typography

**Display Font:** Archivo Variable, width axis (with Helvetica Neue, Arial)
**Body Font:** Archivo Variable (with Helvetica Neue, Arial)
**Voice Font:** Source Serif 4 Variable, optical-size axis (with Georgia)
**Label/Mono Font:** system ui-monospace, only for hashes and reproducibility blocks

Both families are bundled with the build, so no font bytes come from a third-party server.

**Character:** The letterhead's expanded capitals give the sheet its official register. The serif is the concept speaking. Normal-width Archivo is the office's working hand.

### Hierarchy
- **Letterhead** (700, 11px default, 9.5–13px by context, 0.12em tracking, 122% width, uppercase): The issuer name (13px desktop, 10.5px with 0.07em tracking on mobile), section titles (CONSIDERACIONES, PROBLEMA), the annex title, the rótulo head, the stamp text.
- **Document title** (Source Serif 4, 400, 17px desktop / 14px mobile): "Concepto técnico de caracterización". The concept number sits beside it in 13px graphite.
- **Consideration** (Source Serif 4, 400, 15.5px, 1.5, pretty wrap): Numbered considerations and context summaries (15px). Key figures inside are bold.
- **Figure** (Archivo 700, tabular; 40px with −0.02em tracking / 26px / 19px): The Stat values.
- **Body** (Archivo 400–600, 12.5–13px): Navigation, tabs, list rows, breadcrumbs.
- **Label** (Archivo 500, 11px, graphite-500): Stat labels, badges, metadata. The 10–10.5px range is reserved for the rótulo, legends and attribution.
- **Note** (Source Serif 4, 12px, relaxed, graphite-500, led by a 10px hairline dash): Footnotes on any figure that isn't a direct measurement.

### Named Rules
**The Letterhead Rule.** Expanded tracked capitals name a part of the document: the issuer, a section, an annex, the rótulo, the stamp. They are the heading itself. Never put them as a kicker above another heading.

**The Serif Voice Rule.** The serif carries what the concept states: the title, considerations, summaries, notes, and the annex question. Controls, data and chrome stay in Archivo.

**The Comma Decimal Rule.** Numbers use tabular figures in es-CO format: comma for decimals, point for thousands, "—" when there is no value, and $…M / $…MM for pesos. A decimal point never appears on screen.

## Layout

Desktop (≥1024px) runs as one column of full-width chrome, then a row:
- **Letterhead** (16px/24px gutters). On the left, the issuer emblem, name, title and city line. On the right, a definition list with the cut date, character and issuer, then the stamp. A 3px toner rule sits below.
- **Section index** below that, with roman folios I–V in the order of the argument.
- **Work column** of fixed width (420px) on the left, with a hairline right border and its own scroll. It remounts on every section change, so each folio opens at its start.
- **Cartographic annex** filling the rest (about 70% of the width). Inside 8–12px padding, a single 1px toner frame line contains the map. The rótulo sits bottom-right inside the frame.
- **Ficha** as a third 440px column that appears only when a site is selected.

Mobile: the annex leads at 52vh and the work column follows. The rótulo gives way to a two-entry key in the top-left: "área cubierta" (stamp frame) and "sin evidencia" (hatch). The ficha becomes a full-screen overlay. The letterhead drops the definition list, folds the cut date into the city line, and uses the compact stamp.

Rhythm: panels are 16px vertical with a top hairline. Considerations are 12px vertical on a 28px number margin. Chip gaps are 6px and inset boxes use 10px padding. Tailwind's default breakpoints apply (sm 640, md 768, lg 1024).

### Named Rules
**The Annex Dominates Rule.** The map is the concept's evidence and always gets the largest share of the sheet. Chrome never floats across it except the rótulo, north indicator, compare tray and swipe handle.

## Elevation & Depth

The sheet is flat, and depth comes from rules, never lift. Sections separate with hairlines and air. Only instruments that float over the map carry a shadow, and that shadow is soft and low.

### Shadow Vocabulary
- **Map instrument** (`box-shadow: 0 2px 10px -4px rgb(23 24 27 / .25)`): The rótulo and the compare tray, both of which also carry a 1px toner border.
- **Map control** (Tailwind `shadow-lg` tinted toner at 10%): The circular north indicator and the swipe handle.

### Named Rules
**The Flat Sheet Rule.** Nothing on the paper casts a shadow. Only instruments lying over the map annex get the soft instrument shadow.

## Shapes

Rules and hairlines do the work boxes would. Document structure (panels, the annex frame, the letterhead rule, the stamp, the rótulo, segmented buttons, the primary button) has square corners. Small working pieces (chips, status badges, fields, inset notices, locator frames, photo tiles) get a barely-softened 3px corner. Full circles are only for map controls (north, swipe) and point swatches.

Borders carry meaning:
- solid hairline for structure
- toner 1px for things the document asserts (annex frame, rótulo)
- dashed graphite for unknown or unsourced
- dashed stamp for license-blocked

### Named Rules
**The Rule Not Box Rule.** A section is a top hairline and air, never a card. Bordered boxes are reserved for instruments: fields, chips, notices, the rótulo and the annex frame.

**The One Sign for Absence Rule.** "Sin información" has exactly one sign, a 45° hatch of 1px graphite-400 lines every 6px (CSS `repeating-linear-gradient(-45deg, …)`). On the map it is geometry: 45° lines about 178 m apart outside the covered area, under a white veil. The same sign fills empty bars, the empty state, the NoSource swatch and the legend key. Never draw missing data as zero or as empty white.

## Components

### Buttons
- **Shape:** Square (0px).
- **Primary:** Toner fill, white 12px semibold text, 4px 10px padding. Hover goes to graphite-700.
- **Text actions:** Underlined graphite-500 text that turns toner on hover ("limpiar", "comparar").
- **Icon button:** A 28px square with a 3px corner and a rule-2 border. It turns toner on hover and holds a drawn Mark stroke.
- **Focus:** A global 2px toner outline at 2px offset.

### Chips
- **Style:** 3px corner, 1px rule-2 border, white fill, 12px graphite-700 text, 3px 8px padding.
- **State:** Hover gives a toner border and text. Active is a solid toner fill with white text. Chips carry `aria-pressed`.

### Segmented switch (map type)
- Square cells with a rule-2 outer border and dividers, 11.5px medium text. The active cell is solid toner. Disabled cells sit at 40% opacity with a reason in the title.

### Tabs (section index and annex contexts)
- Inactive tabs are graphite-500 text. Active tabs are toner semibold with a 2px toner underline that draws left to right (rule-draw).
- Section tabs lead with a bold roman folio. Context tabs lead with an 8px square swatch showing the context ramp's stop 4 (rule-2 when inactive).

### Inputs / Fields
- **Style:** White fill, 1px rule border, 3px corner, 13px toner text, graphite-400 placeholder, 10px 12px padding.
- **Focus:** The border shifts to toner and the global 2px toner focus outline stays visible.

### Status badge and marks
- Status uses a colored border at about 40% and matching text around a drawn Mark (check, cross, bang, question), a single 1.5px stroke on a 10-unit grid. UNKNOWN is dashed graphite. Unicode glyphs are not used as icons.

### Cards / Containers
- **Panel:** Top hairline only, no fill, no radius, 16px vertical padding.
- **Inset notice:** 3px corner with a tinted border and a 5–10% fill of its state color, 11px text. Dashed graphite is used when it lists unknowns.

### Signature: Stamp (SALIDA CONSULTIVA)
Two nested stamp-violet borders (2.5px outer, 1px inner). "Salida consultiva" is set in 13px letterhead (10px compact), and "no vinculante" in 8.5px semibold with 0.18em tracking. The stamp is rotated −4° with multiply blend and a fractal-noise ink filter that specks it like real ink. It presses once on load (stamp-press, 0.42s, exponential ease-out, 0.25s delay).

### Signature: Consideration and Support
A numbered consideration has a bold 22px number cell in the margin and serif body text. On hover or focus, the number inverts to a solid toner cell (solid stamp for the coverage consideration) and its reference marker is drawn on the annex. Under each consideration, Support shows its independent sources as taut vertical members on a baseline (one per source). With no support, a slack dashed curve reads "sin soporte independiente".

### Signature: Rótulo
The annex title block, 248px wide, white, with a 1px toner border and the instrument shadow. It holds a letterhead head ("Anexo 1 · <contexto>"), the ramp strip or categorical key, and the hatch key "fuera del área cubierta: sin evidencia". A provenance footer lists sources and links blocked sources to section V in bad red.

### Signature: Annex coverage
Outside the AOI, a white veil (about 47% alpha, stronger while pointed at) sits under the geometric hatch. The AOI frame is a stamp line, 2px at rest and 5px when consideration 2 is pointed at. Changes transition over 320ms.

### Bars
Bars are 6px, square, and sit on a sheet-3 track, filled with toner or a ramp sample. With no value, the bar is hatch at 60%. Signed bars are divergent around a center hairline, with ok to the right and bad to the left.

## Do's and Don'ts

### Do:
- **Do** separate sections with a top hairline (rule) and air. Keep the 3px toner rule under the letterhead only.
- **Do** reserve stamp violet for what the concept certifies: the stamp, the covered-area frame, the coverage consideration, LÍMITE labels, license-blocked marks.
- **Do** use the single 45° hatch for every "sin información", on the map and in the UI alike.
- **Do** keep every sequential ramp on the shared light→dark curve (more ink is more value) and outside the 250–300° hue band.
- **Do** say absences in words ("sin fuente", "barrio sin fuente", "—") with the hatch or a dashed border.
- **Do** format every number in es-CO with tabular figures.
- **Do** draw icons as single-stroke SVG Marks.
- **Do** keep motion to the stamp press, the rule draw, and short fade-ups, and honor reduced motion.

### Don't:
- **Don't** return to the dark GIS dashboard of floating panels and layer checkboxes.
- **Don't** use violet for location emphasis, selection, hover, brand color or decoration.
- **Don't** show unknown as green or red, or draw a missing value as zero.
- **Don't** wrap sections in cards or lift anything on the paper with a shadow. Shadows belong only to instruments over the map.
- **Don't** put expanded letterhead capitals above a heading as a kicker. They are the heading.
- **Don't** use Unicode glyphs (▲ ▼ ✓ ✕) as icons.
- **Don't** set controls or data in the serif, or the document's statements in the sans.
- **Don't** show a decimal point, or fetch fonts from a third-party server.
