import { useMemo, useState } from 'react';
import {
  Button, Callout, Classes, Divider, Drawer, DrawerSize, H4, H5, Intent, Menu, MenuItem,
  Section, SectionCard, Slider, Switch, Tag, Tooltip,
} from '@blueprintjs/core';
import { Cell, Column, ColumnHeaderCell, Table2 } from '@blueprintjs/table';
import { MultiSelect } from '@blueprintjs/select';
import { IconNames } from '@blueprintjs/icons';
import { OPPORTUNITIES } from './data';
import type { Opportunity } from './data';
import { Absence, AbsenceState, FeasibilityTag, MatchTag, Provenance, ReviewTag, Value } from './ui';

const COMUNAS = [...new Set(OPPORTUNITIES.map((o) => o.comuna))].sort();
type SortKey = 'suitability' | 'population' | 'cost_mcop' | 'confidence' | 'area_m2';

export function Opportunities() {
  const [min, setMin] = useState(64);
  const [comunas, setComunas] = useState<string[]>([]);
  const [onlyAoi, setOnlyAoi] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: 'suitability', asc: false });
  const [open, setOpen] = useState<Opportunity | null>(null);

  const rows = useMemo(() => {
    let r = OPPORTUNITIES.filter((o) => (o.suitability ?? -1) >= min);
    if (comunas.length) r = r.filter((o) => comunas.includes(o.comuna));
    if (onlyAoi) r = r.filter((o) => o.in_aoi);
    const dir = sort.asc ? 1 : -1;
    return [...r].sort((a, b) => (((a[sort.k] ?? -1) as number) - ((b[sort.k] ?? -1) as number)) * dir);
  }, [min, comunas, onlyAoi, sort]);

  const header = (name: string, k: SortKey) => () => (
    <ColumnHeaderCell
      name={name}
      menuRenderer={() => (
        <Menu>
          <MenuItem icon={IconNames.SORT_ASC} text="Ascendente" onClick={() => setSort({ k, asc: true })} />
          <MenuItem icon={IconNames.SORT_DESC} text="Descendente" onClick={() => setSort({ k, asc: false })} />
        </Menu>
      )}
    />
  );

  return (
    <>
      <Section
        title="Oportunidades de recuperacion"
        subtitle={`${rows.length} de ${OPPORTUNITIES.length} — tabla virtualizada, columnas redimensionables, cabeceras con menu de orden`}
        icon={IconNames.TH}
        compact
        rightElement={
          <Tooltip content="El umbral no borra: filtra la lectura" compact>
            <Tag minimal icon={IconNames.FILTER}>idoneidad ≥ {min}</Tag>
          </Tooltip>
        }
      >
        <SectionCard>
          <div className="filters">
            <div className="filter-slider">
              <span className={Classes.TEXT_MUTED}>Idoneidad minima</span>
              <Slider min={0} max={100} stepSize={1} labelStepSize={25} value={min} onChange={setMin} intent={Intent.PRIMARY} />
            </div>
            <MultiSelect<string>
              items={COMUNAS}
              selectedItems={comunas}
              placeholder="Filtrar por comuna…"
              tagRenderer={(c) => c}
              itemRenderer={(c, { handleClick, modifiers }) =>
                modifiers.matchesPredicate ? (
                  <MenuItem key={c} text={c} onClick={handleClick} active={modifiers.active} icon={comunas.includes(c) ? IconNames.TICK : IconNames.BLANK} />
                ) : null}
              itemPredicate={(q, c) => c.toLowerCase().includes(q.toLowerCase())}
              onItemSelect={(c) => setComunas((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))}
              onRemove={(c) => setComunas((p) => p.filter((x) => x !== c))}
              onClear={() => setComunas([])}
              resetOnSelect
            />
            <Switch checked={onlyAoi} label="Solo dentro del AOI" onChange={(e) => setOnlyAoi(e.currentTarget.checked)} alignIndicator="right" />
          </div>
        </SectionCard>

        <SectionCard padded={false}>
          {rows.length === 0 ? (
            <div className="empty">
              <AbsenceState code="VACIO" action={<Button icon={IconNames.RESET} text="Bajar el umbral a 0" onClick={() => setMin(0)} />} />
            </div>
          ) : (
            <div className="table-wrap">
              <Table2
                numRows={rows.length}
                defaultRowHeight={30}
                columnWidths={[104, 250, 300, 108, 112, 104, 110, 132]}
                enableRowResizing={false}
                onSelection={(r) => { const i = r[0]?.rows?.[0]; if (i !== undefined) setOpen(rows[i]); }}
              >
                <Column name="Sitio" cellRenderer={(i) => <Cell><span className="mono">{rows[i].site_id}</span></Cell>} />
                <Column name="Lugar" cellRenderer={(i) => {
                  const o = rows[i];
                  return <Cell>{o.barrio ? `${o.barrio} · ${o.comuna}` : <Absence code="SIN_FUENTE" />}</Cell>;
                }} />
                <Column name="Problema" cellRenderer={(i) => <Cell tooltip={rows[i].headline}>{rows[i].headline}</Cell>} />
                <Column name="Idoneidad" columnHeaderCellRenderer={header('Idoneidad', 'suitability')}
                  cellRenderer={(i) => <Cell><Value v={rows[i].suitability} digits={1} /></Cell>} />
                <Column name="Poblacion" columnHeaderCellRenderer={header('Poblacion', 'population')}
                  cellRenderer={(i) => <Cell><Value v={rows[i].population} code="SUPRIMIDO" digits={0} /></Cell>} />
                <Column name="Costo" columnHeaderCellRenderer={header('Costo', 'cost_mcop')}
                  cellRenderer={(i) => <Cell><span className="num">${rows[i].cost_mcop} M</span></Cell>} />
                <Column name="Confianza" columnHeaderCellRenderer={header('Confianza', 'confidence')}
                  cellRenderer={(i) => {
                    const c = rows[i].confidence;
                    return <Cell>{c < 0.3 ? <Tooltip content="Una sola fuente independiente" compact><Tag minimal intent={Intent.WARNING}>{(c * 100).toFixed(0)}%</Tag></Tooltip>
                      : <span className="num">{(c * 100).toFixed(0)}%</span>}</Cell>;
                  }} />
                <Column name="Estado" cellRenderer={(i) => {
                  const o = rows[i];
                  const unknowns = o.conditions.filter((c) => c.status === 'UNKNOWN').length;
                  return <Cell>{o.absence ? <Absence code={o.absence} /> : <Tag minimal intent={unknowns ? Intent.NONE : Intent.SUCCESS}>{unknowns ? `${unknowns} sin fuente` : 'completo'}</Tag>}</Cell>;
                }} />
              </Table2>
            </div>
          )}
        </SectionCard>
      </Section>

      <Detail o={open} onClose={() => setOpen(null)} />
    </>
  );
}

