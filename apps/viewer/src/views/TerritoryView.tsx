import { useMemo } from 'react';
import { fecha, n, pct } from '../lib/format';
import { useStore } from '../state/store';
import type { GeoJSON, Territory } from '../types';
import { ContextIntro } from '../components/ContextIntro';
import { Empty, Note, Panel, SectionTitle, Stat } from '../components/ui';

/**
 * ¿Dónde estamos? (ADR-22)
 *
 * Sitúa antes de evaluar: el país, el departamento, la ciudad, la parte de la
 * ciudad que este visor cubre y por qué esa; el evento; las comunas; los ríos;
 * la imagen satelital antes y después. Termina en un enlace a Situación. Las
 * recomendaciones no aparecen aquí a propósito: un puntaje sin lugar no dice
 * nada.
 */
export function TerritoryView() {
  const {
    territory, layers, setView, setContext, highlightedAdminId, setHighlightedAdminId,
    sentinel, imagery, setImagery, imageryCollection, setImageryCollection,
    terrain, showTerrain, setShowTerrain, isStatic, context,
  } = useStore();

  if (!territory) {
    return (
      <div className="p-3">
        <Panel className="p-4">
          <SectionTitle>¿Dónde estamos?</SectionTitle>
          <div className="mt-2.5"><Empty>Cargando el territorio…</Empty></div>
        </Panel>
      </div>
    );
  }

  const { city, urban_perimeter: perimeter, aoi, event, counts, comunas, rivers, imagery: img } = territory;
  const conSitios = comunas.filter((c) => c.sites > 0);
  const sinSitios = comunas.filter((c) => c.sites === 0);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* El primer panel sigue al contexto del mapa (ADR-23): «¿Dónde estamos?»
          es el de Territorio; cualquier otro contexto explica aquí sus variables. */}
      {context !== 'TERRITORIO' ? <ContextIntro /> : (
      <Panel data-uri="where-are-we" className="p-4">
        <SectionTitle>¿Dónde estamos?</SectionTitle>
        <p className="mt-2 text-[11px] tracking-wide text-mute-400">
          {city?.country ?? 'Colombia'} › {city?.department ?? 'Risaralda'} › <b className="text-paper">{city?.display_name ?? 'Pereira'}</b>
        </p>
        <Locator territory={territory} regions={layers.reference_regions} admin={layers.admin_areas} />
        <p className="mt-3 text-[13px] leading-relaxed text-mute-200">
          <b className="text-paper">{city?.display_name ?? 'Pereira'}</b>
          {city?.population && (
            <> tiene <b className="text-paper">{n(city.population)}</b> habitantes</>
          )}
          {perimeter && (
            <> en un perímetro urbano de <b className="text-paper">{perimeter.area_km2.toLocaleString('es-CO')} km²</b></>
          )}.
          {' '}Este visor cubre el rectángulo marcado: <b className="text-paper">{aoi.bbox_km2.toLocaleString('es-CO')} km²</b>
          {aoi.share_of_perimeter !== null && <> ({pct(aoi.share_of_perimeter)} del perímetro)</>}, que es donde
          Copernicus EMS apuntó el sensor tras el sismo. No es toda la ciudad.
        </p>
        {city?.population && (
          <Note>Población según {city.population_source}{city.wikidata ? ` (${city.wikidata})` : ''}. No es el censo.</Note>
        )}
      </Panel>
      )}

      <Panel className="p-4">
        <SectionTitle>El sismo</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat label="Magnitud" value={`M${event.magnitude.toLocaleString('es-CO')}`} size="lg" tone="accent"
                sub={`${event.magnitude_type} · ${event.depth_km.toLocaleString('es-CO')} km de profundidad`} />
          <Stat label="Fecha" value={fecha(event.occurred_at.slice(0, 10))} size="sm"
                sub={`${event.occurred_at.slice(11, 16)} UTC`} />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-mute-200">
          Epicentro {event.epicentre.label}
          {event.distance_km !== null
            ? <>, a <b className="text-paper">{n(event.distance_km)} km</b> de {city?.display_name ?? 'Pereira'}.</>
            : <>. Distancia a la ciudad <span className="text-mute-400">sin fuente</span>.</>}
          {' '}{city?.display_name ?? 'Pereira'} es uno de <b className="text-paper">{n(event.municipalities_affected)}</b> municipios
          afectados por un evento regional.
        </p>
        <Note>
          {event.source} ({event.event_id}). Cartografía rápida: Copernicus EMS, activación {event.activation_id}.
        </Note>
      </Panel>

      <div className="grid grid-cols-3 gap-3">
        <Panel className="p-3">
          <Stat size="sm" label="Observaciones" value={n(counts.evidence)} sub="de daño, Copernicus" />
        </Panel>
        <Panel className="p-3">
          <Stat size="sm" label="Sitios" value={n(counts.sites)} sub={`${n(counts.candidates)} candidatos`} />
        </Panel>
        <Panel className="p-3">
          <Stat size="sm" label="Personas" value={n(counts.population_measured)} sub="medidas en el AOI" />
        </Panel>
      </div>

      <Panel className="p-4">
        <SectionTitle right={<span className="text-[10px] text-mute-400">{comunas.length} en el AOI</span>}>
          Comunas
        </SectionTitle>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {conSitios.map((c) => {
            const active = highlightedAdminId === c.osm_id;
            return (
              <button
                key={c.osm_id}
                data-uri="comuna"
                onClick={() => setHighlightedAdminId(active ? null : c.osm_id)}
                className={[
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors',
                  active ? 'border-accent/60 bg-accent/10 text-paper' : 'border-ink-700 bg-ink-850 text-mute-200 hover:border-mute-400/50',
                ].join(' ')}
              >
                <span>{c.display_name}</span>
                <span className="num text-[10px] text-mute-400">{c.sites}</span>
              </button>
            );
          })}
        </div>
        {sinSitios.length > 0 && (
          <p className="mt-2 text-[10px] leading-snug text-mute-500">
            Sin sitios: {sinSitios.map((c) => c.display_name).join(', ')}.
          </p>
        )}
        <Note>
          El número es cuántos sitios de oportunidad caen en cada comuna. Clic para encuadrarla.
          {' '}{n(counts.neighborhoods_in_aoi)} barrios de OSM intersectan el AOI.
        </Note>
      </Panel>

      {rivers.length > 0 && (
        <Panel className="p-4">
          <SectionTitle>Ríos</SectionTitle>
          <p className="mt-2 text-[12px] leading-relaxed text-mute-200">
            {rivers.map((r, i) => (
              <span key={r.display_name}>
                {i > 0 && ' · '}
                <b className="text-paper">{r.display_name}</b>
                <span className="text-mute-400"> {(r.length_m / 1000).toFixed(1)} km</span>
              </span>
            ))}
          </p>
          <Note>Longitud dentro del extracto de OSM, no del cauce completo.</Note>
        </Panel>
      )}

      <Panel className="p-4">
        <SectionTitle>Imagen del territorio</SectionTitle>
        <div className="mt-2.5 flex flex-col gap-2">
          <ImageryToggle
            checked={imagery === 'sentinel'}
            disabled={!sentinel || !img.sentinel.available}
            onChange={(v) => setImagery(v ? 'sentinel' : 'none')}
            label="Sentinel, antes y después"
            badge="observación"
            help={sentinel
              ? `${img.sentinel.scenes} escenas versionadas. Cortina para comparar la fecha anterior y la posterior al ${fecha(sentinel.event_date)}.`
              : 'Sin vistas versionadas en este despliegue: la capa no se publica.'}
          />
          {imagery === 'sentinel' && (
            <div className="ml-7 flex gap-1.5">
              {(['s2', 's1'] as const).map((c) => (
                <button
                  key={c}
                  data-uri="imagery-collection"
                  onClick={() => setImageryCollection(c)}
                  className={[
                    'rounded-md border px-2 py-1 text-[10px]',
                    imageryCollection === c ? 'border-accent/60 bg-accent/10 text-paper' : 'border-ink-700 text-mute-300',
                  ].join(' ')}
                >
                  {c === 's2' ? 'Sentinel-2 óptico' : 'Sentinel-1 radar'}
                </button>
              ))}
            </div>
          )}
          {img.ortofotos.map((o) => (
            <ImageryToggle
              key={o.source_id}
              checked={imagery === o.source_id}
              disabled={o.status !== 'AVAILABLE'}
              onChange={(v) => setImagery(v ? o.source_id : 'none')}
              label={o.display_name}
              badge={o.status === 'AVAILABLE' ? 'real' : 'sin fuente'}
              help={o.status === 'AVAILABLE'
                ? `Teselas propias${o.index?.acquisition ? `, tomadas el ${fecha(o.index.acquisition)}` : ''}.`
                : `No se publica: ${o.reason}. Disponible y permitido no son lo mismo.`}
            />
          ))}
          <ImageryToggle
            checked={showTerrain}
            disabled={!terrain}
            onChange={setShowTerrain}
            label="Relieve real del terreno"
            badge="real"
            help={terrain
              ? 'Teselas Terrain-RGB de Copernicus DEM versionadas en el repositorio.'
              : 'Sin teselas versionadas en este despliegue: la capa no se publica.'}
          />
        </div>
        {sentinel && (
          <Note>{sentinel.limitation}</Note>
        )}
      </Panel>

      <Panel className="p-4">
        <SectionTitle>Qué cubre este visor</SectionTitle>
        <p className="mt-2 text-[12px] leading-relaxed text-mute-200">
          {aoi.evidence_km2 !== null && (
            <>La evidencia de daño cubre <b className="text-paper">{aoi.evidence_km2.toLocaleString('es-CO')} km²</b> del rectángulo: </>
          )}
          {n(counts.evidence)} observaciones de foto-interpretación agrupadas en {n(counts.sites)} sitios,
          sobre {n(counts.buildings)} huellas de edificio y {n(counts.landmarks)} lugares con nombre.
        </p>
        <Note>
          Es un sector de Pereira, no la ciudad. La cobertura satelital es donde se apuntó el sensor,
          no donde hubo daño: lo que queda fuera del rectángulo es invisible para este sistema.
          {isStatic && ' Modo estático: los escenarios van precalculados.'}
        </Note>
      </Panel>

      <button
        data-uri="territory-cta"
        onClick={() => { setHighlightedAdminId(null); setContext('SITUACION'); setView('situacion'); }}
        className="rounded-xl bg-accent px-4 py-3 text-left text-[13px] font-semibold text-ink-950 hover:bg-accent/85"
      >
        Ver la situación →
        <span className="block text-[11px] font-normal text-ink-900/80">¿Qué está pasando en el territorio?</span>
      </button>
    </div>
  );
}

