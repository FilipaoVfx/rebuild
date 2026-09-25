import { layers as basemapLayers, namedFlavor } from '@protomaps/basemaps';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { assetUrl } from '../data';

/**
 * Tipos de mapa (ADR-22 §8).
 *
 * `calles` y `oscuro` son cartografía base de OpenStreetMap servida por
 * nosotros: un extracto PMTiles del AOI (3,9 MB, z0–15) archivado en
 * `data/basemap/` con la fecha de réplica de OSM en su índice y sellado como
 * `dataset_version` de la fuente `osm`. El estilo (Protomaps, CC0/BSD-3), las
 * fuentes (Noto Sans, OFL) y los sprites se sirven desde el propio sitio. No
 * hay un solo byte que venga de un servidor de terceros en tiempo de
 * ejecución: sigue sin haber basemap de terceros (fuentes.md §11).
 *
 * `datos` es el mapa original: fondo negro y solo las capas versionadas del
 * pipeline. Sigue disponible porque es el que no mezcla dato con contexto.
 */
export type BaseMapKey = 'calles' | 'oscuro' | 'datos';

export const BASEMAPS: { key: BaseMapKey; label: string; help: string }[] = [
  { key: 'calles', label: 'Calles', help: 'OpenStreetMap, claro. Calles, manzanas, parques y nombres.' },
  { key: 'oscuro', label: 'Oscuro', help: 'OpenStreetMap, oscuro. Lo mismo, para leer capas de color encima.' },
  { key: 'datos', label: 'Datos', help: 'Sin cartografía base: solo las capas versionadas del pipeline.' },
];

/** El fondo del mapa original, sin ninguna fuente. */
export const DATA_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#ffffff' } }],
};

let protocolRegistered = false;
/** El protocolo `pmtiles://` lee el archivo por rangos de bytes. Se registra una vez. */
export function registerPmtiles(): void {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  protocolRegistered = true;
}

/** Ruta absoluta desde la base del sitio: el visor se sirve en `/` y en `/rebuild/`. */
const absolute = (relative: string) => new URL(relative, document.baseURI).href;

export function basemapArchiveUrl(): string {
  return absolute(assetUrl('basemap/pereira_basemap.pmtiles'));
}

export function styleFor(key: BaseMapKey): StyleSpecification {
  if (key === 'datos') return DATA_STYLE;
  registerPmtiles();
  const flavor = key === 'calles' ? 'light' : 'dark';
  return {
    version: 8,
    /* `new URL` codifica las llaves de la plantilla: se resuelve la carpeta y
       se pega la plantilla literal. */
    glyphs: `${absolute('basemap/fonts/')}{fontstack}/{range}.pbf`,
    sprite: absolute(`basemap/sprites/${flavor}`),
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${basemapArchiveUrl()}`,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: basemapLayers('protomaps', namedFlavor(flavor), { lang: 'es' })
      /* Sin los POI ni los números de dirección del basemap: los hitos los
         pone el visor, priorizados y con la misma fuente (OSM), y un
         `Envía` junto a la Alcaldía no orienta a nadie. Una dirección por
         edificio, además, es justo el grano que el SRS §6 prohíbe. */
      .filter((layer) => layer.id !== 'pois' && layer.id !== 'address_label'),
  };
}

/** Capas propias que la cartografía base ya dibuja y que sobrarían encima. Los
 *  barrios (`places_subplace`) también los etiqueta el basemap; las comunas no. */
export const REDUNDANT_ON_BASEMAP = new Set(['buildings', 'roads', 'waterways', 'road_labels', 'places']);

export const isBasemap = (key: BaseMapKey) => key !== 'datos';
