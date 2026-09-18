"""Registro de fuentes de la V1.

El estado de verificacion aqui es el de fuentes.md §2 y no se adorna: lo
verificado se marca verificado y lo demas queda en `UNCLEAR`, que bloquea.
Subir una fuente a `ATTRIBUTION` sin `terms_verified_at` falla en el modelo
(SourceRegistration), no en revision de codigo.
"""

from __future__ import annotations

from datetime import date

from uri.contracts import LicenseClass, SourceRegistration

VERIFIED = date(2026, 9, 13)

SOURCES: list[SourceRegistration] = [
    SourceRegistration(
        source_id="monitor_terremoto",
        display_name="Monitor Terremoto Colombia (datosdelterremoto.org)",
        tier="C",
        source_url="https://datosdelterremoto.org/data/public/",
        access_method="download",
        spatial_reference="EPSG:4326",
        license_class=LicenseClass.ATTRIBUTION,
        license_name="CC BY 4.0",
        license_url="https://creativecommons.org/licenses/by/4.0/",
        attribution_text="Datos derivados: Monitor Terremoto Colombia, CC BY 4.0",
        redistribution_allowed=True,
        derivatives_allowed=True,
        quality_score=0.75,
        terms_verified_at=VERIFIED,
        terms_verified_by="equipo",
        terms_snapshot_path="storage://terms/monitor_terremoto_20260913.html",
        verification_notes=(
            "CC BY 4.0 aplica a los DERIVADOS. Los crudos conservan la licencia "
            "de cada fuente original: por eso damage_evidence separa source de "
            "original_source y resuelve la licencia contra el segundo."
        ),
    ),
    SourceRegistration(
        source_id="sertit",
        display_name="ICube-SERTIT",
        tier="B",
        source_url="https://sertit.unistra.fr/",
        access_method="request",
        spatial_reference="EPSG:4326",
        # fuentes.md §7.12 — gratuito y no comercial son compatibles entre si,
        # y ese cruce es el que rompe un producto comercial.
        license_class=LicenseClass.NON_COMMERCIAL,
        license_name="ICube-SERTIT, condiciones por producto",
        attribution_text="© ICube-SERTIT 2026",
        redistribution_allowed=False,
        derivatives_allowed=True,
        quality_score=0.65,
        terms_verified_at=VERIFIED,
        terms_verified_by="equipo",
        terms_snapshot_path="storage://terms/sertit_20260913.pdf",
        verification_notes=(
            "VERIFICADO 2026-09-15 contra los terminos publicados, y el resultado "
            "es mas restrictivo de lo que se asumia, no menos. El aviso legal de "
            "sertit.unistra.fr dice: «Toute reproduction, representation, "
            "modification, publication, adaptation de tout ou partie des elements "
            "du site, quel que soit le moyen ou le procede utilise, est interdite, "
            "sauf autorisation ecrite prealable». No hay licencia abierta en ningun "
            "sitio de SERTIT. Ademas el dato afirma su propia autoria por registro "
            "(© ICube-SERTIT 2026), no la de la UE: si fuera un producto CEMS bajo "
            "CC BY 4.0 la linea de copyright lo diria. Los terminos del "
            "International Charter apuntan igual: «Users are not permitted to "
            "reproduce or distribute such content without the explicit permission "
            "of the content owners». "
            "VIA ABIERTA: «sauf autorisation ecrite prealable» — pedirsela por "
            "escrito es un correo, y si la conceden esta fila cambia y la puerta "
            "se abre. Mientras tanto: citar no es redistribuir (fuentes.md §3)."
        ),
    ),
    SourceRegistration(
        source_id="unosat",
        display_name="UNOSAT / UNITAR",
        tier="B",
        source_url="https://unosat.org/",
        access_method="download",
        spatial_reference="EPSG:4326",
        license_class=LicenseClass.UNCLEAR,
        verification_notes="Verificar por producto. No cubre Pereira en este evento.",
    ),
    SourceRegistration(
        source_id="copernicus_ems",
        display_name="Copernicus EMS — activacion EMSR916",
        tier="B",
        source_url="https://mapping.emergency.copernicus.eu/activations/EMSR916",
        access_method="download",
        spatial_reference="EPSG:4326",
        # Sube de UNCLEAR a ATTRIBUTION: el manual de producto del JRC para
        # CEMS Rapid Mapping declara CC BY 4.0, y el propio servicio autoriza
        # la reutilizacion bajo esa licencia. Eso no es una pagina
        # institucional generica: es la documentacion del producto.
        license_class=LicenseClass.ATTRIBUTION,
        license_name="CC BY 4.0",
        license_url="https://creativecommons.org/licenses/by/4.0/",
        attribution_text="© European Union, Copernicus Emergency Management Service (EMSR916)",
        redistribution_allowed=True,
        derivatives_allowed=True,
        quality_score=0.70,
        terms_verified_at=date(2026, 9, 15),
        terms_verified_by="equipo",
        terms_snapshot_path="storage://terms/cems_rapid_mapping_jrc121741.pdf",
        verification_notes=(
            "Manual for CEMS-Rapid Mapping Products (JRC121741): los productos se "
            "publican bajo CC BY 4.0, con vectores de descarga libre. "
            "PENDIENTE: nadie ha abierto todavia el paquete de entrega de EMSR916 "
            "para confirmarlo en ese producto concreto, que es el paso que "
            "fuentes.md §10 exige. La clasificacion refleja la licencia del "
            "programa documentada por su propio manual; confirmarla en el paquete "
            "es lo que queda. Es la via mas prometedora para tener una capa de "
            "daño REAL y publicable de Pereira."
        ),
    ),
    SourceRegistration(
        source_id="igac_catastro",
        display_name="IGAC — Predios catastrales (Risaralda)",
        tier="B",
        source_url="https://www.arcgis.com/home/item.html?id=9feea5c2feae40b2bf28255095a9f33a",
        access_method="api",
        spatial_reference="EPSG:4326",
        # UNCLEAR, y no por falta de buscar. La capa cubre el AOI con 47.443
        # predios —el triple que las huellas de Microsoft— y se descarga en un
        # minuto. Lo que NO tiene es una sola frase que diga que se puede
        # hacer con ella: `licenseInfo` esta vacio y la ficha solo trae la
        # definicion legal de que ES un predio, que describe el objeto y no
        # concede ningun derecho.
        #
        # Disponible y permitido no son lo mismo. Asi se publico la capa del
        # SGC durante semanas incumpliendo sus terminos (ADR-18).
        #
        # Queda registrada para que el control C1 la BLOQUEE por construccion
        # en vez de quedar como una idea suelta que alguien retome sin releer
        # la auditoria. Ver db/terms/igac_catastro_20260916.txt.
        license_class=LicenseClass.UNCLEAR,
        license_name=None,
        license_url=None,
        attribution_text=None,
        redistribution_allowed=None,
        derivatives_allowed=None,
        share_alike=False,
        quality_score=None,
        terms_verified_at=None,
        terms_verified_by=None,
        terms_snapshot_path="storage://terms/igac_catastro_20260916.txt",
        verification_notes=(
            "UNCLEAR. El item de ArcGIS no declara licencia ninguna y su dueno "
            "es una cuenta personal de IGAC. Cobertura COMPROBADA: 47.443 "
            "predios en el AOI, con MANZANA_CODIGO que ademas cruzaria con las "
            "manzanas del DANE. El dato es bueno; los terminos no existen. "
            "Vias alternativas exploradas y descartadas: en datos.gov.co las "
            "capas catastrales tampoco declaran licencia, y las que aparecen "
            "son `federated_href` —punteros a un recurso externo—, asi que los "
            "terminos del portal no las cubren; un puntero no lava una "
            "licencia. El geoportal de IGAC no responde. Lo desbloquea que "
            "IGAC declare terminos, una autorizacion escrita, o encontrar la "
            "capa ALOJADA en datos.gov.co. Nada de eso es trabajo de "
            "ingenieria."
        ),
    ),
    SourceRegistration(
        source_id="dane_censo_2018",
        display_name="DANE — Censo Nacional de Población y Vivienda 2018 (por manzana)",
        tier="A",
        source_url="https://www.arcgis.com/home/item.html?id=340378a6077c4a558847d5e12ceaaeb0",
        access_method="api",
        spatial_reference="EPSG:4326",
        # Ley 1712 de 2014, esquema Open Data. La frase operativa concede los
        # cuatro usos de forma expresa y la obligacion que impone es la
        # atribucion, no una prohibicion. Mismo regimen que datos.gov.co.
        license_class=LicenseClass.ATTRIBUTION,
        license_name="Open Data — Ley 1712 de 2014 (acceso a la informacion publica)",
        license_url="https://www.arcgis.com/home/item.html?id=340378a6077c4a558847d5e12ceaaeb0",
        # El autor es el DANE. Esri Colombia es la VIA, y la licencia prohibe
        # expresamente presentarla como participe o patrocinadora, asi que se
        # cita por lo que es y no mas.
        attribution_text=(
            "DANE — Censo Nacional de Población y Vivienda 2018. "
            "Acceso vía Esri Colombia (Living Atlas)"
        ),
        redistribution_allowed=True,
        derivatives_allowed=True,
        share_alike=False,
        quality_score=0.90,
        terms_verified_at=date(2026, 9, 16),
        terms_verified_by="auditoria de fuentes",
        terms_snapshot_path="storage://terms/dane_censo2018_manzanas_20260916.txt",
        verification_notes=(
            "Aviso legal leido verbatim; copia en "
            "db/terms/dane_censo2018_manzanas_20260916.txt. PASA como "
            "ATTRIBUTION redistribuible, sin restriccion comercial y sin "
            "share-alike. EL PROVEEDOR ES EL DANE, NO ESRI: es la trampa del "
            "SGC al reves —alli el agregador escondia a su proveedor— asi que "
            "la fuente se registra a nombre del productor y Esri Colombia "
            "queda como via de acceso. La licencia ademas PROHIBE usar el "
            "nombre de Esri Colombia como participe, patrocinador o promotor. "
            "PII: son conteos por manzana, no microdato, asi que CON-04 y "
            "FR-PII-01 se cumplen; pero FR-PII-03 exige umbral, y el riesgo "
            "es real — hay manzanas de 15 personas en el AOI y una de 3 con "
            "un dato de condicion fisica senala a alguien concreto. El "
            "adaptador suprime los atributos sensibles bajo umbral."
        ),
    ),
    SourceRegistration(
        source_id="copernicus_dem",
        display_name="Copernicus DEM GLO-30 (WorldDEM-30)",
        tier="A",
        source_url="https://dataspace.copernicus.eu/explore-data/data-collections/"
        "copernicus-contributing-missions/collections-description/COP-DEM",
        access_method="api",
        spatial_reference="EPSG:4326",
        # Licencia LEIDA, no supuesta. No son los terminos de Sentinel aunque
        # lleve Copernicus en el nombre: es un producto de Airbus que la UE
        # sublicencia, con su propio documento.
        #
        # El art. 4 concede reproduccion, distribucion, comunicacion al publico
        # y modificacion, sin clausula de no comercialidad — a diferencia del
        # SGC y de SERTIT. El art. 9 renuncia a reclamar los IPR del trabajo
        # propio del usuario, asi que no hay copyleft.
        license_class=LicenseClass.ATTRIBUTION,
        license_name="Licence for Copernicus DEM instance COP-DEM-GLO-30-F "
        "Global 30m Full, Free & Open",
        license_url="https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/"
        "Data/DEM/resources/license/License-COPDEM-30.pdf",
        # Art. 6(b): el terreno se recorta y se reproyecta al AOI, asi que la
        # forma que aplica es la de dato MODIFICADO, no la del art. 6(a).
        attribution_text=(
            "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and "
            "© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS "
            "by the European Union and ESA; all rights reserved"
        ),
        # Art. 6(c), literal y obligatorio. Ninguna otra fuente del registro
        # pide esto, y por eso existe la columna.
        liability_notice=(
            "The organisations in charge of the Copernicus programme by law or "
            "by delegation do not incur any liability for any use of the "
            "Copernicus WorldDEM-30"
        ),
        redistribution_allowed=True,
        derivatives_allowed=True,
        share_alike=False,
        quality_score=0.85,
        terms_verified_at=date(2026, 9, 16),
        terms_verified_by="auditoria de fuentes",
        terms_snapshot_path="storage://terms/copernicus_dem_glo30_licence_20260916.txt",
        verification_notes=(
            "Licencia leida verbatim del PDF oficial; copia en "
            "db/terms/copernicus_dem_glo30_licence_20260916.txt. PASA como "
            "ATTRIBUTION redistribuible, sin restriccion comercial y sin "
            "share-alike. TRES OBLIGACIONES QUE SENTINEL NO TIENE: (1) art. 6c "
            "exige publicar un aviso de no responsabilidad literal, que va en "
            "liability_notice y tiene que llegar a la pagina; (2) art. 6d "
            "prohibe dar a entender respaldo oficial, asi que nada de escudos "
            "de la UE o de ESA en el visor; (3) art. 6e obliga a trasladar "
            "estas obligaciones a quien reciba el dato de nosotros — es "
            "propagacion de avisos, no copyleft. AVISO: el GLO-10 esta "
            "EXPRESAMENTE excluido de distribucion al publico por el preambulo. "
            "Si alguien sube la resolucion, esta auditoria deja de aplicar."
        ),
    ),
    SourceRegistration(
        source_id="copernicus_sentinel",
        display_name="Copernicus Sentinel (CDSE)",
        tier="A",
        source_url="https://sh.dataspace.copernicus.eu/",
        access_method="api",
        spatial_reference="EPSG:4326",
        # La fuente mas limpia del registro, y por una vez la auditoria salio
        # en la direccion permisiva. El Reglamento (UE) 1159/2013, art. 7,
        # concede reproduccion, distribucion, comunicacion publica y
        # modificacion; el art. 8 exige la nota de atribucion, y nada mas.
        license_class=LicenseClass.ATTRIBUTION,
        license_name="Legal notice on the use of Copernicus Sentinel Data (Reg. UE 1159/2013)",
        license_url="https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice",
        # Art. 8: el texto exacto depende de si el dato se modifico. Todo lo
        # que este sistema publica esta recortado y reproyectado al AOI, asi
        # que la forma correcta es la de dato MODIFICADO, no la de dato crudo.
        attribution_text="Contains modified Copernicus Sentinel data 2026",
        redistribution_allowed=True,
        derivatives_allowed=True,
        share_alike=False,
        quality_score=0.80,
        terms_verified_at=date(2026, 9, 15),
        terms_verified_by="auditoria de fuentes",
        terms_snapshot_path="storage://terms/copernicus_sentinel_legal_notice_20260915.txt",
        verification_notes=(
            "Aviso legal verificado verbatim: 'users shall have a free, full and "
            "open access to Copernicus Sentinel Data', con los usos concedidos "
            "enumerados — reproduccion, distribucion, comunicacion al publico, "
            "adaptacion y modificacion. Sin restriccion comercial. Copia en "
            "db/terms/copernicus_sentinel_legal_notice_20260915.txt. "
            "OJO CON LA DISTINCION, que es la misma que hundio al SGC pero al "
            "reves: los terminos de CDSE separan el DATO del PORTAL. El dato es "
            "libre; 'any other contents of the Copernicus Data Space Ecosystem "
            "portal are intended for non-commercial use' y ESA 'do not grant the "
            "right to resell or redistribute' ESO. Documentacion, imagenes del "
            "sitio y material del portal NO son redistribuibles; las escenas si. "
            "Copia de los terminos del portal en db/terms/cdse_terminos_20260915.txt. "
            "Distinta de `copernicus_ems`: aquella es cartografia rapida ya "
            "elaborada (EMSR916), esta es imagen cruda S1 GRD y S2 L2A."
        ),
    ),
    SourceRegistration(
        source_id="osm",
        display_name="OpenStreetMap",
        tier="A",
        source_url="https://www.openstreetmap.org/",
        access_method="download",
        spatial_reference="EPSG:4326",
        license_class=LicenseClass.SHARE_ALIKE,
        license_name="ODbL 1.0",
        license_url="https://opendatacommons.org/licenses/odbl/1-0/",
        attribution_text="© OpenStreetMap contributors",
        redistribution_allowed=True,
        derivatives_allowed=True,
        share_alike=True,
        quality_score=0.70,
        terms_verified_at=VERIFIED,
        terms_verified_by="equipo",
        terms_snapshot_path="storage://terms/odbl_1_0.txt",
        verification_notes=(
            "OI-F1 abierto: share-alike sobre base derivada servida por API en "
            "un producto comercial. Mitigacion estructural: esquemas osm_raw y "
            "osm_derived aislados desde el primer dia."
        ),
    ),
    SourceRegistration(
        source_id="datos_gov_co",
        display_name="Datos Abiertos Colombia",
        tier="A",
        source_url="https://www.datos.gov.co/",
        access_method="api",
        spatial_reference="EPSG:4326",
        license_class=LicenseClass.ATTRIBUTION,
        license_name="Terminos del portal de datos abiertos",
        attribution_text="Datos Abiertos Colombia — datos.gov.co",
        redistribution_allowed=True,
        derivatives_allowed=True,
        quality_score=0.80,
        terms_verified_at=VERIFIED,
        terms_verified_by="equipo",
        terms_snapshot_path="storage://terms/datos_gov_co_20260913.html",
        verification_notes=(
            "Los terminos del portal no sustituyen a la licencia de un dataset "
            "que declare la suya. El adaptador lee el metadato del dataset."
        ),
    ),
    SourceRegistration(
        source_id="sgc",
        display_name="Servicio Geologico Colombiano",
        tier="C",
        source_url="https://geoportal.sgc.gov.co/arcgis/rest/services",
        access_method="wfs",
        spatial_reference="EPSG:4326",
        license_class=LicenseClass.NON_COMMERCIAL,
        license_name="Terminos y condiciones del portal SGC",
        license_url="https://www2.sgc.gov.co/Paginas/terminos-y-condiciones.aspx",
        attribution_text="Servicio Geologico Colombiano",
        redistribution_allowed=False,
        derivatives_allowed=False,
        share_alike=False,
        quality_score=0.6,
        terms_verified_at=date(2026, 9, 15),
        terms_verified_by="auditoria de fuentes",
        terms_snapshot_path="storage://terms/sgc_terminos_20260915.txt",
        verification_notes=(
            "OI-F2 cerrado. Los terminos del portal, verbatim: 'Ningun contenido "
            "de este sitio puede ser copiado, reproducido, recopilado, cargado, "
            "publicado, transmitido, distribuido, o utilizado para la creacion de "
            "servicios derivados [...] sin su consentimiento previo por escrito', "
            "y el permiso que otorgan es 'unicamente en su equipo y para su uso "
            "personal y no comercial'. Misma forma que ICube-SERTIT. El propio "
            "texto admite que un dataset con licencia propia se rige por ella, "
            "pero la capa de amenaza que usabamos no declara ninguna. Copia en "
            "db/terms/sgc_terminos_20260915.txt. Consecuencia: la capa se retiro "
            "del pipeline (ADR-18). Ademas, la amenaza publicada es nacional a "
            "escala NSR-10, no microzonificacion de Pereira (D6): un solo valor "
            "para todo el AOI, que no excluia ni penalizaba a ningun sitio."
        ),
    ),
    SourceRegistration(
        source_id="microsoft_buildings",
        display_name="Microsoft Building Footprints",
        tier="A",
        source_url="https://minedbuildings.z5.web.core.windows.net/global-buildings/",
        access_method="download",
        spatial_reference="EPSG:4326",
        license_class=LicenseClass.SHARE_ALIKE,
        license_name="Open Data Commons Open Database License (ODbL)",
        license_url="https://opendatacommons.org/licenses/odbl/",
        attribution_text="Microsoft Building Footprints",
        redistribution_allowed=True,
        derivatives_allowed=True,
        share_alike=True,
        quality_score=0.75,
        terms_verified_at=date(2026, 9, 15),
        terms_verified_by="equipo",
        terms_snapshot_path="storage://terms/ms_building_footprints_20260915.html",
        verification_notes=(
            "15.024 huellas dentro del AOI de EMSR916. Base dasimetrica del "
            "reparto de poblacion y fuente de densidad construida. Sustituye "
            "al generador sintetico, que queda retirado."
        ),
    ),
    SourceRegistration(
        source_id="pereira_sig",
        display_name="Alcaldía de Pereira — SIG municipal (equipamientos y espacio público)",
        tier="A",
        source_url="https://mapas-pereira.opendata.arcgis.com/",
        access_method="api",
        spatial_reference="EPSG:9377",
        # Solo los items que DECLARAN licencia en su ficha. La misma org
        # publica comunas, barrios, nomenclatura y ortofoto sin una sola
        # frase de terminos, y esos no entran: la ficha del dataset manda
        # sobre la portada del portal (fuentes.md §10), y la portada solo
        # habla de acceso y reserva los derechos de autor.
        license_class=LicenseClass.ATTRIBUTION,
        license_name="Datos abiertos — Ley 1712 de 2014 (declarado en la ficha del item)",
        license_url="https://www.arcgis.com/home/item.html?id=3e6a1a40b02b43d8a4dff55791cf2cd6",
        attribution_text=(
            "Alcaldía de Pereira — Secretaría de Planeación Municipal (SIGPER); CARDER; "
            "AMCO (Catastro Multipropósito). Datos abiertos, Ley 1712 de 2014"
        ),
        redistribution_allowed=True,
        derivatives_allowed=True,
        share_alike=False,
        quality_score=0.80,
        terms_verified_at=date(2026, 9, 18),
        terms_verified_by="auditoria de fuentes",
        terms_snapshot_path="storage://terms/pereira_sig_20260918.txt",
        verification_notes=(
            "licenseInfo literal de 'Equipamientos actual' y 'Espacio Público "
            "actual': «Datos abiertos de uso libre bajo el marco de la Ley 1712 "
            "de 2014 [...] uso y reutilización bajo licencia abierta y sin "
            "restricciones legales para su aprovechamiento. Se deben respetar "
            "derechos de autor, dando el apropiado crédito al municipio de "
            "Pereira y entidades que proporcionaron dicha información». Los "
            "cinco ejes responden si; la obligacion es la atribucion. Copia en "
            "db/terms/pereira_sig_20260918.txt. Cubre SOLO esos dos items."
        ),
    ),
    SourceRegistration(
        source_id="natural_earth",
        display_name="Natural Earth (contornos de Colombia y Risaralda)",
        tier="A",
        source_url="https://www.naturalearthdata.com/",
        access_method="download",
        spatial_reference="EPSG:4326",
        license_class=LicenseClass.COMMERCIAL_SAFE,
        license_name="Dominio público",
        license_url="https://www.naturalearthdata.com/about/terms-of-use/",
        # La atribucion es opcional por licencia; se pone igual porque la
        # puerta exige un texto literal para toda fuente usable, y porque
        # decir de donde sale un contorno cuesta nada.
        attribution_text="Made with Natural Earth",
        redistribution_allowed=True,
        derivatives_allowed=True,
        share_alike=False,
        quality_score=0.70,
        terms_verified_at=date(2026, 9, 18),
        terms_verified_by="auditoria de fuentes",
        terms_snapshot_path="storage://terms/natural_earth_terms_20260918.txt",
        verification_notes=(
            "«All versions of Natural Earth raster + vector map data [...] are in "
            "the public domain». Dos poligonos para el localizador de la vista "
            "Territorio (Colombia, Risaralda). No alimenta features ni exports."
        ),
    ),
    SourceRegistration(
        source_id="igac_ortofoto",
        display_name="IGAC — Ortoimagen 1:1.000 de Pereira",
        tier="A",
        source_url="https://mapas.igac.gov.co/image/services/orto/orto66001000pereira/ImageServer",
        access_method="wms",
        spatial_reference="EPSG:3857",
        # UNCLEAR con via de desbloqueo escrita. La Res. IGAC 616/2020 adopta
        # CC BY 4.0 para «los datos cuya titularidad y/o autoria es propia del
        # IGAC»; lo que falta es confirmar que esta ortofoto —que el portal
        # municipal llama "Ortofoto AMCO"— es del IGAC y no del gestor
        # catastral. Ver db/terms/igac_ortofoto_20260918.txt.
        license_class=LicenseClass.UNCLEAR,
        terms_snapshot_path="storage://terms/igac_ortofoto_20260918.txt",
        verification_notes=(
            "Res. IGAC 616/2020: CC BY 4.0 si la titularidad es del IGAC. "
            "PENDIENTE confirmar titularidad (¿convenio AMCO, Res. 1421/2021?) "
            "con el copyrightText del servicio (502 durante la auditoria), la "
            "ficha en Colombia en Mapas o contactenos@igac.gov.co. Con eso pasa "
            "a ATTRIBUTION: «IGAC — Ortoimagen 1:1.000, Pereira. CC BY 4.0. "
            "Imagen reproyectada y teselada (modificada)». Mientras: teselas al "
            "sandbox, nada publicado."
        ),
    ),
    SourceRegistration(
        source_id="pereira_ortofoto_post",
        display_name="Alcaldía de Pereira — Ortofoto post-sismo (14-08-2026)",
        tier="A",
        source_url="https://tiles.arcgis.com/tiles/Zdpg0E6lri7EggIc/arcgis/rest/services/mapaortofoto/MapServer",
        access_method="api",
        spatial_reference="EPSG:3857",
        # La imagen mas valiosa que existe para este producto: cuatro dias
        # despues del sismo, cubre todo el AOI y viene en teselas Web Mercator
        # estandar. Y no tiene ni una frase de terminos: copyrightText,
        # licenseInfo y accessInformation vacios. Disponible y permitido no
        # son lo mismo. Ver db/terms/pereira_ortofoto_post_20260918.txt.
        license_class=LicenseClass.UNCLEAR,
        terms_snapshot_path="storage://terms/pereira_ortofoto_post_20260918.txt",
        verification_notes=(
            "UNCLEAR. documentInfo: «ortofoto terremoto», «Terremoto ortofoto 14 "
            "de agosto». Sin licencia, sin productor declarado. Lo desbloquea "
            "que SIGPER copie en la ficha el texto Ley 1712 que ya usa en "
            "'Equipamientos actual' (plantilla de solicitud en el snapshot). "
            "Mientras: teselas al sandbox, nada publicado."
        ),
    ),
]

SOURCES_BY_ID = {source.source_id: source for source in SOURCES}
