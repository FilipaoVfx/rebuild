import { useMemo } from 'react';
import { populationOutside } from '../lib/coverage';
import type { GeoJSON } from '../types';
import type { ReactNode } from 'react';
import { contextByKey } from '../lib/contexts';
import { FACTOR_LABEL, n, pct } from '../lib/format';
import type { ContextKey } from '../lib/palette';
import { useStore } from '../state/store';
import { Note, Panel, SectionTitle } from './ui';

/**
 * El texto lateral sigue al contexto del mapa (ADR-23).
 *
 * Cada opción de la barra inferior responde una pregunta con unas variables
 * concretas, y el analista tiene que poder leer aquí, sin abrir el código,
 * qué se midió, cómo, con qué fuente y hasta dónde llega. Lo que está escrito
 * es lo que hace el pipeline (`uri.features.engine`, `uri.scoring.model`,
 * `uri.ingestion.loader`), no una descripción amable de lo que debería hacer.
 * Los números salen del estado cargado.
 */

interface Variable {
  name: string;
  how: ReactNode;
  source: string;
  limit?: ReactNode;
}

interface Intro {
  question: string;
  summary: ReactNode;
  variables: Variable[];
  reading: ReactNode[];
  caveat: ReactNode;
}

export function ContextIntro() {
  const { context, sites, opportunities, territory, scenario, discrimination, minSuitability, layers } = useStore();
  const popOut = useMemo(
    () => populationOutside(layers.population as GeoJSON | undefined, territory?.aoi.bbox),
    [layers.population, territory],
  );
  const def = contextByKey(context);
  const total = sites.length;
  const candidates = sites.filter((s) => s.state === 'CANDIDATE').length;
  const evidence = territory?.counts.evidence ?? null;
  const weights = scenario?.weights ?? null;
  const withVuln = sites.filter((s) => s.social_vulnerability !== null).length;
  const withDeficit = sites.filter((s) => s.park_deficit !== null).length;
  const network = sites.filter((s) => s.catchment_method === 'NETWORK').length;
  const noBuild = opportunities.filter((o) => o.intervention === 'NO_BUILD').length;
  const fieldPhotos = territory?.counts.field_photos ?? 0;
  const fieldLinked = territory?.counts.field_photos_linked ?? 0;
  const fotosDeCampo: Variable = {
    name: 'Fotos de campo',
    how: <>{fieldPhotos > 0 ? `${n(fieldPhotos)} fotos` : 'Fotos'} tomadas en el terreno con la app
      <b> pereiramap</b>: la imagen (re-codificada sin metadatos), la posición del teléfono al
      disparar con su precisión, la hora, y la categoría que eligió quien la tomó. Cada foto se
      enlaza al sitio más cercano a menos de 75 m{fieldPhotos > 0 ? ` (${n(fieldLinked)} enlazadas)` : ''};
      las demás se muestran sueltas: son daño donde el satélite no vio nada.</>,
    source: 'pereiramap (colaboradores), CC BY 4.0 · rebuild_core.field_observation',
    limit: <>No es una inspección: es lo que alguien vio y fotografió. Pasa por revisión humana
      (caras, placas, números de casa) antes de publicarse; las pendientes se marcan «sin revisar».</>,
  };

  const intros: Record<ContextKey, Intro> = {
    TERRITORIO: {
      question: '¿Dónde estamos?',
      summary: <>
        Orientación, sin evaluar nada: la ciudad con sus nombres para que cada dato de los otros
        contextos tenga un lugar reconocible. Los sitios se dibujan neutros a propósito.
      </>,
      variables: [
        { name: 'Comunas y barrios', how: <>Límites administrativos de OSM (<code>admin_level</code> 8 y 9) armados como multipolígonos en PostGIS.</>, source: 'OpenStreetMap (ODbL)' },
        { name: 'Vías, ríos e hitos', how: <>Malla vial con jerarquía, ríos y quebradas con nombre, y ~160 hitos con prioridad declarada (gobierno y plazas primero; iglesias al final).</>, source: 'OpenStreetMap (ODbL)' },
        { name: 'Equipamientos municipales', how: <>Polígonos de equipamientos colectivos y espacio público del POT.</>, source: 'Alcaldía de Pereira — SIGPER, Ley 1712 de 2014' },
      ],
      reading: [
        <>El marco violeta es el área que este concepto cubre: 21,66 km² del centro y oriente de Pereira, no la ciudad entera. Fuera del marco, la ciudad va tramada.</>,
        <>Clic en una comuna la encuadra; clic en un sitio abre su ficha con barrio, comuna y esquina.</>,
      ],
      caveat: <>Los nombres son los de OpenStreetMap tal como están. Un sitio sin barrio en OSM dice «sin fuente».</>,
    },

    SITUACION: {
      question: '¿Qué está pasando en el territorio?',
      summary: <>
        La lectura de partida: dónde hay gente y dónde hay evidencia de daño. El mapa colorea las
        celdas de población y los {n(total)} sitios por la población que cada uno alcanza a pie; los
        puntos en tinta óxido son las observaciones de daño: cuanto más oscuros, más grave.
      </>,
      variables: [
        {
          name: 'Población por celda',
          how: <>Reparto <b>dasimétrico</b>: el total publicado para el AOI (190.000 personas, estadística
            del producto de Copernicus EMS) se distribuye sobre 15.024 huellas de edificio en proporción a
            su área construida, y se agrega a una malla de celdas de ~150 m. Es una estimación de
            dónde vive la gente, no un conteo.</>,
          source: 'Copernicus EMS (total) · Microsoft Building Footprints (huellas)',
          limit: <>Asume densidad uniforme por m² construido: una torre y una bodega de igual huella
            reciben la misma población. El 67 % del puntaje del modelo descansa en este supuesto.</>,
        },
        {
          name: 'Observaciones de daño',
          how: <>{evidence !== null ? n(evidence) : '182'} puntos de foto-interpretación satelital
            con clase <i>posiblemente dañado</i>, <i>dañado</i> o <i>destruido</i>, fecha de
            observación y precisión posicional declarada.</>,
          source: 'Copernicus EMS, activación EMSR916 (CC BY 4.0)',
          limit: <>Ninguna está validada en campo. La cobertura es donde apuntó el sensor, no donde hubo daño.</>,
        },
        fotosDeCampo,
        {
          name: 'Sitios',
          how: <>Observaciones a menos de 40 m entre sí se agrupan (DBSCAN) en un sitio; la huella es la
            envolvente con 6 m de margen, o un círculo de 12 m si hay una sola observación. Por eso el
            área se marca «estimada».</>,
          source: 'Derivado del pipeline (ADR-16)',
        },
        {
          name: 'Valor del mapa',
          how: <><code>population_10min / 20.000</code>, recortado a 0–1 y estirado al rango real entre
            los sitios (percentiles 2–98) para que el color tenga contraste.</>,
          source: 'feature population_10min (rebuild_analytics.site_feature)',
        },
      ],
      reading: [
        <>Más tinta = más gente alcanzable a 10 minutos a pie. Gris = ese sitio no tiene dato para este eje.</>,
        <>El ranking del panel usa el mismo valor que el color: no hay dos cifras distintas para lo mismo.</>,
      ],
      caveat: <>Pereira es uno de 409 municipios afectados. Lo que queda fuera del rectángulo es invisible para este sistema.</>,
    },

    DANO: {
      question: '¿Dónde hay evidencia de afectación?',
      summary: <>
        Solo evidencia observada y cómo se fusiona. El sistema nunca afirma que un edificio está
        destruido: acumula quién lo observó, con qué método y cuándo (ADR-16), y le pone una
        confianza que nunca llega a 1.
      </>,
      variables: [
        {
          name: 'Clase fusionada por sitio',
          how: <>La <b>peor</b> clase observada entre las observaciones del sitio (posiblemente dañado
            &lt; dañado &lt; destruido). Promediar «destruido» con «posiblemente dañado» produciría un
            valor que nadie observó.</>,
          source: 'rebuild_core.site_damage_fusion',
        },
        {
          name: 'Confianza de la fusión',
          how: <>Fiabilidad del método (sensor remoto: 0,65) × (0,55 + 0,45 × acuerdo entre
            observaciones), +0,10 por cada fuente independiente adicional, +0,10 si alguna está
            validada en campo, −hasta 0,20 por antigüedad (proporcional a un año). Acotada a
            0,05–0,95.</>,
          source: 'uri.ingestion.loader.fuse_damage_evidence',
          limit: <>Copernicus, SERTIT y UNOSAT clasifican las mismas imágenes Pléiades: cuentan como
            <b> una</b> fuente independiente, no tres.</>,
        },
        {
          name: 'Valor del mapa',
          how: <>Escala ordinal de la clase fusionada: 0,2 / 0,6 / 1,0. Los puntos de evidencia se
            pintan por su clase cruda; los sitios, por la fusionada.</>,
          source: 'rebuild_core.site_damage_fusion.damage_class',
        },
        fotosDeCampo,
      ],
      reading: [
        <>Óxido oscuro = destruido, óxido medio = dañado, terracota claro = posiblemente dañado. Un sitio sin observación no existe: los sitios nacen de la evidencia.</>,
        <>La ficha de cada sitio lista sus observaciones una a una, con fecha, método y ± metros.</>,
      ],
      caveat: <>Toda la evidencia disponible es foto-interpretación sin validación de campo. La Alcaldía
        levantó inspecciones edificio por edificio en toda la ciudad (EDAM, ~7.700 registros con
        habitabilidad y nivel de daño); no se han ingerido porque el ítem no declara licencia y
        contiene datos personales que habría que suprimir antes.</>,
    },

    NECESIDAD: {
      question: '¿Dónde se concentra la población alcanzable?',
      summary: <>
        Cuánta gente vive a 10 minutos a pie de cada sitio, medida sobre la red peatonal real y no
        sobre un círculo. Es el factor de mayor peso del modelo ({weights ? pct(weights.need) : '28 %'}).
      </>,
      variables: [
        {
          name: 'Área de captación a 10 min',
          how: <>Grafo peatonal de OSM (6.695 tramos: andenes, senderos, escaleras, calles residenciales
            y arterias caminables) con pgRouting; velocidad 75 m/min (4,5 km/h), es decir 750 m de
            recorrido. Se calcula también a 5 y 15 min. Si el sitio no engancha con la red, se usa un
            círculo de 750 m y se marca <code>BUFFER</code>.</>,
          source: 'OpenStreetMap (ODbL) · pgRouting',
          limit: <>Hoy {n(network)} de {n(total)} sitios tienen captación por red; el resto por círculo,
            que no sabe dónde hay un río o una ladera (−0,25 de confianza).</>,
        },
        {
          name: 'Población alcanzable',
          how: <>Suma de la población de las celdas dasimétricas que intersectan la captación
            (<code>population_10min</code>) y sus hogares (<code>households_10min</code>).</>,
          source: 'Copernicus EMS (total) · Microsoft (reparto)',
        },
        {
          name: 'En el modelo',
          how: <>Factor <i>need</i> = <code>min(1, population_10min / 6.000)</code>: por encima de 6.000
            personas alcanzables el factor satura.</>,
          source: 'uri.scoring.model.normalize',
        },
      ],
      reading: [
        <>Las siluetas grises son las captaciones a 10 min. Más tinta = más población alcanzable.</>,
        <>El mapa usa un techo de 20.000 para colorear; el modelo, 6.000 para puntuar: dos escalas distintas, las dos declaradas.</>,
      ],
      caveat: <>La población es derivada, no medida por sitio: un total publicado repartido por área construida, asumiendo densidad uniforme.</>,
    },

    DEFICIT: {
      question: '¿Dónde falta espacio público?',
      summary: <>
        Cuánto espacio público efectivo tiene la gente que cada sitio alcanza a pie, frente a un
        estándar de 10 m² por habitante. Segundo factor del modelo ({weights ? pct(weights.deficit) : '24 %'}).
      </>,
      variables: [
        {
          name: 'Espacio público existente',
          how: <>Área de los polígonos de OSM con <code>leisure</code> = park, garden, pitch,
            sports_centre, playground o recreation_ground (129 en el AOI) que intersectan la captación a
            10 min del sitio.</>,
          source: 'OpenStreetMap (ODbL)',
          limit: <>OSM está incompleto: un parque sin dibujar cuenta como cero. La capa municipal de
            espacio público (341 polígonos, Ley 1712) ya está cargada y se ve en Territorio; todavía no
            entra al cálculo porque cambiaría la versión de features.</>,
        },
        {
          name: 'Déficit',
          how: <><code>1 − (m² verdes / población alcanzable) / 10</code>, recortado a 0–1. Vale 1 si no
            hay nada o no hay población; 0 si se cumple el estándar. También se guarda el indicador
            crudo <code>park_area_per_capita</code>.</>,
          source: 'uri.features.engine (estándar 10 m²/hab adoptado por el proyecto)',
        },
      ],
      reading: [
        <>Más tinta = mayor déficit. Los polígonos verdes son el espacio público que ya existe.</>,
        <>Cobertura: {n(withDeficit)} de {n(total)} sitios con dato. Gris = sin fuente.</>,
      ],
      caveat: <>El estándar de 10 m²/hab es una convención del proyecto para el MVP; la norma colombiana (Decreto 1504 de 1998) fija 15 m²/hab como meta.</>,
    },

    ACCESO: {
      question: '¿Qué tan conectado está el sitio a pie?',
      summary: <>
        Densidad de red peatonal alrededor del sitio y equipamientos que alcanza. Es el eje que hoy
        <b> no ordena</b>: {discrimination.distinct} valor{discrimination.distinct === 1 ? '' : 'es'}{' '}
        distinto{discrimination.distinct === 1 ? '' : 's'} en {n(discrimination.covered)} sitios, y el
        visor lo declara en vez de estirar el color.
      </>,
      variables: [
        {
          name: 'Accesibilidad peatonal',
          how: <>Metros de vía caminable a menos de 400 m del centroide, divididos por 12.000
            (equivalente a 12 km de vía por km²) y recortados a 1. En el centro de Pereira casi todo
            supera el techo: por eso vale 1,0 en 112 de 115 sitios.</>,
          source: 'OpenStreetMap (ODbL)',
          limit: <>Mide cantidad de red, no calidad: no sabe de andenes rotos, pendientes ni escaleras.</>,
        },
        {
          name: 'Equipamientos alcanzables',
          how: <>Conteo de colegios, centros de salud y equipamientos comunitarios de OSM dentro de la
            captación a 10 min, normalizado a 3, 2 y 2 respectivamente. En el modelo entra su
            complemento: <i>facility_gap</i> = 1 − promedio de los tres.</>,
          source: 'OpenStreetMap (ODbL), 58 equipamientos',
        },
        {
          name: 'Método de captación',
          how: <><code>NETWORK</code> (pgRouting) o <code>BUFFER</code> (círculo de respaldo). Se muestra
            en cada sitio porque cambia lo que significa «a 10 minutos».</>,
          source: 'rebuild_analytics.site_catchment',
        },
      ],
      reading: [
        <>Puntos azules = equipamientos de OSM; siluetas = captaciones.</>,
        <>Cuando un eje no ordena, el color no debe leerse como diferencia entre sitios.</>,
      ],
      caveat: <>Cobertura no es información: un eje puede estar medido en el 100 % de los sitios y no separar a ninguno.</>,
    },

    OPORTUNIDADES: {
      question: '¿Dónde podemos actuar, y con qué?',
      summary: <>
        Una oportunidad por sitio candidato: el problema que hay ahí, la intervención con mayor
        afinidad, su viabilidad y su confianza. La idoneidad (0–100) <b>ordena, no titula</b>; por
        defecto se muestran las de idoneidad ≥ {minSuitability}.
      </>,
      variables: [
        {
          name: 'Idoneidad',
          how: <>Σ (factor normalizado × peso × afinidad de la intervención) × 100, menos penalizaciones
            suaves por riesgo moderado, baja compatibilidad de uso o baja confianza. La descomposición
            suma exactamente el puntaje y se puede abrir en cada ficha.</>,
          source: `uri.scoring.model (${scenario?.provenance.scoring_version ?? 'scoring_v1_weighted'})`,
        },
        {
          name: 'Factores y pesos',
          how: <>{weights
            ? Object.entries(weights).map(([k, v], i) => (
              <span key={k}>{i > 0 && ' · '}{FACTOR_LABEL[k] ?? k} <b className="num">{pct(v)}</b></span>
            ))
            : 'Población alcanzable 28 % · Déficit 24 % · Vulnerabilidad 20 % · Accesibilidad 16 % · Brecha de equipamientos 12 %'}.
            Normalización: población / 6.000; déficit, vulnerabilidad y accesibilidad tal cual (0–1);
            brecha = 1 − promedio de acceso a colegio, salud y comunitario.</>,
          source: 'DEFAULT_WEIGHTS, fijados por elicitación (D7 abierto)',
          limit: <>Los pesos son política pública, no un hiperparámetro: no se ajustan mirando el ranking.</>,
        },
        {
          name: 'Vulnerabilidad social',
          how: <>Media de cuatro indicadores del Censo 2018 por manzana (estrato invertido, analfabetismo,
            mayores de 70, condición física), con pesos iguales, ponderada por población dentro de la
            captación. Nula donde la manzana está suprimida por tener menos de 20 personas.</>,
          source: 'DANE — CNPV 2018 por manzana (Ley 1712)',
          limit: <>No es un índice oficial del DANE. Hoy {n(withVuln)} de {n(total)} sitios tienen dato; el resto dice «sin fuente».</>,
        },
        {
          name: 'Restricciones duras (antes de puntuar)',
          how: <>Área mínima 300 m², riesgo sísmico ≤ 0,75 y compatibilidad de uso ≥ 0,35. Un sitio que
            no cumple queda excluido sin compensación: {n(total - candidates)} excluidos,{' '}
            {n(candidates)} candidatos. Sin fuente no excluye ni aprueba.</>,
          source: 'uri.constraints (constraints_v1)',
        },
        {
          name: 'Intervención y viabilidad',
          how: <>Seis tipos de intervención con afinidades distintas por factor (un parque responde al
            déficit; un equipamiento, a la brecha). Se elige la de mayor idoneidad aplicable y se
            comprueban área, riesgo, uso del suelo y accesibilidad: cumple, con reservas, bloquea o
            sin fuente. {noBuild > 0 && <>{n(noBuild)} sitios responden «aquí no cabe nada».</>}</>,
          source: 'uri.opportunities',
        },
        {
          name: 'Confianza de la oportunidad',
          how: <>0,6 × proporción de factores con dato + 0,4 × min(1, observaciones de daño / 5). Un sitio
            con una observación y tres features nulas no merece la confianza de uno con ocho y el vector
            completo.</>,
          source: 'uri.opportunities.generator',
        },
      ],
      reading: [
        <>El color del sitio es la intervención propuesta (verde parque y espacio abierto, azul plaza, azul oscuro equipamiento, ocre deporte). Los sitios bajo el umbral se atenúan.</>,
        <>El titular de cada tarjeta nombra los factores que aportan ≥ 15 % del puntaje; lo que no tiene fuente se lista junto al titular.</>,
      ],
      caveat: <>Análisis multicriterio explicable, no aprendizaje automático ni predicción: no hay verdad de terreno con la que entrenar ni validar. Toda salida es consultiva (CON-05).</>,
    },
  };

  const intro = intros[context];
  return (
    <Panel data-uri="context-intro" data-context={context} className="border-t-0 py-2">
      <SectionTitle right={<span className="text-[10px] text-graphite-500">{def.label}</span>}>
        {intro.question}
      </SectionTitle>
      <p className="mt-2 font-serif text-[15px] leading-[1.5] text-toner [text-wrap:pretty]">{intro.summary}</p>

      <dl className="mt-4 divide-y divide-rule border-y border-rule">
        {intro.variables.map((v) => (
          <div key={v.name} className="py-3">
            <dt className="text-[13px] font-semibold text-toner">{v.name}</dt>
            <dd className="mt-1 font-serif text-[13.5px] leading-relaxed text-graphite-700">{v.how}</dd>
            <dd className="mt-1.5 text-[11.5px] text-graphite-500">Fuente: {v.source}</dd>
            {v.limit && <dd className="mt-1.5 text-[12px] leading-snug text-graphite-700"><span className="letterhead mr-1.5 text-[9.5px] text-stamp">Límite</span>{v.limit}</dd>}
          </div>
        ))}
      </dl>

      {def.populationChoropleth && popOut && popOut.outside > 0 && (
        <p data-uri="population-outside" className="mt-3 text-[12.5px] leading-snug text-graphite-700">
          <span className="letterhead mr-1.5 text-[9.5px] text-stamp">Límite</span>
          El reparto de población excede el área cubierta: {n(popOut.outside)} de {n(popOut.total)} celdas
          ({n(popOut.people)} personas) quedan fuera del marco y se ven bajo la trama. No son evidencia
          de esa parte de la ciudad.
        </p>
      )}

      <div className="mt-4">
        <div className="letterhead text-[10.5px] text-graphite-600">Cómo leer el anexo</div>
        <ul className="mt-1 flex flex-col gap-1">
          {intro.reading.map((r, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-graphite-700">
              <span className="mt-[10px] inline-block h-px w-2.5 shrink-0 bg-graphite-400" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
      <Note>{intro.caveat}</Note>
    </Panel>
  );
}
