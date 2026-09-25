import { layers as basemapLayers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { assetUrl } from '../data';

/**
 * Cartografía base: el extracto PMTiles de OpenStreetMap que el propio sitio
 * sirve (`data/basemap/`, con fecha de réplica y `dataset_version` de `osm`),
 * dibujado con el estilo de Protomaps recoloreado al papel de REBUILD, de día
 * y de noche. Las fuentes y los sprites también salen del sitio: ningún tile
 * de terceros.
 */

export type Theme = 'light' | 'dark';

/** La paleta del mockup: marfil, verdes apagados, agua celeste, calles blancas. */
const IVORY: Flavor = {
  ...namedFlavor('light'),
  background: '#f1eee6',
  earth: '#f1eee6',
  park_a: '#dcead3',
  park_b: '#d2e4c8',
  wood_a: '#d4e5ca',
  wood_b: '#c9dfbd',
  scrub_a: '#dfe9d5',
  scrub_b: '#d6e4cb',
  hospital: '#efe7e3',
  school: '#ede9dd',
  industrial: '#ebe8e1',
  pedestrian: '#f4f2ec',
  aerodrome: '#e9e7e0',
  zoo: '#dcead3',
  military: '#ebe8e1',
  water: '#bcdcf0',
  buildings: '#e4e0d6',
  other: '#fbfaf7',
  minor_service: '#fbfaf7',
  minor_a: '#ffffff',
  minor_b: '#ffffff',
  link: '#ffffff',
  major: '#ffffff',
  highway: '#fdfbf6',
  minor_service_casing: '#e2ddd2',
  minor_casing: '#e2ddd2',
  link_casing: '#dcd6ca',
  major_casing_early: '#d8d2c5',
  major_casing_late: '#d8d2c5',
  highway_casing_early: '#d3ccbd',
  highway_casing_late: '#d3ccbd',
  railway: '#c9c3b6',
  boundaries: '#a9a293',
  roads_label_minor: '#7b8196',
  roads_label_minor_halo: '#fbfaf7',
  roads_label_major: '#5d6479',
  roads_label_major_halo: '#fbfaf7',
  subplace_label: '#6f768c',
  subplace_label_halo: '#f6f4ee',
  city_label: '#0f1c3f',
  city_label_halo: '#f6f4ee',
  landcover: {
    ...(namedFlavor('light').landcover ?? {
      barren: '#ece8df', farmland: '#e7ebd9', forest: '#d4e5ca', glacier: '#ffffff',
      grassland: '#dfe9d5', scrub: '#dfe9d5', urban_area: '#ebe8e0',
    }),
    urban_area: '#ebe8e0',
    forest: '#d4e5ca',
    grassland: '#dfe9d5',
    scrub: '#dfe9d5',
    farmland: '#e7ebd9',
  },
};

/** La misma cartografía de noche: azul marino, agua profunda, calles apagadas. */
const NIGHT: Flavor = {
  ...namedFlavor('dark'),
  background: '#10151f',
  earth: '#10151f',
  park_a: '#17281f',
  park_b: '#1a2c22',
  wood_a: '#16261d',
  wood_b: '#182a20',
  scrub_a: '#162419',
  scrub_b: '#18271c',
  hospital: '#1b1c27',
  school: '#1a1e29',
  industrial: '#171c27',
  pedestrian: '#161c28',
  aerodrome: '#161b26',
  zoo: '#17281f',
  military: '#171c27',
  water: '#1d3a58',
  buildings: '#1b2231',
  other: '#232b3b',
  minor_service: '#232b3b',
  minor_a: '#27303f',
  minor_b: '#27303f',
  link: '#2b3447',
  major: '#2e3749',
  highway: '#353f54',
  minor_service_casing: '#141a25',
  minor_casing: '#141a25',
  link_casing: '#131923',
  major_casing_early: '#121822',
  major_casing_late: '#121822',
  highway_casing_early: '#111620',
  highway_casing_late: '#111620',
  railway: '#39425a',
  boundaries: '#4a5570',
  roads_label_minor: '#7f8aa2',
  roads_label_minor_halo: '#10151f',
  roads_label_major: '#98a3bb',
  roads_label_major_halo: '#10151f',
  subplace_label: '#8a95ad',
  subplace_label_halo: '#10151f',
  city_label: '#e9edf6',
  city_label_halo: '#10151f',
  landcover: {
    barren: '#141a25', farmland: '#151d1c', forest: '#16261d', glacier: '#1b2231',
    grassland: '#162419', scrub: '#162419', urban_area: '#141a26',
  },
};

let protocolRegistered = false;
function registerPmtiles(): void {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  protocolRegistered = true;
}

/** Ruta absoluta desde la base del sitio: el visor se sirve en `/` y en `/rebuild/`. */
const absolute = (relative: string) => new URL(relative, document.baseURI).href;

/** Sin cartografía base el mapa sigue funcionando: papel liso y las capas propias. */
export const plainStyle = (theme: Theme): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': theme === 'dark' ? '#10151f' : '#f1eee6' } }],
});

export function baseStyle(theme: Theme): StyleSpecification {
  registerPmtiles();
  return {
    version: 8,
    glyphs: `${absolute('basemap/fonts/')}{fontstack}/{range}.pbf`,
    sprite: absolute(`basemap/sprites/${theme === 'dark' ? 'dark' : 'light'}`),
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${absolute(assetUrl('basemap/pereira_basemap.pmtiles'))}`,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: basemapLayers('protomaps', theme === 'dark' ? NIGHT : IVORY, { lang: 'es' })
      /* Sin POI ni números de portal: los lugares que orientan los pone el
         visor, y una dirección por edificio es el grano que el SRS §6 prohíbe. */
      .filter((layer) => layer.id !== 'pois' && layer.id !== 'address_label'),
  };
}
