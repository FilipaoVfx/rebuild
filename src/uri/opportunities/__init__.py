"""Motor de oportunidades de recuperación (§14 del requerimiento).

Capa intermedia entre el scoring y el optimizador. Toma features, evidencia y
restricciones, y produce una entidad que la UI puede mostrar sin conocer la
estructura de la base.

    RAW DATA → SPATIAL FEATURES → OPPORTUNITY GENERATOR → RECOVERY OPPORTUNITY

Va DESPUÉS de `scoring` y ANTES de `optimizer` en la jerarquía de capas: una
oportunidad necesita el score del par para existir, y el optimizador
selecciona un portafolio de oportunidades, no de sitios.
"""

from uri.opportunities.generator import build_opportunity, generate_opportunities

__all__ = ["build_opportunity", "generate_opportunities"]
