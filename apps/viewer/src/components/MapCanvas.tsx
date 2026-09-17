import type { PickingInfo } from '@deck.gl/core';
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox';
import { ArcLayer, ColumnLayer, GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { useControl, type MapRef, type ViewState } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { assetUrl } from '../data';
import { contextByKey } from '../lib/contexts';
import { INTERVENTION_COLOR, RAMPS, sample, type RGB } from '../lib/palette';
import { useStore } from '../state/store';
import type { GeoJSON, Site } from '../types';

/**
 * Sin basemap de terceros, y no por estética: un tile servido por otro no
 * tiene `data_version` y rompe la reproducibilidad (fuentes.md §11). El tejido
 * urbano sale de las capas del propio repositorio — huellas de Microsoft y
 * malla de OSM — así que lo que se ve es dato con procedencia, no decoración.
 */
const BASE_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'bg', type: 'background' as const, paint: { 'background-color': '#07090c' } }],
};

function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

const CENTER: [number, number] = [-75.6935, 4.8085];

export function MapCanvas() {
  const {
    sites, oppBySite, layers, context, view, selectedSiteId, selectSite,
    hoverSiteId, setHoverSiteId, visibleOpportunities, scenario, coverage,
    showRelief, terrain, showTerrain, discrimination,
    unreached, selectedClusterId, selectCluster,
  } = useStore();

  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState<Partial<ViewState>>({
    longitude: CENTER[0], latitude: CENTER[1], zoom: 14.2, pitch: 0, bearing: -14,
  });

  const def = contextByKey(context);
  const ramp = RAMPS[context];

  /* La atribución sale de la procedencia, no de una constante en el código. */
  const provenance = useStore().provenance;
  const attribution = useMemo(
    () => (provenance.layers ?? []).map((l) => l.attribution).join(' · '),
    [provenance],
  );

  /* El rango teórico 0..1 casi nunca se usa entero: estirar al rango real de
     los sitios que SÍ tienen dato es lo que da contraste en vez de un tono plano. */
  const stretch = useMemo(() => {
    /* Si el eje no ordena, estirarlo manda todos los sitios al extremo oscuro
       y el mapa diría "todos bajos" cuando en realidad son todos iguales.
       Sin rango que estirar, se pinta el valor crudo. */
    if (discrimination.flat) return (v: number) => v;
    const vals = sites
      .map((s) => def.value(s, oppBySite.get(s.site_id)))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (!vals.length) return (v: number) => v;
    const lo = vals[Math.floor(vals.length * 0.02)];
    const hi = vals[Math.floor(vals.length * 0.98)];
    const span = hi - lo || 1;
    return (v: number) => Math.max(0, Math.min(1, (v - lo) / span));
  }, [sites, def, oppBySite, discrimination.flat]);

  const visibleIds = useMemo(
    () => new Set(visibleOpportunities.map((o) => o.site_id)),
    [visibleOpportunities],
  );

  const on = (name: string) => def.layers.includes(name as never);
  const gj = (name: string): GeoJSON | undefined => layers[name as never] as GeoJSON | undefined;

  const selected = selectedSiteId ? sites.find((s) => s.site_id === selectedSiteId) ?? null : null;

  const portfolioSites = useMemo(
    () => new Set((scenario?.items ?? []).map((i) => i.site_id)),
    [scenario],
  );

  const deckLayers = [
    /* --- tejido urbano: contexto sutil, nunca protagonista --- */
    ...(on('buildings') && gj('buildings') ? [
      new GeoJsonLayer({
        id: 'buildings',
        data: gj('buildings') as never,
        filled: true, stroked: false,
        getFillColor: [32, 40, 52, 190],
        pickable: false,
      }),
    ] : []),
    ...(on('roads') && gj('roads') ? [
      new GeoJsonLayer({
        id: 'roads',
        data: gj('roads') as never,
        stroked: true, filled: false,
        getLineColor: [58, 69, 83, 190],
        getLineWidth: 1,
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: 0.6,
        pickable: false,
      }),
    ] : []),

    /* --- coropleta de población: la unidad areal medida --- */
    ...(def.populationChoropleth && gj('population') ? [
      new GeoJsonLayer({
        id: 'population',
        data: gj('population') as never,
        filled: true, stroked: false,
        getFillColor: (f: { properties: Record<string, number> }) => {
          const p = Number(f.properties.population) || 0;
          const c: RGB = sample(ramp, Math.min(1, p / 900));
          return [c[0], c[1], c[2], 110];
        },
        pickable: true,
      }),
    ] : []),

    ...(on('green') && gj('green') ? [
      new GeoJsonLayer({
        id: 'green',
        data: gj('green') as never,
        filled: true, stroked: true,
        getFillColor: [52, 211, 153, 60],
        getLineColor: [52, 211, 153, 160],
        getLineWidth: 1, lineWidthUnits: 'pixels',
        pickable: true,
      }),
    ] : []),

    ...(on('catchments') && gj('catchments') ? [
      new GeoJsonLayer({
        id: 'catchments',
        data: gj('catchments') as never,
        filled: false, stroked: true,
        getLineColor: [107, 119, 135, 90],
        getLineWidth: 1, lineWidthUnits: 'pixels',
        pickable: false,
      }),
    ] : []),

    ...(on('facilities') && gj('facilities') ? [
      new GeoJsonLayer({
        id: 'facilities',
        data: gj('facilities') as never,
        pointType: 'circle',
        getPointRadius: 26, pointRadiusUnits: 'meters', pointRadiusMinPixels: 2.5,
        getFillColor: [147, 197, 253, 210],
        stroked: false,
        pickable: true,
      }),
    ] : []),

    /* --- evidencia de daño: observaciones crudas, no conclusiones --- */
    ...(on('evidence') && gj('evidence') ? [
      new GeoJsonLayer({
        id: 'evidence',
        data: gj('evidence') as never,
        pointType: 'circle',
        getPointRadius: 12, pointRadiusUnits: 'meters', pointRadiusMinPixels: 2,
        getFillColor: (f: { properties: Record<string, string> }) =>
          f.properties.label === 'DESTROYED' ? [248, 113, 113, 225]
            : f.properties.label === 'DAMAGED' ? [251, 146, 60, 205]
            : [251, 191, 36, 175],
        stroked: true, getLineColor: [7, 9, 12, 200], getLineWidth: 0.6,
        lineWidthUnits: 'pixels',
        pickable: true,
      }),
    ] : []),

    /* --- relieve de cobertura: altura = población medida --- */
    ...(showRelief && coverage ? [
      new ColumnLayer({
        id: 'relief',
        data: coverage.cells,
        diskResolution: 4,
        radius: 34,
        extruded: true,
        getPosition: (d) => [d.lon, d.lat],
        getElevation: (d) => d.population * 1.6,
        getFillColor: (d) => (d.covered_by ? [52, 211, 153, 210] : [58, 69, 83, 150]),
        pickable: true,
      }),
    ] : []),

    ...(view === 'portafolio' && unreached.clusters.length ? [
      new ScatterplotLayer({
        id: 'unreached',
        data: unreached.clusters.flatMap((c) =>
          c.cells.map((cell) => ({ ...cell, clusterId: c.id }))),
        getPosition: (d) => [d.lon, d.lat],
        // Un campo, no una mancha: 1.248 celdas pintadas en grande tapan los
        // proyectos, que son el sujeto de esta vista. El hueco se lee por
        // extensión, no por el tamaño de cada punto.
        getRadius: (d) => 18 + Math.sqrt(Math.max(0, d.population)) * 1.8,
        radiusUnits: 'meters',
        radiusMinPixels: 1,
        radiusMaxPixels: 6,
        stroked: false,
        getFillColor: (d) => {
          const activo = selectedClusterId === null || d.clusterId === selectedClusterId;
          return activo ? [248, 113, 113, 135] : [248, 113, 113, 30];
        },
        pickable: true,
        onClick: (info) => {
          const o = info.object as { clusterId?: string } | null;
          if (o?.clusterId) selectCluster(o.clusterId === selectedClusterId ? null : o.clusterId);
        },
        updateTriggers: { getFillColor: [selectedClusterId] },
      }),
    ] : []),

    ...(view === 'portafolio' && coverage ? [
      new ArcLayer({
        id: 'portfolio-arcs',
        data: coverage.arcs,
        getSourcePosition: (d) => d.from,
        getTargetPosition: (d) => d.to,
        getSourceColor: [240, 180, 41, 210],
        getTargetColor: [52, 211, 153, 180],
        getWidth: 1.6,
        getHeight: 0.4,
        pickable: true,
      }),
    ] : []),

    /* --- sitios: el dato que el contexto colorea --- */
    new ScatterplotLayer<Site>({
      id: 'sites',
      data: sites,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => {
        const inPortfolio = portfolioSites.has(d.site_id);
        return 26 + (inPortfolio ? 26 : 0) + (d.site_id === selectedSiteId ? 18 : 0);
      },
      radiusUnits: 'meters',
      radiusMinPixels: 4.5,
      radiusMaxPixels: 22,
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: (d) => (d.site_id === selectedSiteId ? 2.4 : 0.9),
      getLineColor: (d) =>
        d.site_id === selectedSiteId ? [255, 255, 255, 255]
          : d.site_id === hoverSiteId ? [233, 238, 245, 220]
          : [7, 9, 12, 200],
      getFillColor: (d) => {
        const opp = oppBySite.get(d.site_id);
        const raw = def.value(d, opp);
        const dim = (selectedSiteId && d.site_id !== selectedSiteId) || !visibleIds.has(d.site_id);
        /* Sin dato no se pinta un extremo de la rampa: se pinta "sin fuente". */
        if (raw === null) return [107, 119, 135, dim ? 70 : 150];
        if (context === 'OPORTUNIDADES' && opp) {
          const c = INTERVENTION_COLOR[opp.intervention] ?? [240, 180, 41];
          return [c[0], c[1], c[2], dim ? 90 : 235];
        }
        const c = sample(ramp, stretch(raw));
        return [c[0], c[1], c[2], dim ? 90 : 235];
      },
      pickable: true,
      onHover: (info) => setHoverSiteId(info.object ? (info.object as Site).site_id : null),
      onClick: (info) => { if (info.object) selectSite((info.object as Site).site_id); },
      updateTriggers: {
        getFillColor: [context, selectedSiteId, visibleIds, stretch],
        getLineColor: [selectedSiteId, hoverSiteId],
        getLineWidth: [selectedSiteId],
        getRadius: [selectedSiteId, portfolioSites],
      },
      transitions: { getFillColor: 240 },
    }),
  ];

  /* Encuadre progresivo: ciudad → sitio. */
  const cluster = useMemo(
    () => unreached.clusters.find((c) => c.id === selectedClusterId) ?? null,
    [unreached.clusters, selectedClusterId],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selected) {
      map.flyTo({ center: [selected.lon, selected.lat], zoom: 16.2, duration: 850, essential: true });
    } else if (cluster) {
      // Un hueco es un área, no un punto: se encuadra por su extensión.
      const [minx, miny, maxx, maxy] = cluster.bbox;
      map.fitBounds([[minx, miny], [maxx, maxy]], {
        padding: 90, maxZoom: 16, duration: 850, essential: true,
      });
    } else {
      map.flyTo({ center: CENTER, zoom: 14.2, duration: 750, essential: true });
    }
  }, [selected, cluster]);

  /* Relieve real del terreno: capa opcional, declarada como tal. */
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !terrain) return;
    const id = 'terrain-dem';
    try {
      if (showTerrain) {
        if (!map.getSource(id)) {
          map.addSource(id, {
            type: 'raster-dem',
            tiles: [assetUrl('terrain/{z}/{x}/{y}.png')],
            tileSize: 256,
            minzoom: terrain.minzoom ?? 11,
            maxzoom: terrain.maxzoom ?? 14,
            encoding: 'terrarium',
          } as never);
        }
        map.setTerrain({ source: id, exaggeration: 1.4 } as never);
      } else {
        map.setTerrain(null as never);
      }
    } catch {
      /* Sin teselas versionadas el relieve simplemente no se pinta. */
    }
  }, [showTerrain, terrain]);

  const getTooltip = useCallback((info: PickingInfo) => {
    const object = info.object as Record<string, unknown> | null;
    const layer = info.layer;
    if (!object || !layer) return null;
    const style = {
      background: 'rgba(11,14,19,.97)', color: '#e9eef5', fontSize: '11px',
      padding: '8px 10px', borderRadius: '8px', border: '1px solid #2a3340',
      maxWidth: '280px', lineHeight: '1.45',
    };
    if (layer.id === 'sites') {
      const s = object as unknown as Site;
      const opp = oppBySite.get(s.site_id);
      return {
        html: `<b>${opp?.intervention_label ?? s.top_intervention_label ?? s.site_id}</b><br/>
          <span style="color:#8e9aab">${s.site_id}</span>
          <hr style="border:0;border-top:1px solid #2a3340;margin:6px 0"/>
          ${def.readout(s, opp)}`,
        style,
      };
    }
    if (layer.id === 'evidence') {
      const p = object.properties as Record<string, string>;
      return { html: `<b>Observación de daño</b><br/>${p.label}`, style };
    }
    if (layer.id === 'population') {
      const p = object.properties as Record<string, number>;
      return { html: `<b>${Math.round(p.population)} personas</b><br/><span style="color:#8e9aab">celda derivada</span>`, style };
    }
    if (layer.id === 'relief') {
      const c = object as unknown as { population: number; covered_by: string | null };
      return {
        html: `<b>${Math.round(c.population)} personas</b><br/>` +
          (c.covered_by ? `<span style="color:#34d399">alcanzada por ${c.covered_by}</span>`
            : '<span style="color:#8e9aab">sin proyecto que la alcance</span>'),
        style,
      };
    }
    if (layer.id === 'unreached') {
      const c = object as unknown as { population: number; clusterId: string };
      return {
        html: `<b>${Math.round(c.population)} personas sin alcanzar</b><br/>` +
          `<span style="color:#8e9aab">${c.clusterId}</span>`,
        style,
      };
    }
    if (layer.id === 'portfolio-arcs') {
      const a = object as unknown as { site_id: string; rank: number; population: number };
      return { html: `<b>#${a.rank} · ${a.site_id}</b><br/>${Math.round(a.population)} personas nuevas`, style };
    }
    if (layer.id === 'green' || layer.id === 'facilities') {
      const p = object.properties as Record<string, string>;
      return { html: `<b>${p.label ?? layer.id}</b>`, style };
    }
    return null;
  }, [def, oppBySite]);

  /* Expuesto solo para `scripts/checks/browser_check.py`: comprobar que la
     cámara se movió requiere leerla desde fuera de React. */
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__uriCenter = () => {
      const m = mapRef.current?.getMap();
      if (!m) return null;
      const c = m.getCenter();
      return { lng: +c.lng.toFixed(5), lat: +c.lat.toFixed(5), zoom: +m.getZoom().toFixed(2) };
    };
    return () => { delete w.__uriCenter; };
  }, []);

  return (
    <div data-uri="map" className="absolute inset-0">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(e) => setViewState(e.viewState)}
        mapStyle={BASE_STYLE as never}
        attributionControl={false}
        dragRotate
        maxZoom={18}
        minZoom={12}
      >
        <DeckGLOverlay layers={deckLayers} getTooltip={getTooltip} />
      </Map>
      <div data-uri="attribution"
           className="pointer-events-none absolute right-1 bottom-0 z-10 max-w-[70%] px-2 py-1 text-right text-[9px] leading-tight text-mute-400">
        {attribution}
      </div>
    </div>
  );
}
