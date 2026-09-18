import type { PickingInfo } from '@deck.gl/core';
import { CollisionFilterExtension, MaskExtension, PathStyleExtension } from '@deck.gl/extensions';
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox';
import {
  BitmapLayer, GeoJsonLayer, PathLayer, ScatterplotLayer, TextLayer,
} from '@deck.gl/layers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { ScaleControl, useControl, type MapRef, type ViewState } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { assetUrl, sentinelImageUrl, type SentinelScene } from '../data';
import { REDUNDANT_ON_BASEMAP, isBasemap, styleFor } from '../lib/basemap';
import { contextByKey } from '../lib/contexts';
import { fecha } from '../lib/format';
import {
  ADMIN_COLOR, BUILDING_FILL, BUILDING_FILL_TERRITORY, INTERVENTION_COLOR, LANDMARK_COLOR,
  RAMPS, ROAD_DEFAULT, ROAD_STYLE, WATER_COLOR, sample, type RGB, type RGBA,
} from '../lib/palette';
import { useStore } from '../state/store';
import type { GeoJSON, Site } from '../types';

/**
 * Sin basemap de terceros, y no por estética: un tile servido por otro no
 * tiene `data_version` y rompe la reproducibilidad (fuentes.md §11). La
 * cartografía base de calles es un extracto de OSM que servimos nosotros
 * (lib/basemap.ts), y el resto sale de las capas del propio repositorio:
 * huellas de Microsoft, límites, ríos e hitos de OSM. Las etiquetas propias se
 * dibujan con `TextLayer` y la tipografía del sistema (ADR-22).
 */
const FONT = '"Inter var", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

const CENTER: [number, number] = [-75.6935, 4.8085];
const HOME_ZOOM = 14.2;
const HOME_BEARING = -14;

type Feature = GeoJSON['features'][number];
/* Forma mínima que deck.gl acepta en los accesores de GeoJsonLayer sin pelear con sus genéricos. */
type Props = { properties: Record<string, unknown> };
type BBox = [number, number, number, number];

/** El texto se acuesta sobre la calle: azimut (desde el norte, horario) → giro CCW desde el este, en (-90, 90]. */
function roadAngle(azimuth: number): number {
  let a = 90 - azimuth;
  while (a > 90) a -= 180;
  while (a <= -90) a += 180;
  return a;
}

function padBBox([w, s, e, n]: BBox, share: number): [[number, number], [number, number]] {
  const dx = (e - w) * share;
  const dy = (n - s) * share;
  return [[w - dx, s - dy], [e + dx, n + dy]];
}

function bboxRing([w, s, e, n]: BBox): [number, number][] {
  return [[w, s], [e, s], [e, n], [w, n], [w, s]];
}

