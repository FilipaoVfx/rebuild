import type { PickingInfo } from '@deck.gl/core';
import { PathStyleExtension } from '@deck.gl/extensions';
import {
  GeoJsonLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer,
} from '@deck.gl/layers';
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Map, { Marker, ScaleControl, useControl, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DAMAGE_LABEL } from '../lib/format';
import { baseStyle, plainStyle } from '../lib/mapstyle';
import {
  evidenceLine, outerRings, placeName, type BBox, type Feature,
} from '../lib/place';
import { useStore } from '../state/store';
import type { Site } from '../types';
import { Icon } from './icons';

type RGBA = [number, number, number, number];
type Props = { properties: Record<string, unknown> };

/* Tinta del mapa por tema: lo que es azul marino de día es claro de noche. */
const INK = { light: [15, 28, 63, 255] as RGBA, dark: [226, 232, 248, 255] as RGBA };
const HALO = { light: [255, 255, 255, 255] as RGBA, dark: [16, 21, 31, 255] as RGBA };
const VEIL = { light: [246, 244, 238, 205] as RGBA, dark: [13, 18, 29, 200] as RGBA };
const COBALT = { light: [27, 69, 196] as const, dark: [111, 147, 255] as const };
export const DAMAGE_RGB: Record<string, RGBA> = {
  POSSIBLY_DAMAGED: [231, 178, 74, 255],
  DAMAGED: [217, 116, 43, 255],
  DESTROYED: [168, 50, 31, 255],
};
/** Más tinta = más gente. Violeta: el cobalto queda para lo seleccionado. */
export const POP_RAMP: RGBA[] = [
  [241, 236, 246, 150], [217, 203, 232, 155], [183, 154, 212, 160], [142, 103, 184, 165], [95, 61, 143, 170],
];
/** De noche, más luz = más gente. */
export const POP_RAMP_DARK: RGBA[] = [
  [52, 38, 82, 150], [80, 56, 124, 160], [114, 82, 170, 170], [152, 114, 212, 180], [198, 164, 242, 190],
];
export const PUBLIC_SPACE: RGBA = [96, 158, 99, 120];
export const OSM_GREEN: RGBA = [150, 196, 140, 95];
export const FACILITY: RGBA = [55, 97, 122, 255];

const AOI_FALLBACK: BBox = [-75.7251, 4.7878, -75.6748, 4.8229];

function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

const ring = ([w, s, e, n]: BBox): [number, number][] => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const isDesktop = () => window.matchMedia('(min-width: 768px)').matches;

/** Espacio que ocupa la interfaz sobre el mapa, para que la cámara no esconda el sitio bajo una tarjeta. */
function uiPadding(hasCard: boolean, panel: string | null) {
  if (!isDesktop()) {
    const h = window.innerHeight;
    return { top: 90, left: 24, right: 24, bottom: hasCard || panel ? Math.round(h * 0.55) : 90 };
  }
  const wide = panel === 'intervenciones' || panel === 'verificacion';
  const right = panel ? (wide ? Math.min(1090, window.innerWidth - 260) : 570) : hasCard ? 470 : 60;
  return { top: 90, left: 60, right, bottom: 100 };
}

interface Hover { x: number; y: number; title: string; sub: string }

