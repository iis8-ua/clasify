-- Migración inicial del backend de Supabase.
--
-- Tablas, políticas RLS y las ocho categorías que usa el backend propio. Se aplica
-- con `npm run db:migrate`, que usa el string del Session pooler porque
-- `db.<ref>.supabase.co` solo resuelve a IPv6.
--
-- Convenciones:
--   * Todo lleva `IF NOT EXISTS`, así que el script se puede volver a ejecutar sin
--     romper nada.
--   * `id` es `uuid` y `gen_random_uuid()`, porque es lo que usa `auth.users.id`.
--     En el backend propio los id son enteros, pero aquí los genera Supabase Auth
--     y no se pueden cambiar.
--   * El email **no** se expone en ninguna lectura pública. Es el dato sensible
--     de este esquema y se protege con permisos de columna, no con RLS.

-- ---------------------------------------------------------------------------
-- categorias
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.categorias (
  id     SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------------
-- perfiles
-- ---------------------------------------------------------------------------

-- `id` es el mismo uuid que en `auth.users`. La fila la crea un trigger al
-- registrarse, no el servicio: si la crea el servicio, haría falta una política
-- de INSERT y dependería del orden en que Supabase Auth emite el token.
CREATE TABLE IF NOT EXISTS public.perfiles (
  id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  nombre     TEXT NOT NULL,
  biografia  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- anuncios
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.anuncios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo       TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 120),
  descripcion  TEXT NOT NULL,
  precio       NUMERIC(10, 2) NOT NULL CHECK (precio >= 0),
  estado       TEXT NOT NULL DEFAULT 'disponible'
                 CHECK (estado IN ('disponible', 'vendido')),
  imagen       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  id_autor     UUID NOT NULL REFERENCES public.perfiles (id) ON DELETE CASCADE,
  id_categoria INTEGER NOT NULL REFERENCES public.categorias (id)
);

