import { useState, type ReactNode } from 'react';
import { dec, fecha, n } from '../lib/format';
import { sourceLine } from '../lib/place';
import { useStore, type LayerKey } from '../state/store';
import { Icon } from './icons';
import { AnimatedBackground } from './motion-primitives/animated-background';
import { DAMAGE_RGB, POP_RAMP, POP_RAMP_DARK } from './MapWorkspace';

const rgb = (c: number[]) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

/** Arriba a la izquierda: qué cubre este mapa, antes de mirar nada. */
export function StudyCard() {
  const { territory, sites } = useStore();
  const [open, setOpen] = useState(false);
  const counts = territory?.counts;
  const aoi = territory?.aoi;
  const ev = territory?.event;
  return (
    <div data-uri="study-card" className="float pointer-events-auto w-[330px] max-w-[calc(100vw-16px)] px-4 py-3.5">
      <div className="flex items-start gap-3">
        <Icon.Pin size={24} className="mt-0.5 shrink-0 text-cobalt" />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[16.5px] leading-tight font-semibold">Sector de estudio · Pereira</p>
          <p className="num mt-0.5 text-[14px] text-ink-2">
            {n(counts?.evidence ?? null)} observaciones · {n(counts?.sites ?? sites.length)} sitios
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Qué cubre el sector de estudio"
          className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-wash"
        >
          <Icon.Info size={19} />
        </button>
      </div>
      <p className="mt-3 border-t border-rule pt-2.5 text-[13.5px] leading-snug text-ink-2">
        Cobertura parcial: este mapa no representa toda la ciudad.
      </p>
      {open && aoi && (
        <div className="animate-rise mt-2.5 space-y-2 border-t border-rule pt-2.5 text-[13.5px] leading-snug text-ink-2">
          <p>
            Es el recuadro de la activación {aoi.source}: {dec(aoi.bbox_km2, 1)} km²,{' '}
            {aoi.share_of_perimeter !== null ? `${n(aoi.share_of_perimeter * 100)} % del perímetro urbano` : 'sin medida del perímetro'}.
            {aoi.evidence_km2 !== null && <> La evidencia de daño se concentra en {dec(aoi.evidence_km2, 1)} km².</>}
          </p>
          {ev && (
            <p>
              Evento: sismo M{dec(ev.magnitude, 1)} del {fecha(ev.occurred_at)}, a {dec(ev.depth_km, 0)} km de
              profundidad.
            </p>
          )}
          <p className="text-ink-3">Fuera del recuadro, el mapa se vela: allí no hay evidencia, no ausencia de daño.</p>
        </div>
      )}
    </div>
  );
}

const LAYER_BUTTONS: { key: LayerKey; label: string; icon: ReactNode }[] = [
  { key: 'territorio', label: 'Territorio', icon: <Icon.Map size={20} /> },
  { key: 'dano', label: 'Daño', icon: <Icon.Alert size={20} /> },
  { key: 'poblacion', label: 'Población', icon: <Icon.People size={20} /> },
  { key: 'espacio', label: 'Espacio público', icon: <Icon.Tree size={20} /> },
  { key: 'equipamientos', label: 'Equipamientos', icon: <Icon.Building size={20} /> },
];

export function LayerBar() {
  const { layer, setLayer } = useStore();
  return (
    <div role="radiogroup" aria-label="Capa del mapa" className="float pointer-events-auto flex max-w-full overflow-x-auto rounded-[10px] p-1.5">
      <AnimatedBackground
        defaultValue={layer}
        onValueChange={(id) => { if (id) setLayer(id as LayerKey); }}
        className="rounded-[6px] bg-cobalt"
        transition={{ type: 'spring', bounce: 0.12, duration: 0.32 }}
      >
        {LAYER_BUTTONS.map((b) => (
          <button
            key={b.key}
            data-id={b.key}
            type="button"
            data-uri="layer"
            data-layer={b.key}
            data-active={b.key === layer}
            role="radio"
            aria-checked={b.key === layer}
            className="h-10 shrink-0 items-center px-3 text-[14.5px] whitespace-nowrap text-ink transition-colors data-[checked=true]:font-semibold data-[checked=true]:text-on-cobalt"
          >
            <span className="flex items-center gap-2">{b.icon}{b.label}</span>
          </button>
        ))}
      </AnimatedBackground>
    </div>
  );
}