export function MapWorkspace() {
  const {
    sites, siteById, layers, layer, selectedSiteId, selectSite, panel, camera, territory, fly,
    theme, settings,
  } = useStore();
  const ink = INK[theme];
  const halo = HALO[theme];
  const cobalt = COBALT[theme];
  const mapRef = useRef<MapRef>(null);
  const [bearing, setBearing] = useState(0);
  const [hover, setHover] = useState<Hover | null>(null);
  const [styleFailed, setStyleFailed] = useState(false);

  const aoi: BBox = territory?.aoi.bbox ?? AOI_FALLBACK;
  const selected = selectedSiteId ? siteById.get(selectedSiteId) ?? null : null;
  const mapStyle = useMemo(() => (styleFailed ? plainStyle(theme) : baseStyle(theme)), [styleFailed, theme]);

  /* ── Cámara ─────────────────────────────────────────────────────── */
  /* La orden puede llegar antes que el mapa (un enlace directo a un sitio):
     se aplica al cargar y cada vez que cambia. */
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !camera || !loaded) return;
    const padding = uiPadding(Boolean(selectedSiteId), panel);
    if (camera.kind === 'home') {
      map.fitBounds([[aoi[0], aoi[1]], [aoi[2], aoi[3]]], { padding, duration: 900 });
    } else if (camera.kind === 'bbox') {
      const [w, s, e, n] = camera.bbox;
      map.fitBounds([[w, s], [e, n]], { padding, duration: 900, maxZoom: 16 });
    } else if (camera.kind === 'point') {
      map.flyTo({ center: camera.lngLat, zoom: camera.zoom, padding, duration: 900 });
    } else {
      const s = siteById.get(camera.siteId);
      if (!s) return;
      map.flyTo({
        center: [s.lon, s.lat],
        zoom: camera.zoom ?? Math.max(map.getZoom(), 15.2),
        padding,
        duration: 900,
        essential: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera?.nonce, loaded]);

  /* ── Datos de las capas ─────────────────────────────────────────── */
  const admin = layers.admin_areas;
  const comunaRings = useMemo(
    () => (admin?.features ?? [])
      .filter((f) => Number(f.properties.admin_level) === 8)
      .flatMap((f) => outerRings(f).map((path) => ({ path, name: String(f.properties.display_name) }))),
    [admin],
  );
  const popBreaks = useMemo(() => {
    const vals = (layers.population?.features ?? [])
      .map((f) => Number(f.properties.population))
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    if (!vals.length) return [0, 0, 0, 0];
    return [0.2, 0.4, 0.6, 0.8].map((q) => vals[Math.floor(vals.length * q)]);
  }, [layers.population]);
  const catchment = useMemo(
    () => (layers.catchments?.features ?? []).filter((f) => f.properties.id === selectedSiteId),
    [layers.catchments, selectedSiteId],
  );

  const showCatchment = Boolean(selected) && (layer === 'poblacion' || panel === 'entorno');
  const showRadius = Boolean(selected) && (layer === 'espacio' || layer === 'equipamientos');

  const onHoverFeature = useCallback((info: PickingInfo, kind: 'space' | 'facility' | 'evidence') => {
    const f = info.object as Feature | undefined;
    if (!f) { setHover(null); return; }
    const p = f.properties;
    if (kind === 'evidence') {
      setHover({
        x: info.x, y: info.y,
        title: DAMAGE_LABEL[String(p.label)] ?? String(p.label),
        sub: 'Observación Copernicus EMS · foto-interpretación',
      });
      return;
    }
    const name = p.display_name ? String(p.display_name) : 'Sin nombre';
    const source = info.layer?.id.startsWith('sigper') ? 'SIGPER' : 'OpenStreetMap';
    setHover({ x: info.x, y: info.y, title: name, sub: `${String(p.label ?? '').replace(/_/g, ' ')} · ${source}` });
  }, []);

  const siteColor = (s: Site): RGBA =>
    layer === 'dano' ? DAMAGE_RGB[s.damage_class ?? ''] ?? [115, 123, 146, 255] : ink;

  const dash = { extensions: [new PathStyleExtension({ dash: true })] };

  const deckLayers = [
    ...(layer === 'poblacion' && layers.population ? [
      new GeoJsonLayer({
        id: 'population',
        data: layers.population as never,
        filled: true, stroked: false,
        getFillColor: (f: Props): RGBA => {
          const v = Number(f.properties.population);
          const i = popBreaks.findIndex((b) => v < b);
          return (theme === 'dark' ? POP_RAMP_DARK : POP_RAMP)[i < 0 ? 4 : i];
        },
        updateTriggers: { getFillColor: [popBreaks, theme] },
      }),
    ] : []),

    /* Fuera del área de estudio el papel se vela: el mapa no finge cubrir toda
       la ciudad. Va encima de la población, cuya malla se sale del recuadro. */
    ...(settings.veil ? [new SolidPolygonLayer({
      id: 'outside-veil',
      data: [{ polygon: [ring([aoi[0] - 0.6, aoi[1] - 0.6, aoi[2] + 0.6, aoi[3] + 0.6]), ring(aoi)] }],
      getPolygon: (d: { polygon: [number, number][][] }) => d.polygon,
      getFillColor: VEIL[theme],
      pickable: false,
      updateTriggers: { getFillColor: theme },
    })] : []),

    ...(layer === 'espacio' ? [
      ...(layers.green ? [new GeoJsonLayer({
        id: 'osm-green',
        data: layers.green as never,
        filled: true, stroked: false,
        getFillColor: OSM_GREEN,
        pickable: true,
        onHover: (i: PickingInfo) => onHoverFeature(i, 'space'),
      })] : []),
      ...(layers.municipal_public_space ? [new GeoJsonLayer({
        id: 'sigper-space',
        data: layers.municipal_public_space as never,
        filled: true, stroked: true,
        getFillColor: PUBLIC_SPACE,
        getLineColor: [62, 120, 66, 210],
        getLineWidth: 1, lineWidthUnits: 'pixels',
        pickable: true,
        onHover: (i: PickingInfo) => onHoverFeature(i, 'space'),
      })] : []),
    ] : []),

    ...(layer === 'equipamientos' ? [
      ...(layers.municipal_facilities ? [new GeoJsonLayer({
        id: 'sigper-facilities',
        data: layers.municipal_facilities as never,
        filled: true, stroked: true,
        getFillColor: [55, 97, 122, 55],
        getLineColor: [55, 97, 122, 200],
        getLineWidth: 1, lineWidthUnits: 'pixels',
        pickable: true,
        onHover: (i: PickingInfo) => onHoverFeature(i, 'facility'),
      })] : []),
      ...(layers.facilities ? [new GeoJsonLayer({
        id: 'osm-facilities',
        data: layers.facilities as never,
        pointType: 'circle',
        getPointRadius: 5, pointRadiusUnits: 'pixels',
        getFillColor: FACILITY,
        getLineColor: halo, getLineWidth: 1.5, lineWidthUnits: 'pixels',
        stroked: true, filled: true,
        pickable: true,
        onHover: (i: PickingInfo) => onHoverFeature(i, 'facility'),
      })] : []),
    ] : []),

    /* Límites de comuna, en trazo discontinuo como en la leyenda. */
    new PathLayer({
      id: 'comunas',
      data: comunaRings,
      getPath: (d: { path: [number, number][] }) => d.path,
      getColor: theme === 'dark' ? [140, 150, 176, 160] : [105, 113, 138, 170],
      updateTriggers: { getColor: theme },
      getWidth: 1.2, widthUnits: 'pixels',
      getDashArray: [5, 4],
      ...dash,
    } as never),
    new PathLayer({
      id: 'aoi',
      data: [{ path: ring(aoi) }],
      getPath: (d: { path: [number, number][] }) => d.path,
      getColor: [ink[0], ink[1], ink[2], 150],
      updateTriggers: { getColor: theme },
      getWidth: 1.6, widthUnits: 'pixels',
      getDashArray: [9, 5],
      ...dash,
    } as never),

    ...(showCatchment && catchment.length ? [new GeoJsonLayer({
      id: 'catchment',
      data: { type: 'FeatureCollection', features: catchment } as never,
      filled: true, stroked: true,
      getFillColor: [...cobalt, 26],
      getLineColor: [...cobalt, 230],
      updateTriggers: { getFillColor: theme, getLineColor: theme },
      getLineWidth: 1.8, lineWidthUnits: 'pixels',
    })] : []),
    ...(showRadius && selected ? [new ScatterplotLayer({
      id: 'radius',
      data: [selected],
      getPosition: (s: Site) => [s.lon, s.lat],
      getRadius: settings.radius, radiusUnits: 'meters',
      filled: true, stroked: true,
      getFillColor: [...cobalt, 16],
      getLineColor: [...cobalt, 210],
      updateTriggers: { getRadius: settings.radius, getFillColor: theme, getLineColor: theme },
      getLineWidth: 1.5, lineWidthUnits: 'pixels',
    })] : []),

    ...(layer === 'dano' && layers.evidence ? [new ScatterplotLayer({
      id: 'evidence',
      data: layers.evidence.features,
      getPosition: (f: Feature) => f.geometry.coordinates as [number, number],
      getRadius: 3.5, radiusUnits: 'pixels',
      getFillColor: (f: Feature) => DAMAGE_RGB[String(f.properties.label)] ?? [115, 123, 146, 255],
      stroked: true, getLineColor: [255, 255, 255, 230], getLineWidth: 1, lineWidthUnits: 'pixels',
      pickable: true,
      onHover: (i: PickingInfo) => onHoverFeature(i, 'evidence'),
    })] : []),

    new ScatterplotLayer({
      id: 'sites',
      data: sites.filter((s) => s.site_id !== selectedSiteId),
      getPosition: (s: Site) => [s.lon, s.lat],
      getRadius: layer === 'dano' ? 6.5 : 5,
      radiusUnits: 'pixels',
      getFillColor: siteColor,
      stroked: true, getLineColor: halo, getLineWidth: 1.6, lineWidthUnits: 'pixels',
      pickable: true,
      autoHighlight: true,
      highlightColor: [27, 69, 196, 255],
      onHover: (info: PickingInfo) => {
        const s = info.object as Site | undefined;
        setHover(s ? {
          x: info.x, y: info.y,
          title: placeName(s),
          sub: layer === 'dano' ? evidenceLine(s) : `${s.commune ? `Comuna ${s.commune} · ` : ''}sitio con evidencia de daño`,
        } : null);
      },
      onClick: (info: PickingInfo) => {
        const s = info.object as Site | undefined;
        if (s) selectSite(s.site_id);
      },
      updateTriggers: { getFillColor: [layer, theme], getLineColor: theme },
    }),

  ];

  return (
    <div className="absolute inset-0" data-uri="map">
      <Map
        ref={mapRef}
        initialViewState={{
          bounds: [[aoi[0], aoi[1]], [aoi[2], aoi[3]]],
          fitBoundsOptions: { padding: { top: 120, left: 40, right: 40, bottom: 60 } },
        }}
        maxBounds={[[aoi[0] - 0.08, aoi[1] - 0.06], [aoi[2] + 0.08, aoi[3] + 0.06]]}
        minZoom={11.5}
        maxZoom={18.5}
        mapStyle={mapStyle}
        attributionControl={false}
        dragRotate={false}
        onError={(e) => {
          /* Si el extracto de la cartografía base no carga, el mapa sigue: papel liso. */
          if (!styleFailed && String(e.error?.message ?? '').match(/pmtiles|style|sprite|glyph/i)) setStyleFailed(true);
        }}
        onLoad={() => setLoaded(true)}
        onMove={(e) => setBearing(e.viewState.bearing)}
        onClick={() => setHover(null)}
        style={{ position: 'absolute', inset: 0 }}
      >
        <DeckGLOverlay layers={deckLayers} interleaved={false} getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')} />
        {selected && (
          <Marker longitude={selected.lon} latitude={selected.lat} anchor="bottom">
            <SitePin name={placeName(selected)} />
          </Marker>
        )}
        <ScaleControl position="bottom-left" unit="metric" maxWidth={120} />
      </Map>

      {selected && !panel && loaded && <LeaderLine mapRef={mapRef} site={selected} />}

      {hover && (
        <div
          className="float pointer-events-none absolute z-20 max-w-[260px] px-3 py-2"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <p className="text-[14px] font-semibold leading-tight">{hover.title}</p>
          <p className="text-[12.5px] leading-snug text-ink-3">{hover.sub}</p>
        </div>
      )}

      <div className="float absolute bottom-4 left-3 z-10 hidden flex-col overflow-hidden md:flex">
        {[
          { label: 'Acercar', icon: <Icon.Plus size={18} />, on: () => mapRef.current?.getMap().zoomIn() },
          { label: 'Alejar', icon: <Icon.Minus size={18} />, on: () => mapRef.current?.getMap().zoomOut() },
          { label: 'Ver todo el sector de estudio', icon: <Icon.Target size={18} />, on: () => fly({ kind: 'home' }) },
        ].map((b) => (
          <button
            key={b.label} type="button" onClick={b.on} aria-label={b.label} title={b.label}
            className="grid size-10 place-items-center border-b border-rule text-ink last:border-b-0 hover:bg-wash"
          >
            {b.icon}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => mapRef.current?.getMap().easeTo({ bearing: 0, pitch: 0 })}
        aria-label="Norte arriba"
        title="Norte arriba"
        className="float absolute bottom-[140px] left-3 z-10 hidden size-10 place-items-center rounded-full md:grid"
      >
        <span className="flex flex-col items-center leading-none" style={{ transform: `rotate(${-bearing}deg)` }}>
          <Icon.Compass size={18} className="text-ink" />
          <span className="-mt-0.5 text-[10px] font-bold text-ink">N</span>
        </span>
      </button>
    </div>
  );
}

function SitePin({ name }: { name: string }) {
  return (
    <div className="relative flex flex-col items-center" aria-label={`Sitio seleccionado: ${name}`}>
      <svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true" className="drop-shadow-[0_2px_3px_rgba(15,28,63,.35)]">
        <path d="M15 37S3 24.6 3 14.5a12 12 0 0 1 24 0C27 24.6 15 37 15 37z" fill="var(--color-cobalt)" stroke="var(--color-card)" strokeWidth="2" />
        <circle cx="15" cy="14.5" r="4.6" fill="var(--color-card)" />
      </svg>
      <span className="absolute top-[22px] left-[30px] font-serif text-[16px] font-semibold whitespace-nowrap text-ink [text-shadow:0_0_3px_var(--color-paper),0_0_6px_var(--color-paper)]">
        {name}
      </span>
    </div>
  );
}

/**
 * La línea que une el pin con su tarjeta. Se recalcula con la cámara y con
 * el tamaño de la tarjeta; si el pin queda debajo de la tarjeta, no se dibuja.
 */
function LeaderLine({ mapRef, site }: { mapRef: React.RefObject<MapRef | null>; site: Site }) {
  const [d, setD] = useState<string | null>(null);
  const frame = useRef(0);

  const update = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const map = mapRef.current?.getMap();
      const card = document.getElementById('place-card');
      if (!map || !card || !isDesktop()) { setD(null); return; }
      const box = map.getContainer().getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const p = map.project([site.lon, site.lat]);
      const cardLeft = c.left - box.left;
      const cardTop = c.top - box.top;
      const labelEnd = p.x + 30 + placeName(site).length * 8.6 + 8;
      if (labelEnd + 24 > cardLeft || p.y < 0 || p.y > box.height) { setD(null); return; }
      const y0 = p.y + 2;
      const ty = cardTop + Math.min(c.height * 0.46, 250);
      setD(`M${p.x + 30},${y0} H${labelEnd} L${cardLeft},${ty}`);
    });
  }, [mapRef, site]);

  useLayoutEffect(() => {
    const map = mapRef.current?.getMap();
    update();
    map?.on('move', update);
    window.addEventListener('resize', update);
    const card = document.getElementById('place-card');
    const ro = card ? new ResizeObserver(update) : null;
    if (card) ro?.observe(card);
    return () => {
      map?.off('move', update);
      window.removeEventListener('resize', update);
      ro?.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [mapRef, update]);

  if (!d) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 size-full" aria-hidden="true" data-uri="leader">
      <path d={d} fill="none" stroke="var(--color-cobalt)" strokeWidth="1.4" />
    </svg>
  );
}
