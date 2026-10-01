-- Búsqueda de anuncios insensible a acentos.
--
-- En el backend propio la collation utf8mb4_unicode_ci hace que "electronica"
-- encuentre "Electrónica". En Postgres el equivalente es unaccent(), pero
-- applied sobre la columna en el WHERE no usa índice y no se puede expresar con
-- .or() de PostgREST, que solo permiteoperadores sobre columnas.
--
-- La solución es materializar la búsqueda: dos columnas con el texto ya
-- normalizado a minúsculas y sin acentos, rellenadas por un trigger y con
-- índices. Es lo que hace que "electronica" encuentre "Electrónica" sin que la
-- consulta degrade al grows la tabla.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

ALTER TABLE anuncios
  ADD COLUMN titulo_buscable text,
  ADD COLUMN descripcion_buscable text;

CREATE OR REPLACE FUNCTION normalizar_para_busqueda(valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(unaccent('public.unaccent', coalesce(valor, '')));
$$;

CREATE OR REPLACE FUNCTION anuncios_normalizar_busqueda()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.titulo_buscable := normalizar_para_busqueda(NEW.titulo);
  NEW.descripcion_buscable := normalizar_para_busqueda(NEW.descripcion);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_anuncios_normalizar_busqueda
  BEFORE INSERT OR UPDATE OF titulo, descripcion ON anuncios
  FOR EACH ROW EXECUTE FUNCTION anuncios_normalizar_busqueda();

UPDATE anuncios
SET titulo_buscable = normalizar_para_busqueda(titulo),
    descripcion_buscable = normalizar_para_busqueda(descripcion);

ALTER TABLE anuncios
  ALTER COLUMN titulo_buscable SET NOT NULL,
  ALTER COLUMN descripcion_buscable SET NOT NULL;

CREATE INDEX anuncios_titulo_buscable_idx ON anuncios (titulo_buscable);
CREATE INDEX anuncios_descripcion_buscable_idx ON anuncios (descripcion_buscable);

-- Comprobación: si esto no está a 0, el trigger no cubrió algún camino de
-- escritura y las columnas quedarían desincronizadas.
DO $$
DECLARE
  sueltos integer;
BEGIN
  SELECT count(*) INTO sueltos
  FROM anuncios
  WHERE titulo_buscable IS DISTINCT FROM normalizar_para_busqueda(titulo)
     OR descripcion_buscable IS DISTINCT FROM normalizar_para_busqueda(descripcion);

  IF sueltos > 0 THEN
    RAISE EXCEPTION 'Hay % anuncios con la búsqueda sin normalizar', sueltos;
  END IF;
END;
$$;
