import { AnnexHeader, CompareTray, Letterhead, Rotulo } from './components/chrome';
import { MapCanvas } from './components/MapCanvas';
import { OpportunityDetail } from './components/OpportunityDetail';
import { InkDefs } from './components/ui';
import { StoreProvider, useStore } from './state/store';
import { EvidenceView } from './views/EvidenceView';
import { OpportunitiesView } from './views/OpportunitiesView';
import { ScenariosView } from './views/ScenariosView';
import { SituationView } from './views/SituationView';
import { TerritoryView } from './views/TerritoryView';

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
    territorio: TerritoryView,
    situacion: SituationView,
    oportunidades: OpportunitiesView,
    escenarios: ScenariosView,
    evidencia: EvidenceView,
  }[view];

  return (
    <div className="flex h-full flex-col bg-sheet">
      <InkDefs />
      <Letterhead />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* El anexo cartográfico: la ciudad es la prueba del concepto y ocupa
            la mayor parte de la hoja. En móvil encabeza; en escritorio llena. */}
        <figure className="m-0 flex h-[52vh] w-full shrink-0 flex-col lg:order-2 lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-1">
          <AnnexHeader />
          <div className="relative min-h-0 flex-1 p-2 pt-1 sm:p-3 sm:pt-1.5">
            {/* Línea de marco: dentro está lo que el anexo afirma. */}
            <div className="relative h-full w-full overflow-hidden border border-toner">
              <MapCanvas />
              <div className="pointer-events-none absolute right-2 bottom-10 z-20 hidden sm:block">
                <Rotulo />
              </div>
              {/* En móvil no cabe el rótulo: queda la clave de los dos signos que sostienen la tesis. */}
              <div className="pointer-events-none absolute top-2 left-2 z-20 flex flex-col gap-1 border border-toner bg-sheet/95 px-2 py-1.5 text-[10.5px] text-graphite-700 sm:hidden">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 border-2 border-stamp" />área cubierta</span>
                <span className="flex items-center gap-1.5"><span className="hatch inline-block h-2.5 w-3.5 border border-graphite-400" />sin evidencia</span>
              </div>
              <div className="pointer-events-none absolute bottom-7 left-2 z-20">
                <CompareTray />
              </div>
            </div>
          </div>
        </figure>

        {/* Las consideraciones: el texto del concepto, a la izquierda del anexo. */}
        {/* Cada folio abre por su principio: la columna se monta de nuevo al cambiar de sección. */}
        <div key={view} className="min-h-0 flex-1 overflow-y-auto border-rule bg-sheet lg:order-1 lg:w-[420px] lg:flex-none lg:border-r">
          <WorkPanel />
        </div>

        {/* La ficha: aparece solo cuando hay una oportunidad sobre la mesa. */}
        {site && (
          <div className="fixed inset-0 z-40 lg:static lg:z-auto lg:order-3 lg:w-[440px] lg:shrink-0">
            <OpportunityDetail site={site} opp={oppBySite.get(site.site_id)} />
          </div>
        )}
      </div>
    </div>
  );
}
