"""Registro de fuentes (FR-ING-01, FR-LIC-01)."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, model_validator

from uri.contracts.enums import LicenseClass


class SourceRegistration(BaseModel):
    source_id: str
    display_name: str
    tier: str
    source_url: str
    access_method: str
    spatial_reference: str
    license_class: LicenseClass = LicenseClass.UNCLEAR
    license_name: str | None = None
    license_url: str | None = None
    attribution_text: str | None = None
    redistribution_allowed: bool | None = None
    derivatives_allowed: bool | None = None
    share_alike: bool = False
    quality_score: float | None = None
    terms_verified_at: date | None = None
    terms_verified_by: str | None = None
    terms_snapshot_path: str | None = None
    verification_notes: str | None = None

    @model_validator(mode="after")
    def verified_sources_carry_evidence(self) -> SourceRegistration:
        """Una clasificacion optimista sin evidencia es peor que ninguna:
        desactiva los controles sin que nadie se entere (fuentes.md §10)."""
        if self.license_class is not LicenseClass.UNCLEAR and self.terms_verified_at is None:
            raise ValueError(
                f"{self.source_id}: clasificada {self.license_class} sin terms_verified_at"
            )
        return self

    @property
    def usable(self) -> bool:
        """fuentes.md §0 — control C1: `UNCLEAR` no alimenta nada."""
        return self.license_class is not LicenseClass.UNCLEAR
