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
            "El copyright viaja por registro en el GeoJSON. Perfil COMMERCIAL "
            "bloqueado: la puerta de export aborta nombrando la fuente."
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
        source_url="https://emergency.copernicus.eu/mapping/list-of-components/EMSR916",
        access_method="download",
        spatial_reference="EPSG:4326",
        license_class=LicenseClass.UNCLEAR,
        verification_notes=(
            "Los terminos viajan en el paquete de entrega de cada producto, "
            "no en la pagina del servicio. Verificar por producto."
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
        tier="A",
        source_url="https://geoportal.sgc.gov.co/arcgis/rest/services",
        access_method="wfs",
        spatial_reference="EPSG:4326",
        license_class=LicenseClass.UNCLEAR,
        verification_notes=(
            "WFS 2.0.0 verificado y operativo en /arcgis/services/. Licencia sin "
            "auditar (OI-F2). Ademas: la amenaza publicada es nacional a escala "
            "NSR-10, no microzonificacion de Pereira (D6)."
        ),
    ),
    SourceRegistration(
        source_id="synthetic",
        display_name="Generador sintetico (URI)",
        tier="A",
        source_url="urn:uri:synthetic-generator",
        access_method="generated",
        spatial_reference="EPSG:4326",
        license_class=LicenseClass.COMMERCIAL_SAFE,
        license_name="Produccion propia",
        attribution_text="Capa simulada — Urban Recovery Intelligence",
        redistribution_allowed=True,
        derivatives_allowed=True,
        quality_score=0.50,
        terms_verified_at=VERIFIED,
        terms_verified_by="equipo",
        terms_snapshot_path="urn:uri:internal",
        verification_notes="FR-SYN-04: is_synthetic propaga a todo artefacto derivado.",
    ),
]

SOURCES_BY_ID = {source.source_id: source for source in SOURCES}
