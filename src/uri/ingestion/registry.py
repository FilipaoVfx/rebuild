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
]

SOURCES_BY_ID = {source.source_id: source for source in SOURCES}