function Detail({ o, onClose }: { o: Opportunity | null; onClose: () => void }) {
  if (!o) return null;
  const unknowns = o.conditions.filter((c) => c.status === 'UNKNOWN').length;
  return (
    <Drawer isOpen size={DrawerSize.STANDARD} onClose={onClose} title={o.site_id} icon={IconNames.CUBE}
      className={Classes.DARK}>
      <div className={Classes.DRAWER_BODY}>
        <div className="drawer-inner">
          <div className={Classes.TEXT_MUTED + ' place'}>
            {o.barrio ? `Barrio ${o.barrio}` : <Absence code="SIN_FUENTE" />} · Comuna {o.comuna}
            <br />{o.esquina}{o.hito ? ` · a 50 m de ${o.hito}` : ''}
          </div>
          <H4 className="mt0">{o.intervention.replace('_', ' ').toLowerCase()}</H4>
          <div className="tags">
            <Tag minimal intent={Intent.PRIMARY}>idoneidad <b><Value v={o.suitability} digits={1} /></b></Tag>
            <Tag minimal intent={o.confidence < 0.3 ? Intent.WARNING : Intent.NONE}>confianza {(o.confidence * 100).toFixed(0)}%</Tag>
            {unknowns > 0 && <Tag minimal>{unknowns} sin fuente</Tag>}
            {!o.in_aoi && <Absence code="FUERA_DE_ALCANCE" />}
          </div>

          <Callout className="mt" icon={IconNames.ANNOTATION} title="Problema">{o.headline}</Callout>

          <H5 className="mt">Por que aqui</H5>
          {o.factors.map((f) => (
            <div key={f.label} className="factor">
              <span>{f.label}</span>
              <span className="factor-v">
                {f.value === null ? <Absence code={f.absence ?? 'SIN_FUENTE'} />
                  : f.distinct && f.distinct <= 3
                    ? <><Value v={f.value} /> <Absence code="NO_DISCRIMINA" /></>
                    : <Provenance sourceId={f.source_id}><Value v={f.value} /></Provenance>}
              </span>
            </div>
          ))}

          <H5 className="mt">Condiciones</H5>
          {o.conditions.map((c) => (
            <div key={c.label} className="factor">
              <span>{c.label}</span>
              <Tooltip content={c.reason} compact placement="left"><span><FeasibilityTag s={c.status} /></span></Tooltip>
            </div>
          ))}

          <H5 className="mt">Alternativas evaluadas</H5>
          <table className={`${Classes.HTML_TABLE} ${Classes.COMPACT} full`}>
            <tbody>{o.alternatives.map((a) => (
              <tr key={a.type}><td>{a.type.replace('_', ' ').toLowerCase()}</td>
                <td className="num r">{a.score.toFixed(1)}</td><td className="num r">${a.cost_mcop} M</td></tr>
            ))}</tbody>
          </table>

          <H5 className="mt">Fotos de campo <Tag minimal round>{o.photos.length}</Tag></H5>
          {o.photos.length === 0 ? <div className={Classes.TEXT_MUTED + ' ' + Classes.TEXT_SMALL}>Sin fotos de campo todavia.</div> : (
            <table className={`${Classes.HTML_TABLE} ${Classes.COMPACT} full`}>
              <thead><tr><th>Captura</th><th>Enlace</th><th>Distancia</th><th>Revision</th></tr></thead>
              <tbody>{o.photos.map((p) => (
                <tr key={p.photo_id}>
                  <td className={Classes.TEXT_SMALL}>{p.captured_at}<br /><span className={Classes.TEXT_MUTED}>{p.location_source} ±{p.accuracy_m} m</span></td>
                  <td><MatchTag s={p.match_status} />
                    {p.match_status === 'AMBIGUOUS' && <Tooltip compact content={`Segundo candidato a ${p.runner_up_m} m`}><span> <Absence code="AMBIGUO" /></span></Tooltip>}
                    {p.match_status === 'UNLINKED' && <> <Absence code="SIN_ENLACE" /></>}</td>
                  <td className="num">{p.distance_m === null ? '—' : `${p.distance_m} m`}</td>
                  <td><ReviewTag s={p.review_status} />{p.review_status === 'PENDIENTE' && <> <Absence code="SIN_REVISAR" /></>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          <Divider className="mt" />
          <div className={Classes.TEXT_SMALL + ' ' + Classes.TEXT_MUTED}>
            Salida consultiva. No hay ruta de escritura: esta ficha no admite acciones sobre el dato.
          </div>
        </div>
      </div>
    </Drawer>
  );
}
