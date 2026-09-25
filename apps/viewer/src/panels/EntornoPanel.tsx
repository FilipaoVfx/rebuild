import { useState } from 'react';
import { Icon } from '../components/icons';
import { AmberBadge, Crumbs, Kicker, Missing, Sheet } from '../components/ui';
import { dec, metros, m2, n } from '../lib/format';
import { nearbyOf, placeName, reachOf, type Nearby } from '../lib/place';
import { useStore, type LayerKey } from '../state/store';
import type { Site } from '../types';

export function EntornoPanel({ site }: { site: Site }) {
  const { details, layers, openPanel, layer, setLayer, settings } = useStore();
  const detail = details[site.site_id];
  const f = detail?.features ?? {};
  const reach = reachOf(site, detail);
  const near = nearbyOf(site, layers, settings.radius);
  const perCapita = f.park_area_per_capita as number | null | undefined;

  const views: { key: LayerKey; label: string }[] = [
    { key: 'espacio', label: 'Espacio público' },
    { key: 'equipamientos', label: 'Equipamientos' },
    { key: 'poblacion', label: 'Población' },
  ];

  return (
    <Sheet
      id="entorno"
      label={`Entorno de ${placeName(site)}`}
      onClose={() => openPanel(null)}
      footer={
        <div className="flex flex-wrap gap-3 border-t border-rule bg-card px-6 py-4">
          <button type="button" className="btn btn-secondary" onClick={() => openPanel('evidencia')}>
            <Icon.Doc size={19} /> Examinar evidencia
          </button>
          <button type="button" className="flex items-center gap-2 px-2 text-[15px]" onClick={() => openPanel('intervenciones')}>
            <Icon.Arrow size={19} className="text-cobalt" /><span className="link">Ver posibles intervenciones</span>
          </button>
        </div>
      }
    >
      <div className="px-6 pt-5 pb-6">
        <Crumbs site={site} tail="Entorno" />
        <Kicker className="mt-5">Entorno cercano</Kicker>
        <h2 className="mt-1 font-serif text-[30px] leading-tight font-semibold tracking-tight">
          El entorno de {placeName(site)}
        </h2>
        <p className="mt-1 font-serif text-[17px] text-ink-2">
          Qué hay a una caminata del sitio. Ayuda a entender el lugar; no prueba por sí solo que haga falta una obra.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-[13.5px]" role="radiogroup" aria-label="Ver en el mapa">
          <span className="text-ink-3">Ver en el mapa:</span>
          {views.map((v) => (
            <button
              key={v.key} type="button" role="radio" aria-checked={layer === v.key} onClick={() => setLayer(v.key)}
              className={`rounded-[4px] border px-2.5 py-1 ${layer === v.key ? 'border-cobalt bg-cobalt-50 font-semibold text-cobalt' : 'border-rule-2 text-ink-2 hover:bg-wash'}`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <h3 className="kicker mt-7 mb-2">Dónde está</h3>
        <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1.5 border-t border-rule pt-3 text-[14.5px]">
          <dt className="text-ink-3">Esquina</dt><dd>{site.corner_label ?? <Missing>sin calles con nombre en OSM</Missing>}</dd>
          <dt className="text-ink-3">Referencia</dt>
          <dd>{site.nearest_landmark ? `${site.nearest_landmark}, a ${metros(site.nearest_landmark_m ?? 0)}` : <Missing>sin hito cercano</Missing>}</dd>
          <dt className="text-ink-3">Barrio y comuna</dt>
          <dd>{[site.neighborhood, site.commune && `Comuna ${site.commune}`].filter(Boolean).join(' · ') || <Missing>sin fuente</Missing>}</dd>
        </dl>

        <h3 className="kicker mt-7 mb-2">A 10 minutos a pie</h3>
        <div className="border-t border-rule pt-3">
          {reach.reliable ? (
            <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1.5 text-[14.5px]">
              <dt className="text-ink-3">Personas</dt><dd className="num font-semibold">≈ {n(reach.people)}</dd>
              <dt className="text-ink-3">Hogares</dt><dd className="num">≈ {n(reach.households)}</dd>
              <dt className="text-ink-3">Área caminable</dt><dd className="num">{reach.area === null ? 'sin dato' : `${dec(reach.area / 1e6, 2)} km²`} · {reach.method}</dd>
            </dl>
          ) : (
            <div className="flex items-start gap-3">
              <AmberBadge>Revisar</AmberBadge>
              <p className="text-[14.5px] leading-snug text-ink-2">{reach.note}</p>
            </div>
          )}
          <p className="mt-2 text-[13px] leading-snug text-ink-3">
            {reach.reliable ? reach.note : 'La población de la zona sí está estimada; lo que falla es el área que el sitio alcanza a pie.'}
          </p>
        </div>

        <h3 className="kicker mt-7 mb-2">Espacio público y vulnerabilidad</h3>
        <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1.5 border-t border-rule pt-3 text-[14.5px]">
          <dt className="text-ink-3">Por habitante</dt>
          <dd>{perCapita === null || perCapita === undefined || !reach.reliable
            ? <Missing>sin dato fiable</Missing>
            : <><span className="num font-semibold">{dec(perCapita, 1)} m²</span> de espacio público alcanzable, frente al estándar de 10 m²</>}
          </dd>
          <dt className="text-ink-3">Vulnerabilidad</dt>
          <dd>{site.social_vulnerability === null
            ? <Missing>sin dato</Missing>
            : <><span className="num font-semibold">{dec(site.social_vulnerability)}</span> de 1 · índice del proyecto sobre manzanas del Censo DANE 2018, no un índice oficial</>}
          </dd>
        </dl>

        <NearbyList title={`Espacio público a ${settings.radius} m`} items={near.publicSpace} ready={near.ready} empty="Ningún espacio público registrado a esa distancia en SIGPER ni en OSM." />
        <NearbyList title={`Equipamientos a ${settings.radius} m`} items={near.facilities} ready={near.ready} empty="Ningún equipamiento registrado a esa distancia en SIGPER ni en OSM." />
        <p className="mt-3 text-[13px] leading-snug text-ink-3">
          SIGPER: inventario municipal de Pereira, datos abiertos (Ley 1712). OSM: OpenStreetMap, con su propia cobertura.
          Una ausencia en la lista es una ausencia en esas fuentes, no necesariamente en el terreno.
        </p>
      </div>
    </Sheet>
  );
}

function NearbyList({ title, items, ready, empty }: { title: string; items: Nearby[]; ready: boolean; empty: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 7);
  return (
    <>
      <h3 className="kicker mt-7 mb-2">{title}{ready ? ` · ${items.length}` : ''}</h3>
      {!ready && <p className="border-t border-rule pt-3 text-[14px] text-ink-3">Cargando capas de SIGPER y OSM…</p>}
      {ready && items.length === 0 && <p className="border-t border-rule pt-3 text-[14px] text-ink-3">{empty}</p>}
      {ready && items.length > 0 && (
        <ul className="border-t border-rule">
          {shown.map((it, i) => (
            <li key={`${it.name}-${i}`} className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-rule py-2 text-[14px]">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{it.name}</span>
                <span className="block text-[13px] text-ink-3">{it.kind} · {it.source}{it.area ? ` · ${m2(it.area)}` : ''}</span>
              </span>
              <span className="num self-center text-ink-2">{it.distance === 0 ? 'junto al sitio' : metros(it.distance)}</span>
            </li>
          ))}
        </ul>
      )}
      {ready && items.length > 7 && (
        <button type="button" className="link mt-2 text-[14px]" onClick={() => setAll((v) => !v)}>
          {all ? 'Mostrar menos' : `Ver los ${items.length}`}
        </button>
      )}
    </>
  );
}
