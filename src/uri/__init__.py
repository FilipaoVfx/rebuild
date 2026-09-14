"""Urban Recovery Intelligence.

Inteligencia espacial para decisiones de recuperacion urbana post-desastre.
El orden de los modulos es el orden del pipeline, y las fronteras de
importacion estan forzadas por import-linter (ADR-01):

    contracts -> ingestion -> features -> constraints -> scoring
              -> optimizer -> reporting -> api
"""

__version__ = "0.1.0"
