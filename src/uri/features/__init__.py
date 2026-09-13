"""Motor de features espaciales (ADR-02, ADR-11).

El trabajo espacial pesado corre dentro de Postgres. Python orquesta, no
transporta geometrias: mover 6.700 aristas al proceso para calcular una
distancia es la forma mas cara de obtener el mismo numero.
"""
