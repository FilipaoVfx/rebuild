import { Breadcrumb, CompareTray, ContextSwitcher, Legend, TopBar } from './components/chrome';
import { MapCanvas } from './components/MapCanvas';
import { OpportunityDetail } from './components/OpportunityDetail';
import { StoreProvider, useStore } from './state/store';
import { EvidenceView } from './views/EvidenceView';
import { OpportunitiesView } from './views/OpportunitiesView';
import { PortfolioView } from './views/PortfolioView';
import { ScenariosView } from './views/ScenariosView';
import { SituationView } from './views/SituationView';

export default function App() {
  return (
    <StoreProvider>
      <Layout />
    </StoreProvider>
  );
}

function Layout() {
  const { view, selectedSiteId, siteById, oppBySite } = useStore();
  const site = selectedSiteId ? siteById.get(selectedSiteId) ?? null : null;

  const WorkPanel = {
    situacion: SituationView,
    oportunidades: OpportunitiesView,
    escenarios: ScenariosView,
    portafolio: PortfolioView,
    evidencia: EvidenceView,
  }[view];

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <TopBar />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Mapa: interfaz espacial, no contenedor de capas. En móvil encabeza
            la pantalla; en escritorio ocupa el espacio libre. */}
        <div className="relative h-[44vh] w-full shrink-0 lg:order-2 lg:h-auto lg:min-h-0 lg:flex-1">
          <MapCanvas />

          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-2 sm:p-3">
            <Breadcrumb />
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-2 sm:p-3">
            <div className="flex justify-end"><Legend /></div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <ContextSwitcher />
              <CompareTray />
            </div>
          </div>
        </div>

        {/* Panel de trabajo: el "qué" en texto y números. */}
        <div className="min-h-0 flex-1 overflow-y-auto border-ink-700 bg-ink-950 lg:order-1 lg:w-[400px] lg:flex-none lg:border-r">
          <WorkPanel />
        </div>

        {/* Detalle: aparece solo cuando hay una decisión sobre la mesa. */}
        {site && (
          <div className="fixed inset-0 z-40 lg:static lg:z-auto lg:order-3 lg:w-[420px] lg:shrink-0">
            <OpportunityDetail site={site} opp={oppBySite.get(site.site_id)} />
          </div>
        )}
      </div>
    </div>
  );
}
