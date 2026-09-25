import { layers as basemapLayers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { assetUrl } from '../data';

/**
 * Cartografía base: el extracto PMTiles de OpenStreetMap que el propio sitio
 * sirve (`data/basemap/`, con fecha de réplica y `dataset_version` de `osm`),
 * dibujado con el estilo de Protomaps recoloreado al papel de RECOVERY. Las
 * fuentes y los sprites también salen del sitio: ningún tile de terceros.
 */

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
export const PLAIN_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f1eee6' } }],
};

export function ivoryStyle(): StyleSpecification {
  registerPmtiles();
  return {
    version: 8,
    glyphs: `${absolute('basemap/fonts/')}{fontstack}/{range}.pbf`,
    sprite: absolute('basemap/sprites/light'),
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${absolute(assetUrl('basemap/pereira_basemap.pmtiles'))}`,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: basemapLayers('protomaps', IVORY, { lang: 'es' })
      /* Sin POI ni números de portal: los lugares que orientan los pone el
         visor, y una dirección por edificio es el grano que el SRS §6 prohíbe. */
      .filter((layer) => layer.id !== 'pois' && layer.id !== 'address_label'),
  };
}
