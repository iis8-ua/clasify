# ARCHITECTURE

## Backend

- API REST con Node/Express
- La autenticación se hará con tokens JWT (firmados por el servidor, HS256)
- Contraseñas almacenadas con hash **bcrypt**
- Base de datos relacional: MySQL
- Cliente: `mysql2` para el acceso desde Node/Express
- Subida de ficheros con **multer** (imágenes de anuncios)
- Raíz del repositorio: `P1/`; el código vive en `P1/backend/`

## Frontend

- Todavía no decidido

## Colecciones

### Usuarios

Campos:

- id
- created_at (fecha_alta)
- email # UNIQUE, nunca se expone en el perfil público
- nombre
- biografia # texto corto opcional del perfil
- password_hash

### Categorías

Campos:

- id
- nombre

### Anuncios

Campos:

- id
- titulo
- descripcion
- precio
- estado # disponible | vendido
- created_at (fecha_creacion)
- imagen # ruta del fichero subido (multipart) en backend/uploads/
- id_autor # usuario que ha creado el anuncio (N:1 con Usuarios)
- id_categoria # categoría a la que pertenece el anuncio (N:1 con Categorías)

### Favoritos

Campos:

- id
- created_at (fecha)
- id_usuario # N:1 con Usuarios
- id_anuncio # N:1 con Anuncios
- Restricción: `UNIQUE (id_usuario, id_anuncio)` para impedir favoritos duplicados (ver convenciones de MySQL)

### Conversaciones

Campos:

- id
- created_at (fecha_creacion)
- id_anuncio # anuncio sobre el que se conversa (N:1 con Anuncios)
- id_comprador # usuario que inicia la conversación (N:1 con Usuarios)
- Restricción: `UNIQUE (id_anuncio, id_comprador)` para que un comprador tenga una sola conversación por anuncio

> El **vendedor** de una conversación es el `id_autor` del anuncio (no se duplica en la tabla).
> Participantes = vendedor (autor del anuncio) y comprador (`id_comprador`).

### Mensajes

Campos:

- id
- texto
- created_at (fecha)
- leido # booleano; true cuando lo ha leído el otro participante
- id_conversacion # conversación a la que pertenece (N:1 con Conversaciones)
- id_emisor # usuario que envía el mensaje (N:1 con Usuarios)

### Convenciones de MySQL

- Todos los `id` son `INT UNSIGNED AUTO_INCREMENT PRIMARY KEY`
- Las fechas son `TIMESTAMP` con `DEFAULT CURRENT_TIMESTAMP`
- Los textos son `VARCHAR` (con `utf8mb4` para los acentos y la `ñ`), salvo la `descripcion` de los anuncios, que será `TEXT`
- El `precio` es `DECIMAL(10,2)` para evitar errores de redondeo de coma flotante
- `leido` es `BOOLEAN` (`TINYINT(1)`), y `estado` es `ENUM('disponible', 'vendido')`
- Las claves foráneas se definen con `FOREIGN KEY ... ON DELETE CASCADE` para que no queden registros huérfanos al eliminar un anuncio, una conversación o un usuario
- El email de `usuarios` es `UNIQUE`
- Restricción de favoritos: `UNIQUE (id_usuario, id_anuncio)`
- Restricción de conversaciones: `UNIQUE (id_anuncio, id_comprador)`
- Subida de imágenes: `POST`/`PATCH /anuncios` aceptan `multipart/form-data`; tipos permitidos
  `image/jpeg`, `image/png`, `image/webp`; tamaño máximo 5 MB; nombre único generado por el
  servidor; los ficheros viven en `backend/uploads/` y se sirven en `/clasify_api/uploads/:fichero`

## API REST

El backend ofrecerá un API REST.

