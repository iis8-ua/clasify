# PROJECT_SPEC

## Descripción

Segundo backend de *Clasify*, implementado con **Supabase** como BaaS, desarrollado en un proyecto
totalmente aparte (`supabase-backend/`). Corresponde al **requerimiento adicional** de la Práctica 1.

El objetivo es exponer una **capa de servicios** en JavaScript que implemente los casos de uso del
backend sin que el cliente conozca que por debajo se usa el API de Supabase.

## Alcance (reducido, según el enunciado)

El enunciado indica que el backend adicional solo necesita autenticación y registro de usuarios y
operaciones sobre el recurso principal:

- Registro, login y logout de usuarios (Supabase Auth, email + contraseña).
- Perfil básico del usuario autenticado.
- Operaciones sobre el recurso principal (**anuncios**): crear, listar (con búsqueda y paginación),
  obtener por id, modificar y eliminar.
- Listado de **categorías** para los filtros.

## Recurso principal

Anuncios. Los mismos campos que en el backend propio, con las diferencias que imponen Postgres y
Supabase:

| Campo | Backend propio (MySQL) | Aquí (Supabase) |
|---|---|---|
| `id` | `INT AUTO_INCREMENT` | `UUID` con `gen_random_uuid()` |
| `titulo` | `VARCHAR(150)` | `TEXT` con `CHECK` de 1 a 120 |
| `descripcion` | `TEXT` | `TEXT` |
| `precio` | `DECIMAL(10,2)` | `NUMERIC(10,2)` |
| `estado` | `ENUM('disponible','vendido')` | `TEXT` con `CHECK` de esos dos valores |
| `imagen` | `VARCHAR(255)` | `TEXT` |
| fecha de alta | `fecha_creacion` `TIMESTAMP` | `created_at` `TIMESTAMPTZ` |
| `id_autor` | `INT` a `usuarios` | `UUID` a `auth.users` |
| columnas de búsqueda | la collation `utf8mb4_unicode_ci` | `titulo_buscable` y `descripcion_buscable` |

El `id` es UUID porque el autor tiene que ser el mismo identificador que da Supabase Auth, para que
`auth.uid()` y la clave foránea coincidan. La fecha se llama `created_at` porque es la convención de
PostgREST para las columnas de fecha de alta.

## Fuera de alcance

- Favoritos (recurso secundario).
- Conversaciones y mensajería (recurso secundario).
- Subida real de imágenes (la imagen se guarda como URL/nombre).
- Frontend.
- Lista negra de tokens. El logout llama a `signOut` de Supabase, que revoca el refresh token, pero
  **no invalida al instante el access token ya emitido**: los JWT son sin estado y siguen valiendo
  hasta que caducan. Es una limitación de la plataforma, no una decisión de diseño; está detallado
  en `docs/ARCHITECTURE.md`.

## Relación con el backend propio

Los dos backends son proyectos independientes y no comparten código. Este proyecto tiene su propio
proceso SDD en `docs/`.

Que sean independientes no quiere decir que se comporten distinto. Las operaciones que aquí existen
se hicieron coincidir con las del otro:

- El listado filtra por estado, y por defecto enseña solo los disponibles.
- La búsqueda no distingue acentos ni mayúsculas, como la collation del backend propio.
- Hay listado por autor, que corresponde a `/usuarios/me/anuncios` y `/usuarios/:id/anuncios`.

Las diferencias que quedan son de alcance y están en "Fuera de alcance": favoritos, mensajería,
valoraciones, subida de imágenes y frontend. Lo que las cubre por escrito es
`tests/paridadConBackendPropio.test.js`.
