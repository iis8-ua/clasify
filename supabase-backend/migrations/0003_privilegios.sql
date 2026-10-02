-- Migración 0003: cierra el agujero de privilegios de `anuncios`, pone los
-- índices que la búsqueda necesita de verdad y deja las reglas también en la base.
--
-- Nada de esto cambia el comportamiento de la capa de servicios: es que 0001 y
-- 0002 no dan lo que dicen, sino lo contrario.

-- ---------------------------------------------------------------------------
-- 1. Privilegios de `anuncios`
-- ---------------------------------------------------------------------------
--
-- 0001 revoca todo en `perfiles` y en `categorias` antes de devolver algo, pero en
-- `anuncios` se quedó solo con los `GRANT`. El resultado, comprobado contra el
-- proyecto, era este:
--
--     anon           DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     authenticated  DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- O sea, la tabla entera para los dos roles. Y como en Postgres `GRANT` es
-- aditivo y nunca quita, los `GRANT` por columna de 0001 no eran el tope de nada:
-- mientras el privilegio de tabla siga puesto, un autor podía escribirse sus
-- propias columnas buscables y la fecha sin pasar por el trigger.
--
-- `REVOKE ALL` primero y `GRANT` después es lo que hace que los permisos por
-- columna sean el tope real, y de paso se van `TRUNCATE` y `TRIGGER`, que RLS no
-- filtra (RLS solo decide filas, no comandos).
REVOKE ALL ON public.anuncios FROM anon, authenticated;
GRANT SELECT                          ON public.anuncios TO anon, authenticated;
GRANT INSERT (titulo, descripcion, precio, imagen, id_categoria, id_autor)
  ON public.anuncios TO authenticated;
GRANT UPDATE (titulo, descripcion, precio, imagen, id_categoria, estado)
  ON public.anuncios TO authenticated;
GRANT DELETE ON public.anuncios TO authenticated;

-- Con esto, escribir `titulo_buscable` o `created_at` ya no es posible: RLS deja
-- tocar solo las filas propias, y las columnas permitidas no incluyen esas dos.

-- Las dos funciones de 0002 quedaron sin revocar, al revés que `mi_perfil` y
-- `mi_perfil_actual`, que sí lo hacen en 0001. No dan ningún poder (una normaliza
-- texto y la otra es el trigger), pero es el mismo agujero cerrado por costumbre.
--
-- Ojo con `normalizar_para_busqueda`: no se puede revocar sin más, porque la
-- llama `anuncios_normalizar_busqueda`, y esa no es `SECURITY DEFINER`, así que se
-- ejecuta con los permisos de quien escribe el anuncio. Si `authenticated` se
-- queda sin permiso de ejecución, no puede crear ni editar ningún anuncio. Se le
-- concede explícitamente a quien puede escribir, y se le quita a `anon`.
REVOKE ALL ON FUNCTION public.normalizar_para_busqueda(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.anuncios_normalizar_busqueda()  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalizar_para_busqueda(text) TO authenticated;

-- `SET search_path` explícito en las dos, como ya lo tienen las tres de 0001. Sin
-- esto el linter `function_search_path_mutable` las marca.
ALTER FUNCTION public.normalizar_para_busqueda(text)  SET search_path = public;
ALTER FUNCTION public.anuncios_normalizar_busqueda()   SET search_path = public;

-- ---------------------------------------------------------------------------
-- 2. Índices de la búsqueda
-- ---------------------------------------------------------------------------
--
-- 0002 crea dos índices **btree** sobre las columnas buscables, y el comentario
-- decía que con ellos la consulta no degradaba a recorrer la tabla. Eso no era
-- cierto: la consulta es `ilike '%término%'`, con el comodín delante, y un btree
-- no se puede usar para eso en ningún caso (ni con `text_pattern_ops`, porque
-- sigue habiendo un comodín delante). Los índices se pagaban en escritura y en
-- espacio, y no evitaban nada.
--
-- Lo que sí sirve para `ilike '%...%'` es un índice de trigramas.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DROP INDEX IF EXISTS public.anuncios_titulo_buscable_idx;
DROP INDEX IF EXISTS public.anuncios_descripcion_buscable_idx;
DROP INDEX IF EXISTS public.anuncios_titulo_buscable_trgm;
DROP INDEX IF EXISTS public.anuncios_descripcion_buscable_trgm;

CREATE INDEX IF NOT EXISTS anuncios_titulo_buscable_trgm
  ON public.anuncios USING gin (titulo_buscable gin_trgm_ops);
CREATE INDEX IF NOT EXISTS anuncios_descripcion_buscable_trgm
  ON public.anuncios USING gin (descripcion_buscable gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. Reglas que solo vivían en JavaScript
-- ---------------------------------------------------------------------------
--
-- El criterio del proyecto es que las reglas estén en Postgres, no solo en el
-- código. `titulo` lo cumple desde 0001; `descripcion` se quedó sin `CHECK`.
ALTER TABLE public.anuncios
  DROP CONSTRAINT IF EXISTS anuncios_descripcion_check,
  ADD CONSTRAINT anuncios_descripcion_check
    CHECK (char_length(descripcion) BETWEEN 1 AND 5000);

-- En `perfiles.nombre` solo se acota el tope, **no el mínimo**: el trigger de
-- registro inserta `''` a propósito, porque el nombre se escribe después con una
-- segunda llamada (`registro` va a `signUp` y luego actualiza el perfil). Poner un
-- mínimo de 1 aquí hace fallar el alta de todos los usuarios.
ALTER TABLE public.perfiles
  DROP CONSTRAINT IF EXISTS perfiles_nombre_check,
  ADD CONSTRAINT perfiles_nombre_check
    CHECK (char_length(nombre) <= 100);