function Swatch({ color, dashed = false, round = false, line = false }: {
  color: string; dashed?: boolean; round?: boolean; line?: boolean;
}) {
  if (dashed) {
    return <span className="inline-block h-3.5 w-6 rounded-[2px] border-[1.5px] border-dashed" style={{ borderColor: color }} />;
  }
  if (line) return <span className="inline-block h-0 w-6 border-t-2" style={{ borderColor: color }} />;
  return (
    <span
      className={`inline-block shrink-0 ${round ? 'size-3 rounded-full ring-[1.5px] ring-white' : 'h-3.5 w-6 rounded-[2px]'}`}
      style={{ background: color }}
    />
  );
}

function Item({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">{swatch}{children}</span>;
}

export function Legend() {
  const { layer, selectedSiteId, settings, theme } = useStore();
  const ramp = theme === 'dark' ? POP_RAMP_DARK : POP_RAMP;
  const items: ReactNode[] = [];
  if (layer === 'territorio') {
    items.push(<Item key="s" swatch={<Swatch color="var(--color-ink)" round />}>Sitio con evidencia</Item>);
  }
  if (layer === 'dano') {
    items.push(
      <Item key="p" swatch={<Swatch color={rgb(DAMAGE_RGB.POSSIBLY_DAMAGED)} round />}>Posiblemente dañado</Item>,
      <Item key="d" swatch={<Swatch color={rgb(DAMAGE_RGB.DAMAGED)} round />}>Dañado</Item>,
      <Item key="x" swatch={<Swatch color={rgb(DAMAGE_RGB.DESTROYED)} round />}>Destruido</Item>,
    );
  }
  if (layer === 'poblacion') {
    items.push(
      <span key="r" className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        Menos
        <span className="flex">{ramp.map((c, i) => <span key={i} className="h-3.5 w-4" style={{ background: rgb(c) }} />)}</span>
        más personas por celda (estimación)
      </span>,
    );
    if (selectedSiteId) items.push(<Item key="c" swatch={<Swatch color="var(--color-cobalt)" line />}>Área a 10 min a pie</Item>);
  }
  if (layer === 'espacio') {
    items.push(
      <Item key="m" swatch={<Swatch color="rgb(96 158 99 / .7)" />}>Espacio público municipal</Item>,
      <Item key="o" swatch={<Swatch color="rgb(150 196 140 / .7)" />}>Zona verde OSM</Item>,
    );
  }
  if (layer === 'equipamientos') {
    items.push(
      <Item key="m" swatch={<Swatch color="rgb(55 97 122 / .35)" />}>Equipamiento municipal</Item>,
      <Item key="o" swatch={<Swatch color="rgb(55 97 122)" round />}>Equipamiento OSM</Item>,
    );
  }
  if ((layer === 'espacio' || layer === 'equipamientos') && selectedSiteId) {
    items.push(<Item key="r5" swatch={<Swatch color="var(--color-cobalt)" line />}>{settings.radius} m del sitio</Item>);
  }
  return (
    <div data-uri="legend" className="float pointer-events-auto grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-3 text-[13px] text-ink-2">
      <Item swatch={<Swatch color="var(--color-map-water)" />}>Río / cuerpo de agua</Item>
      <Item swatch={<Swatch color="var(--color-map-green)" />}>Zona verde</Item>
      <Item swatch={<Swatch color="var(--color-map-urban)" />}>Área urbana</Item>
      <Item swatch={<Swatch color="var(--color-ink-3)" dashed />}>Límite de comuna</Item>
      {items.length > 0 && <span className="col-span-2 my-0.5 h-px bg-rule" aria-hidden="true" />}
      {items.map((it, i) => (
        <span key={i} className={items.length === 1 || layer === 'poblacion' ? 'col-span-2' : ''}>{it}</span>
      ))}
    </div>
  );
}

/** Abajo a la derecha: de dónde sale lo que se ve. Sale de la procedencia, no de una constante. */
export function ProvenanceBar() {
  const { provenance, setOverlay } = useStore();
  const line = sourceLine(provenance);
  return (
    <button
      type="button"
      onClick={() => setOverlay('fuentes')}
      data-uri="provenance"
      title="Ver fuentes y licencias"
      className="pointer-events-auto flex max-w-full items-center gap-2 rounded-[6px] bg-card/85 px-2.5 py-1 text-left text-[11.5px] leading-snug text-ink-2 backdrop-blur-sm hover:text-ink"
    >
      <span className="min-w-0 truncate">{line.join(' · ')} · Área de estudio EMSR916 · datos n.º {provenance.data_version}</span>
      <Icon.Info size={14} className="shrink-0" />
    </button>
  );
}
