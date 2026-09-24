import { useMemo, useState } from 'react';
import {
  Alignment, Button, Classes, Dialog, DialogBody, HotkeysProvider, Icon, Intent, KeyComboTag,
  MenuItem, Navbar, NavbarDivider, NavbarGroup, NavbarHeading, Tab, Tabs, Tag, Tooltip, useHotkeys,
} from '@blueprintjs/core';
import { Omnibar } from '@blueprintjs/select';
import { IconNames } from '@blueprintjs/icons';
import { ABSENCE, OPPORTUNITIES, SOURCES } from './data';
import type { AbsenceCode } from './data';
import { Absence, Banner } from './ui';
import { EdgeCases, Ontology, Overview } from './views';
import { Opportunities } from './opportunities';

type Hit = { kind: 'sitio' | 'fuente' | 'estado'; id: string; label: string; sub: string };

const INDEX: Hit[] = [
  ...OPPORTUNITIES.map((o) => ({ kind: 'sitio' as const, id: o.site_id, label: `${o.site_id} — ${o.barrio || 'sin barrio'}`, sub: o.headline })),
  ...SOURCES.map((s) => ({ kind: 'fuente' as const, id: s.source_id, label: s.display_name, sub: `${s.license_class} · ${s.note.slice(0, 70)}` })),
  ...(Object.keys(ABSENCE) as AbsenceCode[]).map((c) => ({ kind: 'estado' as const, id: c, label: c.replace(/_/g, ' '), sub: ABSENCE[c] })),
];

const KIND_ICON = { sitio: IconNames.CUBE, fuente: IconNames.DATABASE, estado: IconNames.FLOW_LINEAR } as const;

export default function App() {
  const [tab, setTab] = useState('resumen');
  const [omni, setOmni] = useState(false);
  const [help, setHelp] = useState(false);

  const hotkeys = useMemo(() => [
    { combo: 'mod+k', global: true, label: 'Buscar en la ontologia', preventDefault: true, onKeyDown: () => setOmni(true) },
    { combo: 'shift+/', global: true, label: 'Atajos de teclado', onKeyDown: () => setHelp(true) },
    { combo: '1', global: true, label: 'Resumen', onKeyDown: () => setTab('resumen') },
    { combo: '2', global: true, label: 'Oportunidades', onKeyDown: () => setTab('oportunidades') },
    { combo: '3', global: true, label: 'Ontologia', onKeyDown: () => setTab('ontologia') },
    { combo: '4', global: true, label: 'Casos limite', onKeyDown: () => setTab('casos') },
  ], []);
  const { handleKeyDown, handleKeyUp } = useHotkeys(hotkeys);

  return (
    <div className={`${Classes.DARK} app`} onKeyDown={handleKeyDown} onKeyUp={handleKeyUp} tabIndex={0}>
      <Navbar fixedToTop>
        <NavbarGroup align={Alignment.LEFT}>
          <Icon icon={IconNames.GRAPH} intent={Intent.PRIMARY} />
          <NavbarHeading className="brand">Urban Recovery Intelligence
            <span className={Classes.TEXT_MUTED + ' ' + Classes.TEXT_SMALL}> · prototipo Blueprint</span>
          </NavbarHeading>
          <NavbarDivider />
          <Tag minimal intent={Intent.PRIMARY} icon={IconNames.LAB_TEST}>datos simulados</Tag>
        </NavbarGroup>
        <NavbarGroup align={Alignment.RIGHT}>
          <Button minimal icon={IconNames.SEARCH} text="Buscar" rightIcon={<KeyComboTag combo="mod+k" minimal />} onClick={() => setOmni(true)} />
          <NavbarDivider />
          <Tooltip content="Atajos" compact><Button minimal icon={IconNames.KEY} onClick={() => setHelp(true)} /></Tooltip>
        </NavbarGroup>
      </Navbar>

      <main>
        <Banner />
        <Tabs id="views" selectedTabId={tab} onChange={(t) => setTab(t as string)} large renderActiveTabPanelOnly animate={false}>
          <Tab id="resumen" title="Resumen" icon={IconNames.DASHBOARD} panel={<Overview />} />
          <Tab id="oportunidades" title="Oportunidades" icon={IconNames.TH} panel={<Opportunities />} />
          <Tab id="ontologia" title="Ontologia" icon={IconNames.DIAGRAM_TREE} panel={<Ontology />} />
          <Tab id="casos" title="Casos limite" icon={IconNames.SHIELD} panel={<EdgeCases />}
            tagContent={Object.keys(ABSENCE).length} tagProps={{ minimal: true, round: true }} />
        </Tabs>
      </main>

      <Omnibar<Hit>
        isOpen={omni}
        items={INDEX}
        resetOnSelect
        onClose={() => setOmni(false)}
        inputProps={{ placeholder: 'Buscar sitios, fuentes o estados del dato…' }}
        itemPredicate={(q, it) => (it.label + ' ' + it.sub + ' ' + it.kind).toLowerCase().includes(q.toLowerCase())}
        itemRenderer={(it, { handleClick, modifiers }) =>
          modifiers.matchesPredicate ? (
            <MenuItem key={it.kind + it.id} icon={KIND_ICON[it.kind]} text={it.label}
              label={it.kind} active={modifiers.active} onClick={handleClick}
              children={undefined} textClassName="omni-text"
              htmlTitle={it.sub} />
          ) : null}
        onItemSelect={(it) => {
          setOmni(false);
          setTab(it.kind === 'sitio' ? 'oportunidades' : it.kind === 'fuente' ? 'resumen' : 'casos');
        }}
        noResults={<MenuItem disabled text="Nada coincide." />}
      />

      <Dialog isOpen={help} onClose={() => setHelp(false)} title="Atajos" icon={IconNames.KEY} className={Classes.DARK}>
        <DialogBody>
          {hotkeys.map((h) => (
            <div key={h.combo} className="hk"><span>{h.label}</span><KeyComboTag combo={h.combo} /></div>
          ))}
        </DialogBody>
      </Dialog>

      <footer>
        <span className={Classes.TEXT_MUTED + ' ' + Classes.TEXT_SMALL}>
          Prototipo de interfaz · sin backend · {OPPORTUNITIES.length} objetos generados con semilla fija ·
          {' '}{Object.keys(ABSENCE).length} casos limite representados
        </span>
        <Absence code="SIMULADO" />
      </footer>
    </div>
  );
}
