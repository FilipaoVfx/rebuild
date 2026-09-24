import { useState } from 'react';
import { Callout, Card, Classes, Divider, H4, H5, Intent, Section, SectionCard, Tag, Tree } from '@blueprintjs/core';
import type { TreeNodeInfo } from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons';
import { ABSENCE, HEADLINE_STATS, METRICS, OPPORTUNITIES, SOURCES } from './data';
import type { AbsenceCode } from './data';
import { Absence, AbsenceState, LicenseTag, Metric, Provenance, Value } from './ui';

/* ═══════════════════════════════════════════════ 1. RESUMEN ══════════ */
export function Overview() {
  const blocked = SOURCES.filter((s) => s.absence);
  return (
    <div className="grid-2">
      <div className="col">
        <Section title="Cifras del corte" icon={IconNames.NUMERICAL} compact>
          <SectionCard>
            <div className="stats">
              {HEADLINE_STATS.map((s) => (
                <div key={s.label} className="stat">
                  <div className={Classes.TEXT_MUTED}>{s.label}</div>
                  <div className="stat-val">
                    {s.value === null ? <Absence code={s.absence!} minimal={false} />
                      : <span className="num big">{s.value.toLocaleString('es-CO')}</span>}
                  </div>
                  <div className={Classes.TEXT_SMALL + ' ' + Classes.TEXT_MUTED}>
                    {s.sub}{s.value !== null && s.absence ? ' · ' : ''}
                    {s.value !== null && s.absence && <Absence code={s.absence} />}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </Section>

        <Section title="Preparacion" subtitle="Ninguna metrica sin su denominador" icon={IconNames.DOUGHNUT_CHART} compact>
          <SectionCard>
            {METRICS.map((m) => <Metric key={m.label} label={m.label} num={m.num} den={m.den} unit={m.unit} code={m.absence} />)}
          </SectionCard>
        </Section>
      </div>

      <div className="col">
        <Section title="Fuentes" subtitle={`${SOURCES.length} registradas · ${SOURCES.filter((s) => s.contributes).length} contribuyen`} icon={IconNames.DATABASE} compact>
          <SectionCard padded={false}>
            <table className={`${Classes.HTML_TABLE} ${Classes.COMPACT} ${Classes.HTML_TABLE_STRIPED} full`}>
              <thead><tr><th>Fuente</th><th>Licencia</th><th>Estado</th></tr></thead>
              <tbody>
                {SOURCES.map((s) => (
                  <tr key={s.source_id} className={s.contributes ? '' : 'muted-row'}>
                    <td><Provenance sourceId={s.source_id}>{s.display_name}</Provenance></td>
                    <td><LicenseTag lc={s.license_class} /></td>
                    <td>{s.absence ? <Absence code={s.absence} /> : <Tag minimal intent={Intent.SUCCESS}>contribuye</Tag>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </Section>

        <Callout intent={Intent.DANGER} icon={IconNames.LOCK} title={`${blocked.length} fuentes existen y no se pueden usar`}>
          Ninguna esta bloqueada por un problema tecnico. {blocked.filter((b) => b.license_class === 'UNCLEAR').length} no
          declaran licencia y {blocked.filter((b) => b.license_class === 'NON_COMMERCIAL').length} la declaran prohibitiva.
          El desbloqueo es un correo, no un desarrollo.
        </Callout>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ 2. ONTOLOGIA ════════ */
const leaf = (id: string, label: string, sub?: string, icon = IconNames.TAG): TreeNodeInfo => ({
  id, label, icon, secondaryLabel: sub ? <span className={Classes.TEXT_MUTED}>{sub}</span> : undefined,
});

const NODES: TreeNodeInfo[] = [
  {
    id: 'opportunity', label: <b>RecoveryOpportunity</b>, icon: IconNames.CUBE, isExpanded: true, hasCaret: true,
    secondaryLabel: <Tag minimal intent={Intent.PRIMARY}>objeto central</Tag>,
    childNodes: [
      leaf('o-place', 'lugar', 'barrio · comuna · esquina · hito', IconNames.MAP_MARKER),
      leaf('o-problem', 'problema', 'compuesto, no plantilla', IconNames.ANNOTATION),
      leaf('o-suit', 'suitability', 'ordena, no titula', IconNames.SORT_NUMERICAL),
      leaf('o-conf', 'confidence', '0–1, no es verdad', IconNames.CONFIRM),
      { id: 'o-link-site', label: '→ Site', icon: IconNames.LINK, secondaryLabel: <Tag minimal>enlace</Tag> },
      { id: 'o-link-int', label: '→ Intervention[]', icon: IconNames.LINK, secondaryLabel: <Tag minimal>enlace</Tag> },
    ],
  },
  {
    id: 'site', label: <b>Site</b>, icon: IconNames.CUBE, hasCaret: true, isExpanded: true,
    childNodes: [
      leaf('s-geom', 'geometry', 'Point 4326', IconNames.POLYGON_FILTER),
      leaf('s-state', 'state', 'INGESTED | EVALUATED | EXCLUDED | CANDIDATE | SHORTLISTED | ENDORSED', IconNames.FLOW_LINEAR),
      { id: 's-link-ev', label: '→ DamageEvidence[]', icon: IconNames.LINK, secondaryLabel: <Tag minimal>enlace</Tag> },
      { id: 's-link-photo', label: '→ FieldObservation[]', icon: IconNames.LINK, secondaryLabel: <Tag minimal intent={Intent.WARNING}>enlace espacial</Tag> },
    ],
  },
  {
    id: 'evidence', label: <b>DamageEvidence</b>, icon: IconNames.CUBE, hasCaret: true,
    childNodes: [
      leaf('e-method', 'method', 'REMOTE_SENSING | FIELD_INSPECTION | CITIZEN_REPORT | OFFICIAL_REGISTRY', IconNames.FLOW_LINEAR),
      leaf('e-class', 'damage_class', 'NO_DAMAGE | POSSIBLY_DAMAGED | DAMAGED | DESTROYED', IconNames.FLOW_LINEAR),
      leaf('e-obs', 'observation_date', 'separada de acquisition_date', IconNames.CALENDAR),
      { id: 'e-link-src', label: '→ Source (original_source)', icon: IconNames.LINK, secondaryLabel: <Tag minimal>enlace</Tag> },
    ],
  },
  {
    id: 'source', label: <b>Source</b>, icon: IconNames.CUBE, hasCaret: true,
    secondaryLabel: <Tag minimal intent={Intent.SUCCESS}>la licencia es parte de la ontologia</Tag>,
    childNodes: [
      leaf('src-lic', 'license_class', 'COMMERCIAL_SAFE | ATTRIBUTION | SHARE_ALIKE | NON_COMMERCIAL | UNCLEAR', IconNames.FLOW_LINEAR),
      leaf('src-redis', 'redistribution_allowed', 'true | false | sin declarar', IconNames.FLOW_LINEAR),
      { id: 'src-link-v', label: '→ DatasetVersion', icon: IconNames.LINK, secondaryLabel: <Tag minimal>enlace</Tag> },
    ],
  },
  {
    id: 'fieldobs', label: <b>FieldObservation</b>, icon: IconNames.CUBE, hasCaret: true,
    secondaryLabel: <Tag minimal intent={Intent.WARNING}>ADR-24 §6</Tag>,
    childNodes: [
      leaf('f-match', 'match_status', 'LINKED | AMBIGUOUS | UNLINKED', IconNames.FLOW_LINEAR),
      leaf('f-review', 'review_status', 'PENDIENTE | APROBADA', IconNames.FLOW_LINEAR),
      leaf('f-loc', 'location_source', 'DEVICE | EXIF | MANUAL', IconNames.FLOW_LINEAR),
      leaf('f-runner', 'runner_up_distance_m', 'vuelve detectable la ambiguedad', IconNames.GEOSEARCH),
    ],
  },
];

export function Ontology() {
  const [nodes, setNodes] = useState(NODES);
  const toggle = (path: number[], expanded: boolean) => {
    const next = structuredClone(nodes) as TreeNodeInfo[];
    let cur: any = { childNodes: next };
    for (const i of path) cur = cur.childNodes[i];
    cur.isExpanded = expanded;
    setNodes(next);
  };
  return (
    <div className="grid-2">
      <Section title="Objetos, propiedades y enlaces" subtitle="ONTOLOGY → DOMAIN MODEL → API → STATE → UI" icon={IconNames.DIAGRAM_TREE} compact>
        <SectionCard padded={false}>
          <Tree contents={nodes} onNodeExpand={(_n, p) => toggle(p, true)} onNodeCollapse={(_n, p) => toggle(p, false)} />
        </SectionCard>
      </Section>
      <div className="col">
        <Callout icon={IconNames.INFO_SIGN} title="Por que un arbol y no un diagrama">
          Los enlaces son recorribles: <code>opportunity → site → damage_evidence → source → dataset_version</code>.
          Esa cadena es la que permite que cualquier cifra de la pantalla responda de donde sale — pasa el cursor
          sobre cualquier nombre de fuente en la vista de Resumen.
        </Callout>
        <Callout intent={Intent.WARNING} icon={IconNames.FLOW_LINEAR} title="Estados cerrados, no texto libre">
          Cada propiedad con barras verticales es una enumeracion. En el sistema real,
          <code> stop_reason</code> es una cadena suelta comparada con <code>==</code>: una errata devuelve
          el resultado contrario en silencio.
        </Callout>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ 3. CASOS LIMITE ═════════ */
const EXAMPLES: Record<AbsenceCode, string> = {
  SIN_FUENTE: 'El eje de riesgo sismico: 0 de 115 sitios. La capa del SGC se retiro por licencia y ninguna la sustituye.',
  NO_DISCRIMINA: 'Accesibilidad peatonal: 1,00 en 112 de 115 sitios. Cobertura del 100 % e informacion cero.',
  SUPRIMIDO: 'Manzana con menos de 20 unidades: el dato existe y no se publica.',
  AMBIGUO: 'Foto a 40 m de un sitio y a 45 m de otro. GPS no es identidad de entidad.',
  SIN_ENLACE: 'Foto a mas de 75 m de cualquier sitio: es la parte del dano que el satelite no vio.',
  BLOQUEADA_LICENCIA: '7.697 inspecciones de campo municipales. El dato es publico; los terminos no existen.',
  DESACTUALIZADA: 'Fuente con corte del 02-06 y antiguedad maxima de 30 dias.',
  EN_CONFLICTO: 'Dos fuentes compatibles reportan clases incompatibles para el mismo bloque.',
  VACIO: 'El umbral de idoneidad deja la lista sin ningun elemento.',
  PARCIAL: 'Dos de los seis temas requeridos tienen fuente.',
  CONFIANZA_BAJA: 'Una sola fuente independiente: 27 % de confianza.',
  SIMULADO: 'Todo lo de este prototipo. Debe verse simulado, no parecerse a una observacion.',
  SIN_DENOMINADOR: '190.000 personas en el AOI. No es un porcentaje de nada publicable.',
  FUERA_DE_ALCANCE: 'El sitio cae fuera del rectangulo de 21,66 km² que cubre el visor.',
  SIN_REVISAR: 'Foto que no ha pasado revision humana: existe en la base y no sale publicada.',
};

export function EdgeCases() {
  const codes = Object.keys(ABSENCE) as AbsenceCode[];
  return (
    <>
      <Callout icon={IconNames.SHIELD} title="Quince estados que un dato puede tener" className="mb">
        Un producto de evidencia se juzga por como dibuja lo que <i>no</i> sabe. Cada tarjeta es un codigo
        cerrado con su intent, su icono y su explicacion: una sola forma de dibujar la ausencia, verificable
        desde fuera. El sistema real las escribe a mano 45 veces en cinco redacciones distintas.
      </Callout>
      <div className="edge-grid">
        {codes.map((c) => (
          <Card key={c} compact className="edge-card">
            <div className="edge-head"><Absence code={c} minimal={false} /></div>
            <div className={Classes.TEXT_MUTED + ' edge-def'}>{ABSENCE[c]}</div>
            <Divider />
            <div className={Classes.TEXT_SMALL}>{EXAMPLES[c]}</div>
          </Card>
        ))}
      </div>
      <H4 className="mt">En bloque, cuando ocupa toda una region</H4>
      <div className="grid-3">
        {(['VACIO', 'BLOQUEADA_LICENCIA', 'SIN_FUENTE'] as AbsenceCode[]).map((c) => (
          <Card key={c} className="edge-block"><AbsenceState code={c} /></Card>
        ))}
      </div>
    </>
  );
}

export function aoiOutliers() { return OPPORTUNITIES.filter((o) => !o.in_aoi).length; }
export { H5 };
