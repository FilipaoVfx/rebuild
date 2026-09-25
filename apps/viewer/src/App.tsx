import { useEffect } from 'react';
import { Header } from './components/Header';
import { Legend, LayerBar, ProvenanceBar, StudyCard } from './components/MapChrome';
import { MapWorkspace } from './components/MapWorkspace';
import { PlaceCard } from './components/PlaceCard';
import { HelpDialog, SavedDialog, SourcesDialog } from './panels/Dialogs';
import { EntornoPanel } from './panels/EntornoPanel';
import { EvidencePanel } from './panels/EvidencePanel';
import { InterventionsPanel } from './panels/InterventionsPanel';
import { VerificationPanel } from './panels/VerificationPanel';
import { StoreProvider, useStore } from './state/store';

export default function App() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  );
}

/**
 * RECOVERY: el mapa ocupa la pantalla y lo demás flota sobre él
 * (docs/designs/recovery-mapa-analista-20260925). Sin barra lateral fija:
 * la tarjeta del lugar aparece cuando hay un lugar, y los paneles cuando el
 * analista decide seguir por uno de sus caminos.
 */
function Workspace() {
  const { selectedSiteId, siteById, panel, overlay, selectSite } = useStore();
  const site = selectedSiteId ? siteById.get(selectedSiteId) ?? null : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && site && !panel && !overlay) selectSite(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [site, panel, overlay, selectSite]);

  return (
    <div className="flex h-full flex-col bg-paper">
      <Header />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <MapWorkspace />

        {/* Controles flotantes. En pantallas anchas la barra de capas va al centro. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-2 md:p-5 xl:block">
          <div className="order-2 md:order-none xl:absolute xl:top-5 xl:left-6">
            {(!site || window.matchMedia('(min-width: 768px)').matches) && <StudyCard />}
          </div>
          <div className="order-1 flex md:order-none xl:absolute xl:top-5 xl:left-1/2 xl:-translate-x-1/2">
            <LayerBar />
          </div>
        </div>

        {/* Leyenda al centro cuando cabe; si no, encima de las fuentes. */}
        <div className="pointer-events-none absolute right-3 bottom-[70px] z-10 hidden w-[400px] md:block min-[1440px]:right-auto min-[1440px]:bottom-3 min-[1440px]:left-1/2 min-[1440px]:w-auto min-[1440px]:max-w-[640px] min-[1440px]:-translate-x-1/2">
          <Legend />
        </div>
        <div className="pointer-events-none absolute right-3 bottom-3 z-10 hidden w-[400px] md:block min-[1440px]:w-[380px]">
          <ProvenanceBar />
        </div>
        {/* En móvil la atribución de OSM sigue visible aunque la barra no quepa. */}
        <p className="pointer-events-none absolute right-2 bottom-1 z-10 text-[10.5px] text-ink-3 md:hidden">
          © OpenStreetMap contributors · Copernicus EMS
        </p>

        {site && !panel && <PlaceCard site={site} />}
        {site && panel === 'evidencia' && <EvidencePanel site={site} />}
        {site && panel === 'entorno' && <EntornoPanel site={site} />}
        {site && panel === 'intervenciones' && <InterventionsPanel site={site} />}
        {site && panel === 'verificacion' && <VerificationPanel site={site} />}
      </main>

      {overlay === 'fuentes' && <SourcesDialog />}
      {overlay === 'ayuda' && <HelpDialog />}
      {overlay === 'guardadas' && <SavedDialog />}
    </div>
  );
}