/**
 * Localizador en dos niveles: el país con el departamento y la ciudad, y el
 * perímetro urbano con el rectángulo del AOI. Contornos de Natural Earth
 * (dominio público) y de OSM, ya cargados; nada externo (fuentes.md §11).
 */
function Locator({ territory, regions, admin }: {
  territory: Territory; regions?: GeoJSON; admin?: GeoJSON;
}) {
  const country = regions?.features.find((f) => f.properties.label === 'country');
  const state = regions?.features.find((f) => f.properties.label === 'state');
  const perimeter = admin?.features.find((f) => Number(f.properties.admin_level) === 7);
  const city = territory.city;

  const national = useMemo(() => {
    if (!country) return null;
    const rings = ringsOf(country);
    const bb = bboxOfRings(rings);
    const proj = projector(bb, 150, 150, 6);
    return {
      country: rings.map((r) => pathOf(r, proj)),
      state: state ? ringsOf(state).map((r) => pathOf(r, proj)) : [],
      city: city ? proj([city.lon, city.lat]) : null,
    };
  }, [country, state, city]);

  const local = useMemo(() => {
    if (!perimeter) return null;
    const rings = ringsOf(perimeter);
    const bb = bboxOfRings(rings);
    const proj = projector(bb, 200, 110, 8);
    const [w, s, e, nn] = territory.aoi.bbox;
    return {
      perimeter: rings.map((r) => pathOf(r, proj)),
      aoi: pathOf([[w, s], [e, s], [e, nn], [w, nn], [w, s]], proj),
      city: city ? proj([city.lon, city.lat]) : null,
    };
  }, [perimeter, territory, city]);

  return (
    <div data-uri="locator" className="mt-3 flex items-stretch gap-3">
      <div className="flex-none rounded-lg border border-ink-700 bg-ink-950 p-1.5">
        {national ? (
          <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="Colombia, Risaralda y Pereira">
            {national.country.map((d, i) => (
              <path key={`c${i}`} d={d} fill="var(--color-ink-800)" stroke="var(--color-ink-500)" strokeWidth="0.8" />
            ))}
            {national.state.map((d, i) => (
              <path key={`s${i}`} d={d} fill="rgb(240 180 41 / .45)" stroke="var(--color-accent)" strokeWidth="0.8" />
            ))}
            {national.city && (
              <>
                <circle cx={national.city[0]} cy={national.city[1]} r="3.2" fill="var(--color-accent)" />
                <text x={national.city[0] + 6} y={national.city[1] + 3} fontSize="9" fill="var(--color-paper)">
                  {city?.display_name ?? 'Pereira'}
                </text>
              </>
            )}
          </svg>
        ) : <div className="h-[150px] w-[150px]" />}
      </div>
      <div className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950 p-1.5">
        {local ? (
          <svg width="100%" height="150" viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet" role="img"
               aria-label="Perímetro urbano de Pereira y el área que cubre el visor">
            {local.perimeter.map((d, i) => (
              <path key={`p${i}`} d={d} fill="var(--color-ink-800)" stroke="var(--color-mute-400)" strokeWidth="0.8" />
            ))}
            <path d={local.aoi} fill="rgb(240 180 41 / .18)" stroke="var(--color-accent)" strokeWidth="1.2" strokeDasharray="3 2" />
            {local.city && <circle cx={local.city[0]} cy={local.city[1]} r="2.4" fill="var(--color-paper)" />}
            <text x="4" y="146" fontSize="8" fill="var(--color-mute-400)">perímetro urbano</text>
            <text x="196" y="146" fontSize="8" fill="var(--color-accent)" textAnchor="end">área del visor</text>
          </svg>
        ) : <div className="h-[150px]" />}
      </div>
    </div>
  );
}

