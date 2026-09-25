import { useMemo } from 'react';
import { fecha, n, pct, dec, plainReason, shown } from '../lib/format';
import { useStore, type AnnexRef } from '../state/store';
import type { GeoJSON, Territory } from '../types';
import { ContextIntro } from '../components/ContextIntro';
import { Consideration, Empty, Note, Panel, SectionTitle, Mark } from '../components/ui';

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
    terrain, showTerrain, setShowTerrain, isStatic, context, annexRef, setAnnexRef,
  } = useStore();

  if (!territory) {
    return (
      <div className="p-3">
        <Panel className="py-4">
          <SectionTitle>¿Dónde estamos?</SectionTitle>
          <div className="mt-2.5"><Empty>Cargando el territorio…</Empty></div>
        </Panel>
      </div>
    );
  }

  const { city, urban_perimeter: perimeter, aoi, event, counts, comunas, rivers, imagery: img } = territory;
  const conSitios = comunas.filter((c) => c.sites > 0);
  const sinSitios = comunas.filter((c) => c.sites === 0);

  const cityName = city?.display_name ?? 'Pereira';
  const point = (r: AnnexRef) => (active: boolean) => setAnnexRef(active ? r : null);
  const popSource = city?.population_source?.split(' (')[0] ?? 'sin fuente';

  return (
    <div className="flex flex-col gap-0 pb-6">
      {/* El primer apartado sigue al contexto del mapa (ADR-23): en Territorio
          son las consideraciones; en cualquier otro contexto, sus variables. */}
      {context !== 'TERRITORIO' ? <div className="px-4 pt-4 sm:px-6"><ContextIntro /></div> : (
      <section data-uri="where-are-we" className="px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="letterhead text-[11.5px] text-toner">Consideraciones</h2>
          <span className="text-[11.5px] text-graphite-500">
            {city?.country ?? 'Colombia'} › {city?.department ?? 'Risaralda'} › <b className="font-semibold text-toner">{cityName}</b>
          </span>
        </div>
        <p className="mt-1.5 text-[12px] text-graphite-500">
          Señale una consideración para ver su referencia en el anexo.
        </p>
        <ol className="mt-1 divide-y divide-rule">
          <Consideration n={1} sources={[popSource]} active={annexRef === 'perimeter'} onPoint={point('perimeter')}>
            {cityName}
            {city?.population ? <> tiene <b>{n(city.population)}</b> habitantes</> : null}
            {perimeter ? <> en un perímetro urbano de <b>{perimeter.area_km2.toLocaleString('es-CO')} km²</b></> : null}.
          </Consideration>
          <Consideration n={2} stamp sources={['Copernicus EMS']} active={annexRef === 'aoi'} onPoint={point('aoi')}>
            Este concepto cubre <b>{aoi.bbox_km2.toLocaleString('es-CO')} km²</b>
            {aoi.share_of_perimeter !== null && <>, el <b>{pct(aoi.share_of_perimeter)}</b> del perímetro</>}:
            {' '}el área donde Copernicus EMS apuntó el sensor tras el sismo. No es toda la ciudad.
          </Consideration>
          <Consideration n={3} sources={['Copernicus EMS']} active={annexRef === 'evidence'} onPoint={point('evidence')}>
            La evidencia de daño son <b>{n(counts.evidence)}</b> observaciones de foto-interpretación
            satelital, agrupadas en <b>{n(counts.sites)}</b> sitios. Ninguna está validada en campo.
          </Consideration>
          <Consideration n={4} sources={[event.source.split(' (')[0]]}>
            El sismo, de magnitud <b>M{event.magnitude.toLocaleString('es-CO')}</b> y {event.depth_km.toLocaleString('es-CO')} km
            de profundidad, ocurrió el {fecha(event.occurred_at.slice(0, 10))} a las {event.occurred_at.slice(11, 16)} UTC,
            con epicentro {event.epicentre.label}
            {event.distance_km !== null ? <>, a <b>{n(event.distance_km)} km</b> de {cityName}</> : <> (distancia a la ciudad sin fuente)</>}.
            {' '}{cityName} es uno de {n(event.municipalities_affected)} municipios afectados.
          </Consideration>
          <Consideration n={5} sources={['Copernicus EMS']} active={annexRef === 'outside'} onPoint={point('outside')}>
            Fuera del área cubierta el anexo va tramado: ahí no hay evidencia, lo que no equivale a
            ausencia de daño. Las inspecciones de campo de la Alcaldía (EDAM, unos 7.700 registros)
            cubrirían la ciudad, pero no se han incorporado: el ítem no declara licencia y contiene
            datos personales que habría que suprimir antes.
          </Consideration>
        </ol>
        {city?.population && (
          <Note>Población según {city.population_source}. No es el censo.
            {' '}Sismo: {event.source}; cartografía rápida de Copernicus EMS.</Note>
        )}
        <figure className="mt-4 border-t border-rule pt-3">
          <figcaption className="letterhead text-[10.5px] text-graphite-600">Localización</figcaption>
          <Locator territory={territory} regions={layers.reference_regions} admin={layers.admin_areas} />
        </figure>
      </section>
      )}

      <div className="flex flex-col px-4 sm:px-6">
      <Panel className="py-4">
        <SectionTitle right={<span className="text-[10px] text-graphite-500">{comunas.length} en el AOI</span>}>
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
                  'flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-[11px] transition-colors',
                  active ? 'border-mark/60 bg-mark/10 text-toner' : 'border-rule bg-sheet-2 text-graphite-700 hover:border-graphite-500/50',
                ].join(' ')}
              >
                <span>{c.display_name}</span>
                <span className="num text-[10px] text-graphite-500">{c.sites}</span>
              </button>
            );
          })}
        </div>
        {sinSitios.length > 0 && (
          <p className="mt-2 text-[10px] leading-snug text-graphite-400">
            Sin sitios: {sinSitios.map((c) => c.display_name).join(', ')}.
          </p>
        )}
        <Note>
          El número es cuántos sitios de oportunidad caen en cada comuna. Clic para encuadrarla.
          {' '}{n(counts.neighborhoods_in_aoi)} barrios de OSM intersectan el AOI.
        </Note>
      </Panel>

      {rivers.length > 0 && (
        <Panel className="py-4">
          <SectionTitle>Ríos</SectionTitle>
          <p className="mt-2 text-[12px] leading-relaxed text-graphite-700">
            {rivers.map((r, i) => (
              <span key={r.display_name}>
                {i > 0 && ' · '}
                <b className="text-toner">{r.display_name}</b>
                <span className="text-graphite-500"> {dec(r.length_m / 1000, 1)} km</span>
              </span>
            ))}
          </p>
          <Note>Longitud dentro del extracto de OSM, no del cauce completo.</Note>
        </Panel>
      )}

      <Panel className="py-4">
        <SectionTitle>Imagen del territorio</SectionTitle>
        <div className="mt-2 flex flex-col border-t border-rule">
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
                    'rounded-[3px] border px-2 py-1 text-[10px]',
                    imageryCollection === c ? 'border-mark/60 bg-mark/10 text-toner' : 'border-rule text-graphite-600',
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
                : `No se publica: ${plainReason(o.reason)}. Disponible y permitido no son lo mismo.`}
            />
          ))}
          <ImageryToggle
            checked={showTerrain}
            disabled={!terrain}
            onChange={setShowTerrain}
            label="Relieve real del terreno"
            badge="real"
            help={terrain
              ? 'Relieve del modelo de elevación de Copernicus, archivado con el proyecto.'
              : 'Sin teselas versionadas en este despliegue: la capa no se publica.'}
          />
        </div>
        {sentinel && (
          <Note>{shown(sentinel.limitation)}</Note>
        )}
      </Panel>

      <Panel className="py-4">
        <SectionTitle>Qué cubre este visor</SectionTitle>
        <p className="mt-2 text-[12px] leading-relaxed text-graphite-700">
          {aoi.evidence_km2 !== null && (
            <>La evidencia de daño cubre <b className="text-toner">{aoi.evidence_km2.toLocaleString('es-CO')} km²</b> del rectángulo: </>
          )}
          {n(counts.evidence)} observaciones de foto-interpretación agrupadas en {n(counts.sites)} sitios,
          sobre {n(counts.buildings)} huellas de edificio y {n(counts.landmarks)} lugares con nombre.
          {' '}
          {counts.field_photos ? (
            <>Y <b className="text-toner">{n(counts.field_photos)} fotos de campo</b> tomadas con pereiramap
              ({n(counts.field_photos_linked ?? 0)} enlazadas a un sitio).</>
          ) : (
            <>Todavía sin fotos de campo: se toman con <b>pereiramap</b> y respaldan la ficha de cada sitio.</>
          )}
        </p>
        <Note>
          Es un sector de Pereira, no la ciudad. La cobertura satelital es donde se apuntó el sensor,
          no donde hubo daño: lo que queda fuera del rectángulo es invisible para este sistema.
          {isStatic && ' Modo estático: los escenarios van precalculados.'}
        </Note>
      </Panel>

      </div>

      <button
        data-uri="territory-cta"
        onClick={() => { setHighlightedAdminId(null); setContext('SITUACION'); setView('situacion'); }}
        className="mx-4 mt-5 bg-toner px-4 py-3 text-left text-[14px] font-semibold text-sheet transition-colors hover:bg-graphite-700 sm:mx-6"
      >
        II · Situación →
        <span className="block text-[12px] font-normal text-sheet/75">¿Qué está pasando en el territorio?</span>
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
      <div className="flex-none rounded-[3px] border border-rule bg-sheet p-1.5">
        {national ? (
          <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="Colombia, Risaralda y Pereira">
            {national.country.map((d, i) => (
              <path key={`c${i}`} d={d} fill="var(--color-rule)" stroke="var(--color-graphite-400)" strokeWidth="0.8" />
            ))}
            {national.state.map((d, i) => (
              <path key={`s${i}`} d={d} fill="var(--color-rule-2)" stroke="var(--color-graphite-600)" strokeWidth="0.8" />
            ))}
            {national.city && (
              <>
                <circle cx={national.city[0]} cy={national.city[1]} r="3.2" fill="var(--color-toner)" />
                <text x={national.city[0] + 6} y={national.city[1] + 3} fontSize="9" fill="var(--color-toner)">
                  {city?.display_name ?? 'Pereira'}
                </text>
              </>
            )}
          </svg>
        ) : <div className="h-[150px] w-[150px]" />}
      </div>
      <div className="min-w-0 flex-1 rounded-[3px] border border-rule bg-sheet p-1.5">
        {local ? (
          <svg width="100%" height="150" viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet" role="img"
               aria-label="Perímetro urbano de Pereira y el área que cubre el visor">
            {local.perimeter.map((d, i) => (
              <path key={`p${i}`} d={d} fill="var(--color-rule)" stroke="var(--color-graphite-500)" strokeWidth="0.8" />
            ))}
            <path d={local.aoi} fill="rgb(91 58 163 / .12)" stroke="var(--color-stamp)" strokeWidth="1.2" strokeDasharray="3 2" />
            {local.city && <circle cx={local.city[0]} cy={local.city[1]} r="2.4" fill="var(--color-toner)" />}
            <text x="4" y="146" fontSize="8" fill="var(--color-graphite-500)">perímetro urbano</text>
            <text x="196" y="146" fontSize="8" fill="var(--color-stamp)" textAnchor="end">área cubierta</text>
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
  const blocked = disabled && badge === 'sin fuente';
  return (
    <label data-uri="imagery-toggle" data-layer={label} className={[
      'group flex items-start gap-2.5 border-b border-rule py-2.5',
      disabled ? 'cursor-not-allowed' : 'cursor-pointer',
    ].join(' ')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span aria-hidden className={[
        'mt-[2px] inline-flex h-4 w-4 shrink-0 items-center justify-center border transition-colors',
        'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-toner',
        checked ? 'border-toner bg-toner text-sheet'
          : blocked ? 'border-dashed border-stamp text-stamp'
          : disabled ? 'border-dashed border-graphite-400'
          : 'border-graphite-500 group-hover:border-toner',
      ].join(' ')}>
        {checked ? <Mark kind="ok" size={10} /> : blocked ? <Mark kind="close" size={9} /> : null}
      </span>
      <span className={`min-w-0 flex-1 ${disabled && !blocked ? 'opacity-60' : ''}`}>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={`text-[13px] font-medium ${disabled ? 'text-graphite-600' : 'text-toner'}`}>{label}</span>
          {badge && (
            <span className={[
              'text-[10px] font-semibold tracking-[0.1em] uppercase',
              badge === 'real' ? 'text-ok' : badge === 'sin fuente' ? 'text-stamp' : 'text-warn',
            ].join(' ')}>
              {badge === 'sin fuente' ? 'bloqueada por licencia' : badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-graphite-500">{help}</span>
      </span>
    </label>
  );
}
