import { useState } from 'react';
import { Icon } from '../components/icons';
import { DAMAGE_RGB } from '../components/MapWorkspace';
import { AmberBadge, Crumbs, Kicker, Missing, Sheet } from '../components/ui';
import { sentinelImageUrl, type SentinelScene } from '../data';
import { DAMAGE_LABEL, METHOD_LABEL, dec, fecha, n } from '../lib/format';
import { CONFIDENCE_DRIVER, placeName } from '../lib/place';
import { useStore } from '../state/store';
import type { Site } from '../types';

const rgb = (c: number[]) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
/** El índice de Sentinel se escribió sin tildes; en pantalla se leen con ellas. */
const acentos = (s: string) =>
  s.replace(/\bdano\b/g, 'daño').replace(/retrodispersion/g, 'retrodispersión');

export function EvidencePanel({ site }: { site: Site }) {
  const { details, openPanel } = useStore();
  const detail = details[site.site_id];
  const fusion = detail?.fusion;
  const drivers = Object.entries(detail?.confidence_drivers ?? {}).filter(([, v]) => v < 0);

  return (
    <Sheet
      id="evidencia"
      label={`Evidencia de daño en ${placeName(site)}`}
      onClose={() => openPanel(null)}
      footer={
        <div className="flex flex-wrap gap-3 border-t border-rule bg-card px-6 py-4">
          <button type="button" className="btn btn-secondary" onClick={() => openPanel('entorno')}>
            <Icon.External size={19} /> Explorar el entorno
          </button>
          <button type="button" className="flex items-center gap-2 px-2 text-[15px]" onClick={() => openPanel('intervenciones')}>
            <Icon.Arrow size={19} className="text-cobalt" /><span className="link">Ver posibles intervenciones</span>
          </button>
        </div>
      }
    >
      <div className="px-6 pt-5 pb-6">
        <Crumbs site={site} tail="Evidencia" />
        <Kicker className="mt-5">Evidencia de daño</Kicker>
        <h2 className="mt-1 font-serif text-[30px] leading-tight font-semibold tracking-tight">
          ¿Qué se ve en {placeName(site)}?
        </h2>
        <p className="mt-1 font-serif text-[17px] text-ink-2">
          Lo que se observó desde satélite en este sitio, y lo que eso no dice.
        </p>

        <h3 className="kicker mt-7 mb-2">Observaciones</h3>
        {!detail && <p className="text-[14px] text-ink-3">Cargando el detalle del sitio…</p>}
        {detail && detail.evidence.length === 0 && <Missing>Sin observaciones registradas en este sitio</Missing>}
        <ul className="border-t border-rule">
          {detail?.evidence.map((e) => (
            <li key={e.evidence_id} className="border-b border-rule py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="size-3 rounded-full" style={{ background: rgb(DAMAGE_RGB[e.damage_class] ?? [115, 123, 146]) }} aria-hidden="true" />
                <span className="text-[16px] font-semibold">{DAMAGE_LABEL[e.damage_class] ?? e.damage_class}</span>
                <span className="text-[13.5px] text-ink-3">rótulo original «{e.raw_damage_label}»</span>
                {!e.field_validated && <span className="ml-auto"><AmberBadge>Sin validar en campo</AmberBadge></span>}
              </div>
              <dl className="mt-2 grid grid-cols-[150px_1fr] gap-x-3 gap-y-1 text-[14px]">
                <dt className="text-ink-3">Método</dt><dd>{METHOD_LABEL[e.method] ?? e.method}</dd>
                <dt className="text-ink-3">Observada</dt><dd>{fecha(e.observation_date)}{e.acquisition_date ? ` · imagen del ${fecha(e.acquisition_date)}` : ''}</dd>
                <dt className="text-ink-3">Confianza del método</dt><dd className="num">{dec(e.confidence)} de 1</dd>
                <dt className="text-ink-3">Precisión de posición</dt><dd className="num">{e.positional_accuracy_m === null ? 'sin dato' : `± ${n(e.positional_accuracy_m)} m`}</dd>
                <dt className="text-ink-3">Fuente</dt><dd className="text-ink-2">{e.attribution}</dd>
              </dl>
            </li>
          ))}
        </ul>

        {fusion && (
          <>
            <h3 className="kicker mt-7 mb-2">Lectura del sistema</h3>
            <dl className="grid grid-cols-[190px_1fr] gap-x-3 gap-y-1.5 border-t border-rule pt-3 text-[14.5px]">
              <dt className="text-ink-3">Clase fusionada</dt>
              <dd className="font-semibold">{fusion.damage_class ? DAMAGE_LABEL[fusion.damage_class] : 'sin clase'}</dd>
              <dt className="text-ink-3">Confianza fusionada</dt>
              <dd className="num">{fusion.damage_confidence === null ? 'sin dato' : `${dec(fusion.damage_confidence)} de 1`}</dd>
              <dt className="text-ink-3">Fuentes independientes</dt>
              <dd className="num">{fusion.independent_sources} ({fusion.contributing_sources.join(', ').replace('copernicus_ems', 'Copernicus EMS')})</dd>
              <dt className="text-ink-3">Antigüedad</dt>
              <dd className="num">{fusion.observation_age_days === null ? 'sin dato' : `${fusion.observation_age_days} días desde la observación`}</dd>
            </dl>
          </>
        )}

        {drivers.length > 0 && (
          <>
            <h3 className="kicker mt-7 mb-2">Qué baja la confianza</h3>
            <ul className="border-t border-rule text-[14px]">
              {drivers.map(([k, v]) => (
                <li key={k} className="flex items-baseline justify-between gap-4 border-b border-rule py-2">
                  <span className="text-ink-2">{CONFIDENCE_DRIVER[k] ?? k}</span>
                  <span className="num shrink-0 font-semibold">{dec(v)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <SentinelPair site={site} />

        <h3 className="kicker mt-7 mb-2">Lo que esta evidencia no dice</h3>
        <ul className="list-disc space-y-1.5 pl-5 font-serif text-[15.5px] leading-snug text-ink-2">
          <li>No es una inspección estructural: dice qué se ve desde la vertical, no si el edificio es seguro.</li>
          <li>Nadie la ha contrastado en campo. Las fotos de campo (ADR-24) no llegan todavía a este visor.</li>
          <li>Cubre el recuadro de la activación EMSR916, un sector de Pereira. Fuera de él no hay evidencia, que no es lo mismo que no haya daño.</li>
        </ul>
      </div>
    </Sheet>
  );
}

/** Antes y después, recortado alrededor del sitio. Observación con fecha, nunca veredicto (ADR-19). */
function SentinelPair({ site }: { site: Site }) {
  const { sentinel } = useStore();
  const [coll, setColl] = useState<'sentinel-2-l2a' | 'sentinel-1-grd'>('sentinel-2-l2a');
  if (!sentinel) return null;
  const pre = sentinel.scenes.find((s) => s.collection === coll && s.window === 'PRE');
  const post = sentinel.scenes.find((s) => s.collection === coll && s.window === 'POST');
  if (!pre || !post) return null;
  return (
    <>
      <div className="mt-7 mb-2 flex items-center justify-between gap-3">
        <h3 className="kicker">Imágenes antes y después</h3>
        <div className="flex rounded-[4px] border border-rule-2 text-[13px]" role="radiogroup" aria-label="Sensor">
          {([['sentinel-2-l2a', 'Óptica (S2)'], ['sentinel-1-grd', 'Radar (S1)']] as const).map(([k, label]) => (
            <button
              key={k} type="button" role="radio" aria-checked={coll === k} onClick={() => setColl(k)}
              className={`px-2.5 py-1 ${coll === k ? 'bg-ink font-semibold text-white' : 'text-ink-2 hover:bg-wash'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Crop scene={pre} site={site} label="Antes" />
        <Crop scene={post} site={site} label="Después" />
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink-3">
        {acentos(sentinel.limitation)} {sentinel.attribution}.
      </p>
    </>
  );
}

const ZOOM = 3;
function Crop({ scene, site, label }: { scene: SentinelScene; site: Site; label: string }) {
  /* Las vistas previas cubren el recuadro del estudio a 558 × 391 px. Se
     amplía la imagen y se centra en el sitio: unos 700 m de lado. */
  const [w, s, e, nn] = scene.bbox;
  const px = ((site.lon - w) / (e - w)) * 558;
  const py = ((nn - site.lat) / (nn - s)) * 391;
  return (
    <figure className="m-0" data-uri="sentinel-crop">
      <div
        className="relative aspect-[4/3] overflow-hidden rounded-[3px] border border-rule bg-wash"
        role="img"
        aria-label={`${label}: imagen ${scene.collection} del ${fecha(scene.acquisition)} centrada en el sitio`}
      >
        <img
          src={sentinelImageUrl(scene)}
          alt=""
          draggable={false}
          className="absolute max-w-none select-none"
          style={{
            width: 558 * ZOOM,
            height: 391 * ZOOM,
            left: `calc(50% - ${px * ZOOM}px)`,
            top: `calc(50% - ${py * ZOOM}px)`,
          }}
        />
        <span className="absolute top-1/2 left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_#1b45c4]" aria-hidden="true" />
      </div>
      <figcaption className="mt-1 flex justify-between text-[13px]">
        <b>{label}</b><span className="text-ink-3">{fecha(scene.acquisition)}</span>
      </figcaption>
    </figure>
  );
}