type Ring = number[][];

function ringsOf(f: GeoJSON['features'][number]): Ring[] {
  if (f.geometry.type === 'Polygon') return [(f.geometry.coordinates as number[][][])[0]];
  if (f.geometry.type === 'MultiPolygon') return (f.geometry.coordinates as number[][][][]).map((p) => p[0]);
  return [];
}

function bboxOfRings(rings: Ring[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, nn = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > nn) nn = y;
  }
  return [w, s, e, nn];
}

/** Equirectangular con el aspecto corregido por la latitud media: suficiente para un inset. */
function projector([w, s, e, nn]: [number, number, number, number], width: number, height: number, pad: number) {
  const k = Math.cos(((s + nn) / 2) * (Math.PI / 180));
  const sx = ((e - w) * k) || 1;
  const sy = (nn - s) || 1;
  const scale = Math.min((width - 2 * pad) / sx, (height - 2 * pad) / sy);
  const ox = (width - sx * scale) / 2;
  const oy = (height - sy * scale) / 2;
  return ([x, y]: number[]): [number, number] => [
    ox + (x - w) * k * scale,
    oy + (nn - y) * scale,
  ];
}

function pathOf(ring: Ring, proj: (p: number[]) => [number, number]): string {
  return ring.map((p, i) => {
    const [x, y] = proj(p);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join('') + 'Z';
}

function ImageryToggle({ checked, onChange, label, help, badge, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; help: string;
  badge?: string; disabled?: boolean;
}) {
  return (
    <label data-uri="imagery-toggle" data-layer={label} className={[
      'flex items-start gap-2.5 rounded-lg border px-2.5 py-2',
      disabled ? 'cursor-not-allowed border-ink-800 opacity-60' : 'cursor-pointer border-ink-700 bg-ink-850 hover:border-mute-400/40',
    ].join(' ')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[var(--color-accent)]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-[12px] font-medium">{label}</span>
          {badge && (
            <span className={[
              'rounded border px-1 py-0.5 text-[9px] uppercase',
              badge === 'real' ? 'border-ok/35 text-ok'
                : badge === 'sin fuente' ? 'border-dashed border-ink-500 text-mute-300'
                : 'border-warn/35 text-warn',
            ].join(' ')}>
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-mute-400">{help}</span>
      </span>
    </label>
  );
}
