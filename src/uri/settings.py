"""Configuracion de entorno. Los secretos nunca viven en el codigo (NFR-SEC-02)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="URI_", env_file=".env", extra="ignore")

    database_url: str = "postgresql://uri:uri@127.0.0.1:5433/uri"
    synthetic_seed: int = 20260810
    export_profile: str = "INTERNAL"


settings = Settings()
