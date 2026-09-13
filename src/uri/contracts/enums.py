"""Vocabularios controlados. Espejo exacto de los tipos de db/migrations/001."""

from __future__ import annotations

from enum import StrEnum


class LicenseClass(StrEnum):
    """fuentes.md §1. `UNCLEAR` es el valor seguro: bloquea, no habilita."""

    COMMERCIAL_SAFE = "COMMERCIAL_SAFE"
    ATTRIBUTION = "ATTRIBUTION"
    SHARE_ALIKE = "SHARE_ALIKE"
    NON_COMMERCIAL = "NON_COMMERCIAL"
    UNCLEAR = "UNCLEAR"


class ExportProfile(StrEnum):
    INTERNAL = "INTERNAL"
    INSTITUTIONAL = "INSTITUTIONAL"
    COMMERCIAL = "COMMERCIAL"


#: fuentes.md §5 — que clases admite cada perfil.
PROFILE_ALLOWS: dict[ExportProfile, frozenset[LicenseClass]] = {
    ExportProfile.INTERNAL: frozenset(LicenseClass),
    ExportProfile.INSTITUTIONAL: frozenset(
        {
            LicenseClass.COMMERCIAL_SAFE,
            LicenseClass.ATTRIBUTION,
            LicenseClass.SHARE_ALIKE,
            LicenseClass.NON_COMMERCIAL,
        }
    ),
    ExportProfile.COMMERCIAL: frozenset(
        {
            LicenseClass.COMMERCIAL_SAFE,
            LicenseClass.ATTRIBUTION,
            LicenseClass.SHARE_ALIKE,
        }
    ),
}


class DamageClass(StrEnum):
    """Ordinal: el orden importa para la fusion de evidencia."""

    NO_DAMAGE = "NO_DAMAGE"
    POSSIBLY_DAMAGED = "POSSIBLY_DAMAGED"
    DAMAGED = "DAMAGED"
    DESTROYED = "DESTROYED"


DAMAGE_ORDER: dict[DamageClass, int] = {
    DamageClass.NO_DAMAGE: 0,
    DamageClass.POSSIBLY_DAMAGED: 1,
    DamageClass.DAMAGED: 2,
    DamageClass.DESTROYED: 3,
}


class EvidenceMethod(StrEnum):
    REMOTE_SENSING = "REMOTE_SENSING"
    FIELD_INSPECTION = "FIELD_INSPECTION"
    CITIZEN_REPORT = "CITIZEN_REPORT"
    OFFICIAL_REGISTRY = "OFFICIAL_REGISTRY"
    SYNTHETIC = "SYNTHETIC"


#: Fiabilidad relativa por metodo. Foto-interpretacion sin validacion de
#: campo no vale lo mismo que una inspeccion presencial, y el sistema no
#: debe fingir que si.
METHOD_RELIABILITY: dict[EvidenceMethod, float] = {
    EvidenceMethod.FIELD_INSPECTION: 0.95,
    EvidenceMethod.OFFICIAL_REGISTRY: 0.85,
    EvidenceMethod.REMOTE_SENSING: 0.65,
    EvidenceMethod.CITIZEN_REPORT: 0.35,
    EvidenceMethod.SYNTHETIC: 0.50,
}


class SiteState(StrEnum):
    INGESTED = "INGESTED"
    EVALUATED = "EVALUATED"
    EXCLUDED = "EXCLUDED"
    CANDIDATE = "CANDIDATE"
    SHORTLISTED = "SHORTLISTED"
    ENDORSED = "ENDORSED"


class InterventionType(StrEnum):
    """PRD §16, recortado a los 6 de la V1 (plan de MVP §1.4)."""

    PARK = "PARK"
    SPORTS = "SPORTS"
    PUBLIC_SQUARE = "PUBLIC_SQUARE"
    COMMUNITY_FACILITY = "COMMUNITY_FACILITY"
    OPEN_SPACE = "OPEN_SPACE"
    NO_BUILD = "NO_BUILD"


class CatchmentMethod(StrEnum):
    NETWORK = "NETWORK"
    BUFFER = "BUFFER"