Todas las rutas comenzarán por `/clasify_api/`. En la columna **Auth**, `JWT` indica que la
petición requiere un token válido.

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/salud` | - | Comprobación de que el servidor responde |
| POST | `/auth/register` | - | Alta de usuario (email, nombre, contraseña). 201 + token |
| POST | `/auth/login` | - | Devuelve 200 + token JWT |
| GET | `/auth/yo` | JWT | Usuario del token. Sirve para comprobar que el middleware acepta un token válido |
| GET | `/usuarios/me` | JWT | Perfil propio (incluye email) |
| PATCH | `/usuarios/me` | JWT | Editar nombre / biografía / contraseña |
| GET | `/usuarios/:id` | - | Perfil público (sin email) |
| GET | `/usuarios/:id/anuncios` | - | Anuncios publicados por el usuario (paginado) |
| GET | `/usuarios/me/anuncios` | JWT | Anuncios publicados por el usuario autenticado (paginado) |
| GET | `/usuarios/me/favoritos` | JWT | Anuncios guardados por el usuario autenticado (paginado) |
| GET | `/usuarios/me/conversaciones` | JWT | Conversaciones activas del usuario autenticado (paginado) |
| GET | `/categorias` | - | Listado de categorías para los filtros |
| GET | `/anuncios` | - | Listado con búsqueda por texto, filtro por categoría y ordenación por fecha o precio (paginado) |
| POST | `/anuncios` | JWT | Creación de un anuncio (`multipart/form-data` con campos + `imagen`) |
| GET | `/anuncios/:id` | - | Detalle + autor + categoría + `num_favoritos` (+ conversación si es participante) |
| PATCH | `/anuncios/:id` | JWT (autor) | Edición de un anuncio (multipart opcional para la imagen) |
| PATCH | `/anuncios/:id/estado` | JWT (autor) | Cambio de estado disponible / vendido |
| DELETE | `/anuncios/:id` | JWT (autor) | Eliminación de un anuncio |
| POST | `/anuncios/:id/favorito` | JWT | Marca el anuncio como favorito (idempotente). 201 si es nuevo, 200 si ya estaba |
| DELETE | `/anuncios/:id/favorito` | JWT | Elimina el favorito (quitar de favoritos) |
| GET | `/anuncios/:id/mensajes` | JWT (comprador) | Mensajes de mi conversación con el vendedor (paginado). 400 si lo pide el vendedor |
| GET | `/clasify_api/uploads/:fichero` | - | Sirve una imagen subida |
| POST | `/anuncios/:id/mensajes` | JWT | Inicia (o reutiliza) la conversación con el vendedor y envía el mensaje |
| GET | `/conversaciones/:id/mensajes` | JWT (participante) | Mensajes de una conversación (paginado) |
| POST | `/conversaciones/:id/mensajes` | JWT (participante) | Envía un mensaje en una conversación |

### Listados paginados

Los listados aceptan `pagina` (>= 1, por defecto 1) y `limite` (1–100, por defecto 20), y devuelven:

```json
{
  "datos": [ ... ],
  "paginacion": { "pagina": 1, "limite": 20, "total": 137, "paginas": 7 }
}
```

### Formato de error

```json
{ "error": { "codigo": "EMAIL_DUPLICADO", "mensaje": "...", "campo": "email" } }
```

### Formato de respuesta

Las respuestas correctas que no son un listado van envueltas en `datos`, igual que los listados
paginados pero sin el objeto `paginacion`, para no tener dos convenciones distintas:

```json
{ "datos": { "token": "...", "usuario": { "id": 1, "nombre": "...", "email": "..." } } }
```

### Códigos de error en uso

| Código | Estado HTTP | Cuándo se devuelve |
|---|---|---|
| `VALIDACION` | 400 | Faltan campos o no cumplen el formato (se indica `campo`) |
| `JSON_INVALIDO` | 400 | El cuerpo de la petición no es JSON válido |
| `SIN_TOKEN` | 401 | Falta la cabecera `Authorization` o el token |
| `ESQUEMA_INVALIDO` | 401 | La cabecera no usa el esquema `Bearer` |
| `TOKEN_INVALIDO` | 401 | El token no verifica la firma |
| `TOKEN_CADUCADO` | 401 | El token ha pasado su fecha de expiración |
| `CREDENCIALES_INVALIDAS` | 401 | Email o contraseña incorrectos (mismo mensaje en ambos casos, para no revelar qué emails existen) |
| `SIN_PERMISOS` | 403 | El usuario no es el propietario del recurso |
| `NO_ENCONTRADO` | 404 | El recurso o la ruta no existen |
| `EMAIL_DUPLICADO` | 409 | Ya existe un usuario con ese email |
| `CUERPO_DEMASIADO_GRANDE` | 413 | El cuerpo supera el límite de 1 MB |
| `ERROR_INTERNO` | 500 | Fallo no controlado; el detalle solo se escribe en el log del servidor |

### Variables de entorno

Se leen de `backend/.env` con `dotenv`. `backend/.env.example` documenta todas y no se versiona
el `.env` real.

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto del servidor (3000 por defecto) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` | Conexión con MySQL |
| `DB_NAME` | Base de datos de desarrollo (`clasify`) |
| `DB_TEST_NAME` | Base de datos de los tests (`clasify_test`) |
| `DB_POOL_SIZE` | Conexiones máximas del pool (10 por defecto) |
| `JWT_SECRET` | Secreto de firma de los tokens (HS256). Si falta, el backend no arranca |
| `JWT_EXPIRES_IN` | Caducidad de los tokens (7d por defecto) |

### Scripts de npm

| Script | Qué hace |
|---|---|
| `npm start` | Arranca el servidor |
| `npm run dev` | Arranca con recarga automática (`node --watch`) |
| `npm test` | Lanza Jest contra `clasify_test` |
| `npm run db:create-databases` | Crea `clasify` y `clasify_test` si no existen |
| `npm run db:schema` | Ejecuta `src/db/schema.sql` (idempotente) |
| `npm run db:seed` | Ejecuta `src/db/seed.sql` (idempotente) |

Orden de puesta en marcha desde cero: `db:create-databases` → `db:schema` → `db:seed` → `start`.
El usuario de MySQL necesita permiso `CREATE` para el primer paso; después bastan permisos sobre
las dos bases.

### Notas sobre permisos

- Las operaciones de escritura sobre un anuncio solo se permiten a su autor.
- Una conversación solo es visible y escribible por el vendedor (autor del anuncio) y por el comprador
  que la inició (`id_comprador`); el vendedor usa `/conversaciones/:id` porque puede tener varias.
- El perfil público no expone el email; solo el propio usuario lo ve en `/usuarios/me`.
- Las validaciones de entrada se aplican en el backend (precio no negativo, campos obligatorios,
  email único, formatos, etc.).

## Segundo backend (Supabase)

Como requerimiento adicional se desarrolla un segundo backend con **Supabase**, en un proyecto
totalmente aparte (`supabase-backend/`) y con su propio proceso SDD en `supabase-backend/docs/`.
Alcance reducido: autenticación y registro de usuarios y operaciones sobre el recurso principal
(anuncios), expuesto mediante una **capa de servicios** que aísla al cliente del API de Supabase.