-- El listado ordena por fecha desc casi siempre, y los filtros van por autor o
-- por categoría.
CREATE INDEX IF NOT EXISTS idx_anuncios_created_at
  ON public.anuncios (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anuncios_autor
  ON public.anuncios (id_autor);
CREATE INDEX IF NOT EXISTS idx_anuncios_categoria
  ON public.anuncios (id_categoria);

-- ---------------------------------------------------------------------------
-- Trigger: crear el perfil al registrarse
-- ---------------------------------------------------------------------------

-- El nombre llega en `raw_user_meta_data` porque es lo que se pasa en
-- `signUp({ data: { nombre } })`.
CREATE OR REPLACE FUNCTION public.crear_perfil_al_registrarse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'nombre', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crear_perfil ON auth.users;
CREATE TRIGGER trg_crear_perfil
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.crear_perfil_al_registrarse();

-- ---------------------------------------------------------------------------
-- RPC: el perfil propio con su email
-- ---------------------------------------------------------------------------

-- RLS y los permisos de columna dejan el email fuera del alcance de `anon` y de
-- `authenticated` (ver más abajo). Para que el usuario pueda ver **su** email se
-- necesita una función `SECURITY DEFINER` que se salte los permisos de tabla y
-- que compruebe dentro que el id pedido es el suyo.
--
-- `SET search_path = public` evita el aviso de `function_search_path_mutable`.
CREATE OR REPLACE FUNCTION public.mi_perfil(p_id UUID DEFAULT NULL)
RETURNS SETOF public.perfiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_id IS NOT NULL AND p_id <> auth.uid() THEN
    RAISE EXCEPTION 'solo puedes leer tu propio perfil'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT * FROM public.perfiles WHERE id = auth.uid();
END;
$$;

-- `mi_perfil()` sin argumentos es la forma que llama el servicio.
CREATE OR REPLACE FUNCTION public.mi_perfil_actual()
RETURNS SETOF public.perfiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.mi_perfil(NULL);
$$;

-- ---------------------------------------------------------------------------
-- Permisos: el email no es legible desde la API
-- ---------------------------------------------------------------------------

-- PostgREST respeta los permisos de columna, así que esto es lo que de verdad
-- protege el email: aunque la política de RLS deje leer la fila entera, sin
-- permiso de SELECT sobre esa **columna** no se puede pedir. Se revoca todo y se
-- devuelve solo lo que no es sensible.
REVOKE ALL ON public.perfiles FROM anon, authenticated;
GRANT SELECT (id, nombre, biografia, created_at) ON public.perfiles TO anon, authenticated;
GRANT UPDATE (nombre, biografia)              ON public.perfiles TO authenticated;

-- El listado y el detalle de anuncios necesitan leer la categoría para poder
-- embeberla en la respuesta.
REVOKE ALL ON public.categorias FROM anon, authenticated;
GRANT SELECT ON public.categorias TO anon, authenticated;

-- RLS cubre la escritura de anuncios: solo su autor. Las lecturas son públicas.
GRANT SELECT                          ON public.anuncios TO anon, authenticated;
GRANT INSERT (titulo, descripcion, precio, imagen, id_categoria, id_autor)
  ON public.anuncios TO authenticated;
GRANT UPDATE (titulo, descripcion, precio, imagen, id_categoria, estado)
  ON public.anuncios TO authenticated;
GRANT DELETE ON public.anuncios TO authenticated;

-- El servicio actualiza el estado con su propio recurso, no con una columna
-- suelta, así que no hace falta más que lo de arriba.

ALTER TABLE public.perfiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anuncios  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perfiles_select ON public.perfiles;
CREATE POLICY perfiles_select ON public.perfiles
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS perfiles_update ON public.perfiles;
CREATE POLICY perfiles_update ON public.perfiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS categorias_select ON public.categorias;
CREATE POLICY categorias_select ON public.categorias
  FOR SELECT TO anon, authenticated USING (true);

-- Lectura de anuncios abierta, también a los que no están autenticados: el
-- listado es la página principal y se enseña a cualquiera.
DROP POLICY IF EXISTS anuncios_select ON public.anuncios;
CREATE POLICY anuncios_select ON public.anuncios
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anuncios_insert ON public.anuncios;
CREATE POLICY anuncios_insert ON public.anuncios
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id_autor);

DROP POLICY IF EXISTS anuncios_update ON public.anuncios;
CREATE POLICY anuncios_update ON public.anuncios
  FOR UPDATE TO authenticated
  USING (auth.uid() = id_autor)
  WITH CHECK (auth.uid() = id_autor);

DROP POLICY IF EXISTS anuncios_delete ON public.anuncios;
CREATE POLICY anuncios_delete ON public.anuncios
  FOR DELETE TO authenticated
  USING (auth.uid() = id_autor);

-- La tabla de `auth.users` no se toca: es de Supabase. Solo se leen sus metadatos
-- desde el trigger, que va como `SECURITY DEFINER`.

-- ---------------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------------

-- OJO: `REVOKE ... FROM PUBLIC` no basta. Supabase crea el esquema `public` con
-- `ALTER DEFAULT PRIVILEGES` que concede EXECUTE a `anon` y `authenticated` a
-- cualquier función nueva, así que hay que revocar a los dos roles por su
-- nombre o el permiso se queda puesto.
REVOKE ALL ON FUNCTION public.mi_perfil(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mi_perfil_actual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_perfil(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.mi_perfil_actual() TO authenticated;

-- ---------------------------------------------------------------------------
-- Categorías iniciales
-- ---------------------------------------------------------------------------

-- Las mismas ocho que el backend propio, para que los dos proyectos filtren por
-- lo mismo. `ON CONFLICT DO NOTHING` las deja quietas si ya están.
INSERT INTO public.categorias (nombre) VALUES
  ('Electrónica'),
  ('Moda'),
  ('Hogar y jardín'),
  ('Deportes'),
  ('Libros y música'),
  ('Motor'),
  ('Juguetes y bebé'),
  ('Bicicletas')
ON CONFLICT (nombre) DO NOTHING;