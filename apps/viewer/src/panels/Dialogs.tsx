import { Icon } from '../components/icons';
import { Kicker } from '../components/ui';
import { LICENSE_LABEL, fecha } from '../lib/format';
import { interventionName, placeName } from '../lib/place';
import { useStore } from '../state/store';

/** Fuentes y licencias: lo que se usa, con su atribución literal, y lo que no se publica y por qué. */
export function SourcesContent() {
  const { sources, provenance, territory } = useStore();
  const used = sources.filter((s) => s.usable);
  const blocked = sources.filter((s) => !s.usable);
  const ortofotos = territory?.imagery.ortofotos ?? [];
  return (
    <>
      <p className="font-serif text-[16.5px] leading-snug text-ink-2">
        Todo lo que se ve sale de fuentes registradas con su licencia leída. Lo que no tiene licencia clara no se
        publica, aunque esté disponible. Datos n.º {provenance.data_version} · rasgos {provenance.feature_version}.
      </p>

      <Kicker className="mt-6">En uso · {used.length}</Kicker>
      <ul className="mt-2 border-t border-rule">
        {used.map((s) => (
          <li key={s.source_id} className="border-b border-rule py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <b className="text-[15px]">{s.display_name}</b>
              <span className="text-[13px] text-ink-3">{LICENSE_LABEL[s.license_class ?? ''] ?? s.license_class}{s.terms_verified_at ? ` · verificada ${fecha(s.terms_verified_at)}` : ''}</span>
            </div>
            {s.attribution_text && <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{s.attribution_text}</p>}
          </li>
        ))}
      </ul>

      <Kicker className="mt-6">Sin publicar · {blocked.length + ortofotos.filter((o) => o.status !== 'AVAILABLE').length + 1}</Kicker>
      <ul className="mt-2 border-t border-rule text-[14px]">
        {blocked.map((s) => (
          <li key={s.source_id} className="border-b border-rule py-2.5">
            <b>{s.display_name}</b>
            <span className="text-ink-3"> · {LICENSE_LABEL[s.license_class ?? ''] ?? 'sin clasificar'}</span>
          </li>
        ))}
        {ortofotos.filter((o) => o.status !== 'AVAILABLE').map((o) => (
          <li key={o.source_id} className="border-b border-rule py-2.5">
            <b>{o.display_name}</b>
            <span className="text-ink-3"> · {o.reason ?? 'licencia sin resolver'}</span>
          </li>
        ))}
        <li className="border-b border-rule py-2.5">
          <b>IDE AMCO — POT de Pereira y microzonificación sísmica</b>
          <span className="text-ink-3"> · responde y cubre casi todos los sitios, pero no declara licencia. Se consulta en un sandbox interno; el derecho de petición está redactado (ADR-26).</span>
        </li>
      </ul>
      <p className="mt-4 text-[13px] text-ink-3">
        Sin tiles, tipografías ni scripts de terceros: la cartografía base es un extracto de OpenStreetMap servido por
        el propio sitio.
      </p>
    </>
  );
}

export function HelpContent() {
  const steps = [
    ['Ubica un lugar', 'Busca un barrio, una comuna o un sitio, o toca un punto del mapa. Cada punto es un sitio con evidencia de daño.'],
    ['Examina la evidencia', 'Qué se observó, cuándo y con qué método; y lo que esa observación no dice.'],
    ['Explora el entorno', 'Qué hay a una caminata: espacio público, equipamientos, población alcanzable.'],
    ['Compara hipótesis', 'Dos intervenciones posibles para el mismo lugar, con lo que falta comprobar de cada una.'],
    ['Prepara la verificación', 'Las dudas convertidas en preguntas para la visita, en una ficha que se puede imprimir.'],
  ];
  return (
    <>
      <ol className="space-y-3">
        {steps.map(([t, d], i) => (
          <li key={t} className="grid grid-cols-[32px_1fr] gap-3">
            <span className="grid size-8 place-items-center rounded-full bg-cobalt-50 font-semibold text-cobalt">{i + 1}</span>
            <span><b className="text-[15.5px]">{t}.</b> <span className="text-ink-2">{d}</span></span>
          </li>
        ))}
      </ol>
      <Kicker className="mt-7">Lo que este mapa no hace</Kicker>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 font-serif text-[15.5px] leading-snug text-ink-2">
        <li>No cubre toda Pereira: solo el recuadro de la activación Copernicus EMSR916.</li>
        <li>No reemplaza una inspección: la evidencia es foto-interpretación satelital sin validar en campo.</li>
        <li>No decide obras. Las hipótesis ordenan opciones con los datos disponibles; la decisión es de las personas.</li>
        <li>No inventa lo que falta: un dato ausente aparece rayado y dicho, nunca como cero.</li>
      </ul>
      <p className="mt-5 flex items-center gap-2 text-[13.5px] text-ink-3">
        <Icon.Info size={16} /> Las comparaciones y borradores de verificación se guardan solo en este navegador.
      </p>
    </>
  );
}

export function SavedContent() {
  const { saved, verificationDrafts, siteById, selectSite, openPanel, setOverlay, removeSaved } = useStore();
  const go = (id: string, panel: 'intervenciones' | 'verificacion') => {
    setOverlay(null);
    selectSite(id);
    openPanel(panel);
  };
  const drafts = Object.entries(verificationDrafts);
  return (
    <>
      <p className="text-[14px] text-ink-3">Solo en este navegador. Nada de esto se envía ni se publica.</p>
      <Kicker className="mt-5">Comparaciones · {saved.length}</Kicker>
      {saved.length === 0 && <p className="mt-2 text-[14.5px] text-ink-2">Todavía no hay comparaciones guardadas.</p>}
      <ul className="mt-2 border-t border-rule">
        {saved.map((s) => {
          const site = siteById.get(s.siteId);
          if (!site) return null;
          return (
            <li key={s.siteId} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
              <span>
                <b className="text-[15px]">{placeName(site)}</b>
                <span className="block text-[13.5px] text-ink-2">{s.pair.map(interventionName).join(' frente a ')} · {fecha(s.at)}</span>
              </span>
              <span className="flex gap-3">
                <button type="button" className="link text-[14px]" onClick={() => go(s.siteId, 'intervenciones')}>Abrir</button>
                <button type="button" className="text-[14px] text-ink-3 hover:text-bad" onClick={() => removeSaved(s.siteId)}>Quitar</button>
              </span>
            </li>
          );
        })}
      </ul>
      <Kicker className="mt-6">Borradores de verificación · {drafts.length}</Kicker>
      {drafts.length === 0 && <p className="mt-2 text-[14.5px] text-ink-2">Todavía no hay borradores.</p>}
      <ul className="mt-2 border-t border-rule">
        {drafts.map(([id, d]) => {
          const site = siteById.get(id);
          if (!site) return null;
          return (
            <li key={id} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
              <span>
                <b className="text-[15px]">{placeName(site)}</b>
                <span className="block text-[13.5px] text-ink-2">{d.checked.length} puntos revisados{d.question ? ' · con pregunta para la visita' : ''}</span>
              </span>
              <button type="button" className="link text-[14px]" onClick={() => go(id, 'verificacion')}>Abrir</button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
