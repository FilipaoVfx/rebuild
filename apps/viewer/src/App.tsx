import { useEffect } from 'react';
import { Legend, LayerBar, ProvenanceBar, StudyCard } from './components/MapChrome';
import { MapWorkspace } from './components/MapWorkspace';
import { PlaceCard } from './components/PlaceCard';
import { Toolbar } from './components/Toolbar';
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
 * REBUILD: el mapa ocupa toda la pantalla y lo demás flota sobre él (ADR-27).
 * Sin cabecera: la barra va abajo y al centro, y arriba solo queda lo que
 * explica el mapa — qué cubre, cómo se lee y qué capa se está mirando.
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
    <main className="relative h-full overflow-hidden bg-paper">
      <MapWorkspace />

      {/* Qué cubre el mapa y cómo se lee. */}
      <div className="pointer-events-none absolute top-5 left-5 z-10 hidden w-[330px] flex-col gap-2 md:flex">
        <StudyCard />
        <Legend />
      </div>

      {/* La capa que se mira. Al centro cuando cabe junto a la columna izquierda. */}
      <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-center md:top-5 md:right-3 md:left-[365px] md:justify-start wide:right-0 wide:left-0 wide:justify-center">
        <LayerBar />
      </div>

      {/* En móvil, el sector bajo las capas mientras no haya un lugar abierto. */}
      {!site && (
        <div className="pointer-events-none absolute inset-x-2 top-[66px] z-10 md:hidden">
          <StudyCard />
        </div>
      )}

      {/* De dónde sale lo que se ve: arriba a la derecha si hay sitio; si no, sobre la barra. */}
      <div className="pointer-events-none absolute top-5 right-5 z-10 hidden max-w-[430px] wide:flex">
        <ProvenanceBar />
      </div>
      <div className="pointer-events-none absolute right-2 bottom-[68px] z-10 flex max-w-[calc(100%-16px)] justify-end md:top-[80px] md:right-3 md:bottom-auto md:max-w-[440px] wide:hidden">
        <ProvenanceBar />
      </div>

      {site && !panel && <PlaceCard site={site} />}
      {site && panel === 'evidencia' && <EvidencePanel site={site} />}
      {site && panel === 'entorno' && <EntornoPanel site={site} />}
      {site && panel === 'intervenciones' && <InterventionsPanel site={site} />}
      {site && panel === 'verificacion' && <VerificationPanel site={site} />}

      <Toolbar />
    </main>
  );
}
