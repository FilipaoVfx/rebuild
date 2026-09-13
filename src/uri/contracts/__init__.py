"""Contratos: vocabularios, procedencia y el contrato de daño.

Ningun modulo aguas abajo define sus propios enums de daño o licencia.
Si dos modulos discrepan sobre que significa `DAMAGED`, el sistema miente
en algun sitio.
"""

from uri.contracts.enums import (
    CatchmentMethod,
    DamageClass,
    EvidenceMethod,
    ExportProfile,
    InterventionType,
    LicenseClass,
    SiteState,
)
from uri.contracts.evidence import DamageEvidence
from uri.contracts.provenance import LayerProvenance, Provenance
from uri.contracts.source import SourceRegistration

__all__ = [
    "CatchmentMethod",
    "DamageClass",
    "DamageEvidence",
    "EvidenceMethod",
    "ExportProfile",
    "InterventionType",
    "LayerProvenance",
    "LicenseClass",
    "Provenance",
    "SiteState",
    "SourceRegistration",
]
