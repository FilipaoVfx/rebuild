import { dec, razon } from '../lib/format';
import {
  evidenceLine, nearbyOf, peopleLine, placeName, reachOf, sitesInPlace,
} from '../lib/place';
import { useStore } from '../state/store';
import type { Site } from '../types';
import { Icon } from './icons';
import { AmberBadge, InfoRow } from './ui';

/**
 * La tarjeta del lugar. Muestra lo disponible y lo que falta, y deja que el
 * analista elija por dónde seguir: la evidencia y el entorno primero; las
 * intervenciones, como enlace discreto al final. Una recomendación del sistema
 * no es una instrucción para construir.
 */
export function PlaceCard({ site }: { site: Site }) {
  const { details, layers, sites, selectSite, openPanel, settings } = useStore();
  const detail = details[site.site_id];
  const same = sitesInPlace(sites, site);
  const idx = same.findIndex((s) => s.site_id === site.site_id);
  const near = nearbyOf(site, layers, settings.radius);
  const reach = reachOf(site, detail);
  const validated = detail?.fusion.any_field_validated ?? false;
  const exclusions = detail?.exclusions ?? [];

  const step = (d: number) => {
    const next = same[(idx + d + same.length) % same.length];
    selectSite(next.site_id);
  };

  return (
    <aside
      id="place-card"
      data-uri="place-card"
      aria-label={`Lugar seleccionado: ${placeName(site)}`}
      className="float animate-rise pointer-events-auto fixed inset-x-2 bottom-[72px] z-20 max-h-[52vh] overflow-y-auto px-5 pt-5 pb-4 md:absolute md:inset-x-auto md:top-1/2 md:right-6 md:bottom-auto md:max-h-[calc(100%-240px)] md:w-[410px] md:-translate-y-1/2 md:px-6"
    >
      <button
        type="button"
        onClick={() => selectSite(null)}
        aria-label="Cerrar la tarjeta del lugar"
        className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-ink-2 hover:bg-wash"
      >
        <Icon.Close size={20} />
      </button>

      <h2 className="pr-10 font-serif text-[32px] leading-[1.05] font-semibold tracking-tight md:text-[36px]">
        {placeName(site)}
      </h2>
      <p className="mt-1 font-serif text-[16.5px] text-ink-2">
        {site.commune ? `Comuna ${site.commune} · ` : ''}sitio seleccionado
      </p>
      {same.length > 1 && (
        <div className="mt-2 flex items-center gap-2 text-[13.5px] text-ink-3">
          <span className="num">Sitio {idx + 1} de {same.length} en este barrio</span>
          <button type="button" onClick={() => step(-1)} aria-label="Sitio anterior del barrio" className="grid size-7 place-items-center rounded-full hover:bg-wash">
            <Icon.Back size={16} />
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Siguiente sitio del barrio" className="grid size-7 place-items-center rounded-full hover:bg-wash">
            <Icon.Next size={16} />
          </button>
        </div>
      )}

      <div className="mt-4 border-t border-rule">
        <InfoRow
          icon={<Icon.Doc size={22} />}
          title="Evidencia de daño"
          lines={['Copernicus EMS · foto-interpretación', evidenceLine(site)]}
          aside={!validated ? <AmberBadge>Sin validar en campo</AmberBadge> : undefined}
        />
        <InfoRow
          icon={<Icon.Map size={22} />}
          title="Entorno cercano"
          lines={[
            near.ready
              ? `${near.publicSpace.length} espacios públicos y ${near.facilities.length} equipamientos a ${settings.radius} m`
              : 'Calles, espacios públicos y equipamientos',
            'OSM · SIGPER',
          ]}
        />
        <InfoRow
          icon={<Icon.People size={22} />}
          title="Población"
          lines={[
            reach.reliable ? `${peopleLine(reach)} · estimación sobre edificios` : peopleLine(reach),
            site.social_vulnerability === null
              ? 'Censo DANE 2018: sin dato de vulnerabilidad'
              : `Censo DANE 2018: vulnerabilidad ${dec(site.social_vulnerability)} (índice del proyecto)`,
          ]}
          aside={!reach.reliable ? <AmberBadge>Revisar</AmberBadge> : undefined}
        />
        <InfoRow
          icon={<Icon.Doc size={22} />}
          title="Normativa"
          lines={['POT sin dato publicable', 'IDE AMCO: licencia sin declarar (ADR-26)']}
        />
      </div>

      {exclusions.length > 0 && (
        <p className="mt-1 rounded-[3px] bg-wash px-3 py-2 text-[13.5px] leading-snug text-ink-2">
          <b className="text-ink">Excluido por las restricciones del sistema:</b>{' '}
          {exclusions.map((e) => razon(e.reason)).join('; ')}.
        </p>
      )}

      {/* Las salidas quedan siempre a la vista, aunque la tarjeta tenga que desplazarse. */}
      <div className="sticky -bottom-4 -mx-5 mt-3 border-t border-rule bg-card px-5 pt-3.5 pb-1 md:-mx-6 md:px-6">
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="btn btn-primary" onClick={() => openPanel('evidencia')}>
            <Icon.Arrow size={20} /> Examinar evidencia
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => openPanel('entorno')}>
            <Icon.External size={19} /> Explorar el entorno
          </button>
        </div>
        <button type="button" className="mt-3.5 flex items-center gap-3 text-[15.5px]" onClick={() => openPanel('intervenciones')}>
          <Icon.Arrow size={20} className="text-cobalt" />
          <span className="link">Ver posibles intervenciones</span>
        </button>
      </div>
    </aside>
  );
}
