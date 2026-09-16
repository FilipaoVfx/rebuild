-- Una intervencion construible no puede costar cero.
--
-- Las primeras 105 oportunidades se persistieron con area 0 y coste 0 COP.
-- El motivo: `candidate_features` devuelve la columna como `site_area` y el
-- generador leia `site_area_m2`. Ningun paso fallo — multiplicar un area
-- ausente por un coste unitario da cero, y cero es un numero perfectamente
-- valido para todas las capas de arriba.
--
-- Ese es justo el modo de fallo que este proyecto no puede permitirse: no
-- revienta, publica. Un parque de 0 COP encabezaria cualquier ranking de
-- personas por millon invertido.
--
-- NO_BUILD queda fuera: es la recomendacion de no construir y su coste cero
-- es correcto.
ALTER TABLE rebuild_core.recovery_opportunity
    ADD CONSTRAINT buildable_opportunity_costs_something
    CHECK (intervention = 'NO_BUILD' OR cost_cop > 0);

-- Y el area igual: un sitio construible con 0 m2 es un sitio sin medir.
ALTER TABLE rebuild_core.recovery_opportunity
    ADD CONSTRAINT buildable_opportunity_has_area
    CHECK (intervention = 'NO_BUILD' OR area_m2 > 0);