export function MapCanvas() {
  const {
    sites, oppBySite, layers, context, selectedSiteId, selectSite,
    hoverSiteId, setHoverSiteId, visibleOpportunities,
    terrain, showTerrain, discrimination,
    territory, sentinel, imagery, imageryCollection, swipe, setSwipe, highlightedAdminId,
    baseMap,
  } = useStore();

  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState<Partial<ViewState>>({
    longitude: CENTER[0], latitude: CENTER[1], zoom: HOME_ZOOM, pitch: 0, bearing: HOME_BEARING,
  });
  const zoom = viewState.zoom ?? HOME_ZOOM;
  const bearing = viewState.bearing ?? HOME_BEARING;

  const def = contextByKey(context);
  const ramp = RAMPS[context];
  const territorial = context === 'TERRITORIO';
  const neutral = def.sitesMode === 'neutral';
  const onBasemap = isBasemap(baseMap);
  const lightTheme = baseMap === 'calles';
  const mapStyle = useMemo(() => styleFor(baseMap), [baseMap]);
  /* Con cartografía base, lo que ella ya dibuja (calles, manzanas, ríos y sus
     nombres) no se repite encima. Se apaga aquí y no en el contexto: el
     contexto dice qué responde a la pregunta; el tipo de mapa, qué ya está. */
  const on = (name: string) =>
    def.layers.includes(name as never) && !(onBasemap && REDUNDANT_ON_BASEMAP.has(name));
  /* Las etiquetas propias siguen al fondo: claras sobre negro, oscuras sobre claro. */
  const ink: RGBA = lightTheme ? [30, 37, 48, 255] : [214, 221, 232, 250];
  const inkSoft: RGBA = lightTheme ? [60, 70, 86, 240] : [168, 178, 194, 240];
  const halo: RGBA = lightTheme ? [255, 255, 255, 240] : [7, 9, 12, 255];

  /* La atribución sale de la procedencia, no de una constante en el código. */
  const provenance = useStore().provenance;
  const attribution = useMemo(
    () => (provenance.layers ?? []).map((l) => l.attribution).filter(Boolean).join(' · '),
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

  const gj = (name: string): GeoJSON | undefined => layers[name as never] as GeoJSON | undefined;

  const selected = selectedSiteId ? sites.find((s) => s.site_id === selectedSiteId) ?? null : null;

  /* ── Imagen de fondo ──────────────────────────────────────────────── */
  const scenes = useMemo(() => {
    if (!sentinel) return null;
    const coll = imageryCollection === 's1' ? 'sentinel-1-grd' : 'sentinel-2-l2a';
    const pre = sentinel.scenes.find((s) => s.collection === coll && s.window === 'PRE');
    const post = sentinel.scenes.find((s) => s.collection === coll && s.window === 'POST');
    return pre && post ? { pre, post } : null;
  }, [sentinel, imageryCollection]);
  const sentinelOn = imagery === 'sentinel' && scenes !== null;
  const ortofoto = useMemo(
    () => territory?.imagery.ortofotos.find((o) => o.source_id === imagery && o.status === 'AVAILABLE') ?? null,
    [territory, imagery],
  );
  const imageryOn = sentinelOn || ortofoto !== null;

  /* La cortina es una línea de PANTALLA: con bearing -14 un meridiano no es
     vertical. Se desproyectan las cuatro esquinas de la mitad izquierda y ese
     cuadrilátero, en coordenadas geográficas, es la máscara del "después". */
  const [swipeMask, setSwipeMask] = useState<GeoJSON | null>(null);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !sentinelOn) { setSwipeMask(null); return; }
    const { width, height } = map.getCanvas().getBoundingClientRect();
    const x = Math.max(1, Math.min(width - 1, width * swipe));
    const corners: [number, number][] = [[0, 0], [x, 0], [x, height], [0, height]];
    const ring = corners.map((c) => {
      const ll = map.unproject(c as [number, number]);
      return [ll.lng, ll.lat] as [number, number];
    });
    ring.push(ring[0]);
    setSwipeMask({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} }],
    });
  }, [sentinelOn, swipe, viewState]);

  /* Con imagen debajo, el tejido se apaga: la foto ya es la ciudad. */
  const buildingFill: RGBA = imageryOn
    ? [30, 37, 48, 0]
    : territorial ? BUILDING_FILL_TERRITORY : BUILDING_FILL;
  const roadAlpha = imageryOn ? 0.45 : 1;

  const pointOf = (f: Feature): [number, number] => {
    const c = f.geometry.coordinates as [number, number];
    return [c[0], c[1]];
  };
  const labelPointOf = (f: Feature): [number, number] =>
    [Number(f.properties.label_lon), Number(f.properties.label_lat)];

  const adminGeo = gj('admin_areas');
  const admin89 = useMemo<Feature[]>(
    () => (adminGeo?.features ?? []).filter((f) => Number(f.properties.admin_level) !== 7),
    [adminGeo],
  );
  const perimeterPaths = useMemo(
    () => (adminGeo?.features ?? [])
      .filter((f) => Number(f.properties.admin_level) === 7)
      .flatMap((f) => {
        const coords = f.geometry.type === 'MultiPolygon'
          ? (f.geometry.coordinates as number[][][][]).map((p) => p[0])
          : [(f.geometry.coordinates as number[][][])[0]];
        return coords.map((ring) => ({ path: ring, name: String(f.properties.display_name ?? '') }));
      }),
    [adminGeo],
  );
  const communeLabels = useMemo(
    () => admin89.filter((f) => Number(f.properties.admin_level) === 8),
    [admin89],
  );
  const neighbourhoodLabels = useMemo(
    () => admin89.filter((f) => Number(f.properties.admin_level) === 9),
    [admin89],
  );
  const highlighted = useMemo(
    () => admin89.filter((f) => Number(f.properties.id) === highlightedAdminId),
    [admin89, highlightedAdminId],
  );

  const landmarks = gj('landmarks');
  const landmarkCap = zoom >= 16 ? 4 : zoom >= 15 ? 3 : 2;
  const visibleLandmarks = useMemo(
    () => (landmarks?.features ?? []).filter((f) => Number(f.properties.priority) <= landmarkCap),
    [landmarks, landmarkCap],
  );
  /* Descongestión propia para los hitos: los importantes primero, y ninguno
     encima de otro ni de un nombre de comuna. Se recalcula con la cámara. */
  const labelledLandmarks = useMemo(() => {
    const map = mapRef.current?.getMap();
    if (!map) return visibleLandmarks;
    const taken: [number, number, number, number][] = [];
    const box = (x: number, y: number, text: string, size: number): [number, number, number, number] => {
      const w = text.length * size * 0.58 + 8;
      return [x - w / 2, y - size - 16, x + w / 2, y - 2];
    };
    const overlaps = (a: number[], b: number[]) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    for (const f of communeLabels) {
      const [lon, lat] = labelPointOf(f);
      const pt = map.project([lon, lat]);
      const w = String(f.properties.display_name).length * 13 * 0.7 + 8;
      taken.push([pt.x - w / 2, pt.y - 10, pt.x + w / 2, pt.y + 10]);
    }
    const sorted = [...visibleLandmarks].sort(
      (a, b) => Number(a.properties.priority) - Number(b.properties.priority),
    );
    const kept: Feature[] = [];
    for (const f of sorted) {
      const [lon, lat] = pointOf(f);
      const pt = map.project([lon, lat]);
      const size = Number(f.properties.priority) <= 2 ? 12 : 11;
      const b = box(pt.x, pt.y, String(f.properties.display_name), size);
      if (taken.some((t) => overlaps(t, b))) continue;
      taken.push(b);
      kept.push(f);
    }
    return kept;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLandmarks, communeLabels, viewState]);
  const roadLabels = gj('road_labels');
  const visibleRoadLabels = useMemo(() => {
    const main = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
    return (roadLabels?.features ?? []).filter((f) => {
      const cls = String(f.properties.label);
      return main.has(cls) ? zoom >= 15 : zoom >= 16.5;
    });
  }, [roadLabels, zoom]);
  const cityLabel = useMemo(
    () => (gj('places')?.features ?? []).filter((f) => f.properties.label === 'city'),
    [layers],
  );


  const labelFont = {
    fontFamily: FONT,
    characterSet: 'auto' as const,
    fontSettings: { sdf: true, fontSize: 96, buffer: 6, radius: 8, cutoff: 0.22 },
    outlineWidth: 5,
    outlineColor: halo,
    sizeUnits: 'pixels' as const,
  };
  const collision = { extensions: [new CollisionFilterExtension()], collisionGroup: 'labels' };

  const deckLayers = [
    /* --- imagen: observación con fecha y limitación al lado, nunca veredicto (ADR-19) --- */
    ...(sentinelOn && scenes ? [
      new BitmapLayer({
        id: 'sentinel-pre',
        image: sentinelImageUrl(scenes.pre),
        bounds: scenes.pre.bbox,
        opacity: 0.92,
        pickable: false,
      }),
      ...(swipeMask ? [
        new GeoJsonLayer({ id: 'swipe-mask', data: swipeMask as never, operation: 'mask' }),
        new BitmapLayer({
          id: 'sentinel-post',
          image: sentinelImageUrl(scenes.post),
          bounds: scenes.post.bbox,
          opacity: 0.92,
          pickable: false,
          extensions: [new MaskExtension()],
          maskId: 'swipe-mask',
          maskInverted: true,
        } as never),
      ] : []),
    ] : []),

    /* --- tejido urbano: el papel sobre el que se dibuja todo --- */
    ...(!onBasemap && gj('buildings') ? [
      new GeoJsonLayer({
        id: 'buildings',
        data: gj('buildings') as never,
        filled: true, stroked: false,
        getFillColor: buildingFill,
        pickable: false,
        updateTriggers: { getFillColor: [buildingFill] },
      }),
    ] : []),
    ...(on('municipal_facilities') && gj('municipal_facilities') && zoom >= 15 ? [
      new GeoJsonLayer({
        id: 'municipal_facilities',
        data: gj('municipal_facilities') as never,
        filled: true, stroked: true,
        getFillColor: [147, 197, 253, 22],
        getLineColor: [147, 197, 253, 140],
        getLineWidth: 0.8, lineWidthUnits: 'pixels',
        pickable: true,
      }),
    ] : []),
    ...(on('roads') && gj('roads') ? [
      new GeoJsonLayer({
        id: 'roads',
        data: gj('roads') as never,
        stroked: true, filled: false,
        getLineColor: (f: Props): RGBA => {
          const c = (ROAD_STYLE[String(f.properties.label)] ?? ROAD_DEFAULT).color;
          return [c[0], c[1], c[2], Math.round(c[3] * roadAlpha)];
        },
        getLineWidth: (f: Props): number => (ROAD_STYLE[String(f.properties.label)] ?? ROAD_DEFAULT).width,
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: 0.4,
        pickable: territorial,
        updateTriggers: { getLineColor: [roadAlpha] },
      }),
    ] : []),
    ...(on('waterways') && gj('waterways') ? [
      new GeoJsonLayer({
        id: 'waterways',
        data: gj('waterways') as never,
        stroked: true, filled: false,
        getLineColor: (f: Props): RGBA =>
          f.properties.label === 'river' ? WATER_COLOR : [WATER_COLOR[0], WATER_COLOR[1], WATER_COLOR[2], 150],
        getLineWidth: (f: Props): number => (f.properties.label === 'river' ? 2.2 : 1.1),
        lineWidthUnits: 'pixels',
        pickable: true,
      }),
    ] : []),

    /* --- límites: comunas siempre, barrios de cerca; el perímetro discontinuo --- */
    ...(on('admin_areas') && admin89.length ? [
      new GeoJsonLayer({
        id: 'admin-outlines',
        data: admin89.filter((f) => Number(f.properties.admin_level) === 8 || zoom >= 14.5) as never,
        filled: false, stroked: true,
        getLineColor: (f: Props): RGBA => {
          const c = ADMIN_COLOR[Number(f.properties.admin_level)] ?? ADMIN_COLOR[9];
          return lightTheme ? [Math.round(c[0] * 0.5), Math.round(c[1] * 0.5), Math.round(c[2] * 0.5), c[3]] : c;
        },
        getLineWidth: (f: Props): number => (Number(f.properties.admin_level) === 8 ? 1.6 : 0.7),
        lineWidthUnits: 'pixels',
        pickable: territorial,
        updateTriggers: { getLineColor: [lightTheme] },
      }),
    ] : []),
    ...(highlighted.length ? [
      new GeoJsonLayer({
        id: 'admin-highlight',
        data: highlighted as never,
        filled: true, stroked: true,
        getFillColor: [240, 180, 41, 40],
        getLineColor: [240, 180, 41, 220],
        getLineWidth: 2, lineWidthUnits: 'pixels',
        pickable: false,
      }),
    ] : []),
    ...(on('admin_areas') && perimeterPaths.length ? [
      new PathLayer({
        id: 'urban-perimeter',
        data: perimeterPaths,
        getPath: (d: { path: number[][] }) => d.path as never,
        getColor: ADMIN_COLOR[7],
        getWidth: 1.4, widthUnits: 'pixels',
        getDashArray: [6, 4], dashJustified: true,
        extensions: [new PathStyleExtension({ dash: true })],
        pickable: false,
      } as never),
    ] : []),
    /* Lo que este visor cubre, dicho en el mapa: el AOI de Copernicus EMS. */
    ...(territory ? [
      new PathLayer({
        id: 'aoi-outline',
        data: [{ path: bboxRing(territory.aoi.bbox) }],
        getPath: (d: { path: number[][] }) => d.path as never,
        getColor: [240, 180, 41, territorial ? 200 : 110],
        getWidth: 1.2, widthUnits: 'pixels',
        getDashArray: [3, 3],
        extensions: [new PathStyleExtension({ dash: true })],
        pickable: false,
        updateTriggers: { getColor: [territorial] },
      } as never),
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

    /* --- hitos: un punto y su nombre, los importantes primero --- */
    ...(on('landmarks') && visibleLandmarks.length && zoom >= 14 ? [
      new ScatterplotLayer({
        id: 'landmarks',
        data: visibleLandmarks,
        getPosition: pointOf,
        getRadius: (f: Feature) => (Number(f.properties.priority) <= 2 ? 4.2 : 3.2),
        radiusUnits: 'pixels',
        stroked: true, getLineColor: [7, 9, 12, 220], getLineWidth: 1, lineWidthUnits: 'pixels',
        getFillColor: (f: Feature) => LANDMARK_COLOR[String(f.properties.label)] ?? [182, 192, 206, 200],
        pickable: true,
      }),
      new TextLayer({
        id: 'landmark-labels',
        data: labelledLandmarks,
        getPosition: pointOf,
        getText: (f: Feature) => String(f.properties.display_name),
        getSize: (f: Feature) => (Number(f.properties.priority) <= 2 ? 12 : 11),
        getColor: (f: Feature) => {
          const c = LANDMARK_COLOR[String(f.properties.label)] ?? [182, 192, 206, 200];
          return lightTheme
            ? [Math.round(c[0] * 0.55), Math.round(c[1] * 0.55), Math.round(c[2] * 0.55), 255]
            : [Math.min(255, c[0] + 40), Math.min(255, c[1] + 40), Math.min(255, c[2] + 40), 250];
        },
        updateTriggers: { getColor: [lightTheme] },
        getPixelOffset: [0, -12],
        getTextAnchor: 'middle', getAlignmentBaseline: 'bottom',
        fontWeight: 600,
        ...labelFont,
        pickable: false,
      } as never),
    ] : []),

    /* --- nombres del territorio --- */
    ...(on('road_labels') && visibleRoadLabels.length ? [
      new TextLayer({
        id: 'road-labels',
        data: visibleRoadLabels,
        getPosition: pointOf,
        getText: (f: Feature) => String(f.properties.display_name),
        getAngle: (f: Feature) => roadAngle(Number(f.properties.azimuth)),
        getSize: (f: Feature) =>
          ['motorway', 'trunk', 'primary'].includes(String(f.properties.label)) ? 11.5 : 10.5,
        getColor: [196, 205, 218, 235],
        fontWeight: 500,
        billboard: false,
        getTextAnchor: 'middle', getAlignmentBaseline: 'center',
        getCollisionPriority: (f: Feature) => (Number(f.properties.length_m) > 800 ? 3 : 1),
        collisionTestProps: { sizeScale: 1.5 },
        ...labelFont, ...collision,
        pickable: false,
      } as never),
    ] : []),
    ...(on('admin_areas') && !onBasemap && neighbourhoodLabels.length && zoom >= 15 ? [
      new TextLayer({
        id: 'neighbourhood-labels',
        data: neighbourhoodLabels,
        getPosition: labelPointOf,
        getText: (f: Feature) => String(f.properties.display_name),
        getSize: 11.5,
        getColor: inkSoft,
        getTextAnchor: 'middle', getAlignmentBaseline: 'center',
        getCollisionPriority: 4,
        updateTriggers: { getColor: [lightTheme] },
        collisionTestProps: { sizeScale: 1.5 },
        ...labelFont, ...collision,
        pickable: false,
      } as never),
    ] : []),
    ...(on('admin_areas') && communeLabels.length ? [
      new TextLayer({
        id: 'commune-labels',
        data: communeLabels,
        getPosition: labelPointOf,
        getText: (f: Feature) => String(f.properties.display_name).toUpperCase(),
        getSize: 13.5,
        getColor: ink,
        getTextAnchor: 'middle', getAlignmentBaseline: 'center',
        fontWeight: 600,
        getCollisionPriority: 9,
        updateTriggers: { getColor: [lightTheme] },
        collisionTestProps: { sizeScale: 1.3 },
        ...labelFont, ...collision,
        pickable: false,
      } as never),
    ] : []),
    ...(on('places') && cityLabel.length && zoom < 13.5 ? [
      new TextLayer({
        id: 'city-label',
        data: cityLabel,
        getPosition: pointOf,
        getText: (f: Feature) => String(f.properties.display_name).toUpperCase(),
        getSize: 16,
        getColor: [233, 238, 245, 250],
        getTextAnchor: 'middle', getAlignmentBaseline: 'center',
        fontWeight: 700,
        ...labelFont,
        pickable: false,
      } as never),
    ] : []),

    /* --- sitios: el dato que el contexto colorea, o puntos neutros si no evalúa --- */
    new ScatterplotLayer<Site>({
      id: 'sites',
      data: sites,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => (neutral ? 9 : 26) + (d.site_id === selectedSiteId ? 18 : 0),
      radiusUnits: 'meters',
      radiusMinPixels: neutral ? 2.5 : 4.5,
      radiusMaxPixels: neutral ? 7 : 22,
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: (d) => (d.site_id === selectedSiteId ? 2.4 : neutral ? 0.5 : 0.9),
      getLineColor: (d) =>
        d.site_id === selectedSiteId ? [255, 255, 255, 255]
          : d.site_id === hoverSiteId ? [233, 238, 245, 220]
          : [7, 9, 12, 200],
      getFillColor: (d) => {
        const opp = oppBySite.get(d.site_id);
        const dim = (selectedSiteId && d.site_id !== selectedSiteId) || !visibleIds.has(d.site_id);
        /* Sin evaluar no se pinta nada: gris neutro, el color de "esto es un sitio". */
        if (neutral) return lightTheme ? [60, 70, 86, dim ? 90 : 190] : [142, 154, 171, dim ? 70 : 165];
        const raw = def.value(d, opp);
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
        getFillColor: [context, selectedSiteId, visibleIds, stretch, neutral, lightTheme],
        getLineColor: [selectedSiteId, hoverSiteId],
        getLineWidth: [selectedSiteId],
        getRadius: [selectedSiteId, neutral],
      },
      transitions: { getFillColor: 240 },
    }),
  ];

  /* Encuadre progresivo: ciudad → comuna → sitio. */
  const highlightedComuna = useMemo(
    () => territory?.comunas.find((c) => c.osm_id === highlightedAdminId) ?? null,
    [territory, highlightedAdminId],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selected) {
      map.flyTo({ center: [selected.lon, selected.lat], zoom: 16.2, duration: 850, essential: true });
    } else if (highlightedComuna) {
      const [minx, miny, maxx, maxy] = highlightedComuna.bbox;
      map.fitBounds([[minx, miny], [maxx, maxy]], {
        padding: 60, maxZoom: 15.5, duration: 850, essential: true,
      });
    } else {
      map.flyTo({ center: CENTER, zoom: HOME_ZOOM, duration: 750, essential: true });
    }
  }, [selected, highlightedComuna]);

  /* Relieve real del terreno: capa opcional, declarada como tal. Cambiar de
     tipo de mapa reemplaza el estilo y se lleva las fuentes añadidas a mano,
     así que la capa se vuelve a montar cuando el estilo nuevo termina de cargar. */
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !terrain) return;
    const id = 'terrain-dem';
    const apply = () => { try {
      if (showTerrain) {
        if (!map.getSource(id)) {
          map.addSource(id, {
            type: 'raster-dem',
            tiles: [assetUrl('terrain/{z}/{x}/{y}.png')],
            tileSize: 256,
            minzoom: terrain.minzoom ?? 11,
            maxzoom: terrain.maxzoom ?? 14,
            /* Solo hay teselas del AOI: sin `bounds`, MapLibre pediría las de
               alrededor y cada una sería un 404. */
            bounds: terrain.aoi_bbox,
            /* Lo que dice el índice, no una constante: `fetch_terrain.py`
               codifica con la fórmula de Mapbox y así lo declara. */
            encoding: terrain.encoding ?? 'mapbox',
          } as never);
        }
        map.setTerrain({ source: id, exaggeration: 1.4 } as never);
      } else {
        map.setTerrain(null as never);
      }
    } catch {
      /* Sin teselas versionadas el relieve simplemente no se pinta. */
    } };
    if (map.isStyleLoaded()) apply(); else map.once('style.load', apply);
  }, [showTerrain, terrain, baseMap]);

  /* Ortofoto: teselas propias, servidas solo si la fuente se puede redistribuir.
     Va como capa ráster de MapLibre bajo todo lo de deck.gl. */
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const id = 'ortofoto';
    const apply = () => { try {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      if (!ortofoto?.index) return;
      map.addSource(id, {
        type: 'raster',
        tiles: [assetUrl(`ortofoto/${ortofoto.source_id}/{z}/{x}/{y}.${ortofoto.index.format ?? 'png'}`)],
        tileSize: ortofoto.index.tile_size ?? 256,
        minzoom: ortofoto.index.minzoom,
        maxzoom: ortofoto.index.maxzoom,
        bounds: ortofoto.index.aoi_bbox,
      } as never);
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0.92 } } as never);
    } catch {
      /* Sin teselas, sin capa. El toggle ya dijo por qué. */
    } };
    if (map.isStyleLoaded()) apply(); else map.once('style.load', apply);
  }, [ortofoto, baseMap]);

  const getTooltip = useCallback((info: PickingInfo) => {
    const object = info.object as Record<string, unknown> | null;
    const layer = info.layer;
    if (!object || !layer) return null;
    const style = {
      background: 'rgba(11,14,19,.97)', color: '#e9eef5', fontSize: '11px',
      padding: '8px 10px', borderRadius: '8px', border: '1px solid #2a3340',
      maxWidth: '280px', lineHeight: '1.45',
    };
    const named = (kind: string, fallback?: string) => {
      const p = object.properties as Record<string, string | number | null>;
      const name = p.display_name ? String(p.display_name) : null;
      return {
        html: `<b>${name ?? fallback ?? kind}</b><br/><span style="color:#8e9aab">${kind}${name ? '' : ' · sin nombre en OSM'}</span>`,
        style,
      };
    };
    if (layer.id === 'sites') {
      const s = object as unknown as Site;
      const opp = oppBySite.get(s.site_id);
      const place = opp?.place?.place_line ?? s.place_line;
      return {
        html: `<b>${opp?.intervention_label ?? s.top_intervention_label ?? s.site_id}</b><br/>
          <span style="color:#8e9aab">${s.site_id}</span>
          ${place ? `<div style="margin-top:4px;color:#b6c0ce">${place}</div>`
            : '<div style="margin-top:4px;color:#8e9aab">ubicación sin fuente</div>'}
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
    if (layer.id === 'green') return named('espacio verde (OSM)', String((object.properties as Record<string, unknown>).label));
    if (layer.id === 'facilities') return named('equipamiento (OSM)', String((object.properties as Record<string, unknown>).label));
    if (layer.id === 'municipal_facilities') {
      return named(`equipamiento municipal · ${String((object.properties as Record<string, unknown>).label ?? '')}`);
    }
    if (layer.id === 'roads') return named(`vía · ${String((object.properties as Record<string, unknown>).label)}`);
    if (layer.id === 'waterways') return named((object.properties as Record<string, string>).label === 'river' ? 'río' : 'quebrada');
    if (layer.id === 'admin-outlines') {
      const level = Number((object.properties as Record<string, unknown>).admin_level);
      return named(level === 8 ? 'comuna' : 'barrio');
    }
    if (layer.id === 'landmarks') {
      const p = object.properties as Record<string, string>;
      return named(`hito · ${p.subkind}`);
    }
    return null;
  }, [def, oppBySite]);

  /* Expuesto solo para `scripts/checks/browser_check.py`: comprobar que la
     cámara se movió y que hay etiquetas requiere leerlo desde fuera de React. */
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__uriCenter = () => {
      const m = mapRef.current?.getMap();
      if (!m) return null;
      const c = m.getCenter();
      return { lng: +c.lng.toFixed(5), lat: +c.lat.toFixed(5), zoom: +m.getZoom().toFixed(2) };
    };
    w.__uriLabels = () => ({
      comunas: on('admin_areas') ? communeLabels.length : 0,
      barrios: on('admin_areas') && !onBasemap && zoom >= 15 ? neighbourhoodLabels.length : 0,
      roads: on('road_labels') ? visibleRoadLabels.length : 0,
      landmarks: on('landmarks') && zoom >= 14 ? visibleLandmarks.length : 0,
    });
    return () => { delete w.__uriCenter; delete w.__uriLabels; };
  });

  const maxBounds = useMemo(
    () => (territory ? padBBox(territory.aoi.bbox, 0.45) : undefined),
    [territory],
  );

  return (
    <div data-uri="map" className="absolute inset-0">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(e) => setViewState(e.viewState)}
        mapStyle={mapStyle as never}
        attributionControl={false}
        dragRotate
        maxZoom={18}
        minZoom={12}
        maxBounds={maxBounds}
      >
        <ScaleControl unit="metric" position="bottom-right" />
        <DeckGLOverlay layers={deckLayers} getTooltip={getTooltip} />
      </Map>

      <NorthIndicator
        bearing={bearing}
        onClick={() => mapRef.current?.getMap().easeTo({ bearing: bearing === 0 ? HOME_BEARING : 0, duration: 500 })}
      />

      {sentinelOn && scenes && sentinel && (
        <SwipeHandle
          swipe={swipe}
          setSwipe={setSwipe}
          pre={scenes.pre}
          post={scenes.post}
          limitation={sentinel.limitation}
          attribution={sentinel.attribution}
        />
      )}
      {ortofoto && (
        <div data-uri="imagery-caption"
             className="pointer-events-none absolute top-14 left-1/2 z-10 max-w-[420px] -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-950/95 px-3 py-1.5 text-center text-[10px] leading-snug text-mute-200">
          <b className="text-paper">{ortofoto.display_name}</b>
          {ortofoto.index?.acquisition && <> · {fecha(ortofoto.index.acquisition)}</>}
          {ortofoto.attribution && <div className="text-mute-400">{ortofoto.attribution}</div>}
        </div>
      )}

      <div data-uri="attribution"
           className="pointer-events-none absolute right-1 bottom-0 z-10 max-w-[70%] px-2 py-1 text-right text-[9px] leading-tight text-mute-400">
        {attribution}
        {sentinelOn && sentinel ? ` · ${sentinel.attribution}` : ''}
        {terrain?.attribution && showTerrain ? ` · ${terrain.attribution}` : ''}
      </div>
    </div>
  );
}

/** El mapa arranca girado -14°: sin norte, "arriba" no es el norte y nadie lo sabe. */
function NorthIndicator({ bearing, onClick }: { bearing: number; onClick: () => void }) {
  return (
    <button
      data-uri="north"
      onClick={onClick}
      title={bearing === 0 ? 'Norte arriba · clic para volver a la vista inclinada' : `Girado ${Math.round(bearing)}° · clic para poner el norte arriba`}
      className="absolute top-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-ink-600 bg-ink-950/95 shadow-lg shadow-black/50 sm:top-3 sm:right-3"
    >
      <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: `rotate(${-bearing}deg)` }}>
        <polygon points="11,2 14.2,12 11,10.4 7.8,12" fill="var(--color-accent)" />
        <polygon points="11,20 14.2,10 11,11.6 7.8,10" fill="var(--color-mute-400)" />
        <text x="11" y="7.6" textAnchor="middle" fontSize="5" fontWeight="700" fill="#07090c">N</text>
      </svg>
    </button>
  );
}

/**
 * Cortina antes/después. La imagen nunca va sola: fecha de cada escena, la
 * razón por la que se eligió y el texto de limitación viajan con ella
 * (ADR-19, ADR-22). Una diferencia entre dos fechas puede ser sombra, agua u
 * obra nueva — evidencia para mirar, no veredicto.
 */
function SwipeHandle({ swipe, setSwipe, pre, post, limitation, attribution }: {
  swipe: number; setSwipe: (v: number) => void;
  pre: SentinelScene; post: SentinelScene; limitation: string; attribution: string;
}) {
  const dragging = useRef(false);
  const family = pre.collection === 'sentinel-1-grd' ? 'Sentinel-1 radar' : 'Sentinel-2 óptico';
  const clouds = (s: SentinelScene) => (s.cloud_cover !== null ? ` · nubes ${s.cloud_cover.toFixed(0)}%` : '');
  const moveTo = (clientX: number, container: HTMLElement | null) => {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setSwipe(Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width)));
  };
  return (
    <div data-uri="swipe" className="pointer-events-none absolute inset-0 z-10">
      <div
        className="absolute top-0 bottom-0 w-px bg-paper/80"
        style={{ left: `${swipe * 100}%` }}
      />
      <button
        data-uri="swipe-handle"
        aria-label="Arrastra para comparar antes y después"
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (dragging.current) moveTo(e.clientX, e.currentTarget.parentElement); }}
        onPointerUp={(e) => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setSwipe(Math.max(0.02, swipe - 0.05));
          if (e.key === 'ArrowRight') setSwipe(Math.min(0.98, swipe + 0.05));
        }}
        className="pointer-events-auto absolute top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-paper/60 bg-ink-950/95 text-[12px] text-paper shadow-lg shadow-black/50"
        style={{ left: `${swipe * 100}%` }}
      >
        ◂▸
      </button>
      <div className="pointer-events-none absolute top-14 left-3 rounded-md border border-ink-600 bg-ink-950/95 px-2 py-1 text-[10px] text-mute-200">
        <b className="text-paper">ANTES</b> · {fecha(pre.acquisition)}{clouds(pre)}
      </div>
      <div className="pointer-events-none absolute top-14 right-14 rounded-md border border-ink-600 bg-ink-950/95 px-2 py-1 text-right text-[10px] text-mute-200">
        <b className="text-paper">DESPUÉS</b> · {fecha(post.acquisition)}{clouds(post)}
      </div>
      <div data-uri="imagery-caption"
           className="pointer-events-none absolute bottom-24 left-1/2 max-w-[460px] -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-950/95 px-3 py-1.5 text-center text-[10px] leading-snug text-mute-300">
        <b className="text-paper">{family}</b> · {attribution}
        <div className="mt-0.5 text-mute-400">{limitation}</div>
        <div className="mt-0.5 text-mute-500">antes: {pre.reason} · después: {post.reason}</div>
      </div>
    </div>
  );
}
