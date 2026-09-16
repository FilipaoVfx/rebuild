-- El aviso de no responsabilidad del Copernicus DEM, como columna.
--
-- La licencia del WorldDEM-30 (art. 6c) obliga a algo que ninguna otra fuente
-- del registro pide: publicar una frase literal de exencion de
-- responsabilidad junto al dato. `attribution_text` no sirve para eso — es la
-- nota de fuente del art. 6(a)/(b), que es una obligacion distinta y con otro
-- texto.
--
-- Va como columna y no como nota de verificacion porque las notas no llegan a
-- la pantalla. La capa del SGC se publico durante semanas incumpliendo sus
-- terminos justamente porque la obligacion estaba escrita donde nadie la
-- ejecutaba. Una obligacion de publicacion que vive en un comentario es una
-- obligacion incumplida esperando a que alguien la mire.
ALTER TABLE rebuild_core.source_register
    ADD COLUMN IF NOT EXISTS liability_notice text;

COMMENT ON COLUMN rebuild_core.source_register.liability_notice IS
    'Aviso de exencion de responsabilidad que la licencia obliga a publicar '
    'junto al dato, distinto de attribution_text. Si esta presente, tiene que '
    'llegar a la pagina: no es documentacion, es una condicion de uso.';
