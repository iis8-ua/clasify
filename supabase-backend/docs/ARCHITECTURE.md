# ARCHITECTURE

## Plataforma

- Backend como servicio (BaaS) con **Supabase**, en **proyecto en la nube**.
- Cliente JavaScript: `@supabase/supabase-js`.
- Autenticación gestionada por **Supabase Auth** (email + contraseña). Supabase emite el JWT.

## Capa de servicios

El cliente **no** usa directamente el API de Supabase: se define una capa de servicios (funciones
JavaScript) que aísla el acceso. Ejemplos:

```
registro(email, password, nombre)
login(email, password)
logout()
perfil(usuarioId)
actualizarPerfil(datos)
listarCategorias()
crearAnuncio(datos)
listarAnuncios({ texto, categoria, pagina, limite })
obtenerAnuncio(id)
actualizarAnuncio(id, datos)
eliminarAnuncio(id)
```

Internamente estas funciones llaman a `supabase.auth.*` o a las consultas sobre las tablas
(`supabase.from(...)`).

## Tablas

### perfiles

- id # mismo id que auth.users (FK a auth.users)
- email
- nombre
- biografia
- created_at

### categorias

- id
- nombre

### anuncios

- id
- titulo
- descripcion
- precio
- estado # disponible | vendido
- imagen # URL o nombre del fichero
- created_at
- id_autor # FK a perfiles
- id_categoria # FK a categorias

## Seguridad (RLS)

Se activa **Row Level Security** en las tablas:

- `anuncios`: lectura pública; `INSERT`/`UPDATE`/`DELETE` solo si `auth.uid() = id_autor`.
- `perfiles`: lectura pública (sin exponer datos sensibles); `UPDATE` solo del propio perfil.
- `categorias`: solo lectura.

## Paginación

Se implementa con el método `.range(desde, hasta)` de Supabase, a partir de `pagina` y `limite`.

## Configuración

- Variables de entorno en `.env`: `SUPABASE_URL` y `SUPABASE_ANON_KEY` (sin subir secretos al repo).
- `.env.example` con las claves vacías.

## Pruebas

- **Jest** sobre la capa de servicios, contra el proyecto Supabase de la nube (o un proyecto de
  pruebas). Script `npm test`.
