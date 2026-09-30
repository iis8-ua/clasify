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
- Longitudes acotadas: `titulo` 150 caracteres (el límite de su `VARCHAR`), `descripcion` 5000 y
  `precio` como `DECIMAL(10,2)` no negativo. La categoría de un anuncio es obligatoria y tiene que
  existir: si no, 400 `VALIDACION` con `campo: "categoria"`

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
| GET | `/categorias` | - | Listado de categorías para los filtros (sin paginar) |
| GET | `/anuncios` | - | Listado con búsqueda por texto, filtro por categoría y ordenación por fecha o precio (paginado) |
| POST | `/anuncios` | JWT | Creación de un anuncio (`multipart/form-data` con campos + `imagen` opcional) |
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

`GET /categorias` es la excepción: no va paginado porque son las filas de una tabla de referencia
que no crece con el uso, y un desplegable de filtros no lo necesita.

### Filtros del listado de anuncios

`GET /anuncios` acepta, además de la paginación:

| Parámetro | Valores | Por defecto |
|---|---|---|
| `texto` | Se busca en título y descripción | Sin búsqueda |
| `categoria` | Id de una categoría existente | Sin filtro |
| `orden` | `fecha_desc`, `fecha_asc`, `precio_desc`, `precio_asc` | `fecha_desc` |
| `estado` | `disponible`, `vendido`, `todos` | `disponible` |

- **Por defecto solo salen los anuncios disponibles.** Un marketplace no debe llenar la portada de
  cosas ya vendidas; los vendidos se piden explícitamente con `?estado=vendido` o `?estado=todos`.
  El filtro no se aplica a `GET /usuarios/:id/anuncios`, donde sí se ven todos los anuncios del
  usuario, vendidos incluidos.
- Un valor fuera de la lista es un 400 `VALIDACION` con el nombre del parámetro en `campo`, no un
  valor ignorado en silencio.
- `texto` se busca con `LIKE %texto%` sobre `titulo` y `descripcion`. La comparación usa la
  colación `utf8mb4_unicode_ci`, así que no distingue mayúsculas, minúsculas ni acentos: `electronica`
  encuentra `Electrónica`. Los comodines `%` y `_` que escriba el usuario se escapan y se buscan
  literalmente.
- Cada ordenación lleva el `id` como segundo criterio para que sea estable entre páginas.

### Multipart e imágenes

- `POST /anuncios` y `PATCH /anuncios/:id` siempre van en `multipart/form-data`, con el fichero en el
  campo `imagen`. La imagen es **opcional**: sin ella, el anuncio se guarda con `imagen` a `null`.
- `PATCH /anuncios/:id/estado` no lleva ficheros y sí va en JSON normal.
- El nombre del fichero lo genera el servidor con `crypto.randomUUID()` y la extensión del tipo
  declarado, así que un cliente no puede elegir el nombre ni escribir fuera de `uploads/`.
- Al sustituir la imagen se borra el fichero anterior y al borrar el anuncio se borra la suya, para
  que no queden huérfanos en `uploads/`. Si el fichero ya no está, no es un error.

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
| `CREDENCIALES_INVALIDAS` | 401 | Email o contraseña incorrectos, o contraseña actual incorrecta al cambiar la contraseña. Mismo mensaje en todos los casos, para no revelar qué emails existen |
| `USUARIO_NO_EXISTE` | 401 | El token es válido pero su usuario ya no está en la base de datos |
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

- Las operaciones de escritura sobre un anuncio solo se permiten a su autor. La comprobación va en
  este orden: primero que el anuncio exista (404) y después que sea del usuario (403), para que un
  id inexistente y uno ajeno no se confundan.
- Una conversación solo es visible y escribible por el vendedor (autor del anuncio) y por el comprador
  que la inició (`id_comprador`); el vendedor usa `/conversaciones/:id` porque puede tener varias.
- El perfil público no expone el email; solo el propio usuario lo ve en `/usuarios/me`. El `autor`
  que va embebido en `GET /anuncios/:id` sale con la misma proyección pública, sin email ni
  `password_hash`.
- El detalle de un anuncio devuelve `autor`, `categoria` y `num_favoritos`. `num_favoritos` sale de
  un `COUNT` sobre `favoritos`; el recurso `conversacion` se añade cuando exista la mensajería (I5).
- Las validaciones de entrada se aplican en el backend (precio no negativo, campos obligatorios,
  email único, formatos, etc.).
- `PATCH /usuarios/me` es un PATCH: solo se validan y se escriben los campos enviados, y los campos
  desconocidos se ignoran. El email no se puede cambiar (400 si viene en el cuerpo) y cambiar la
  contraseña exige enviar `password_actual`.
- Los favoritos son siempre del usuario del token: no hay ruta para ver ni para tocar los de otro, y
  el `DELETE` borra filtrando por `id_usuario`, así que conocer el id de un anuncio no da acceso a
  la fila de otra persona. Marcar el propio anuncio se rechaza con 400 `VALIDACION` y
  `campo: "anuncio"`, en el mismo orden de comprobaciones que el resto (existe, luego es propio).

### Decisiones de la I4 (favoritos)

- **Las rutas están repartidas por el recurso al que cuelgan**, no en un `routes/favoritos.js`:
  `POST`/`DELETE /anuncios/:id/favorito` en `routes/anuncios.js` y `GET /usuarios/me/favoritos` en
  `routes/usuarios.js`. El esquema está en `ARCHITECTURE.md`, pero el fichero que sirve cada URL es
  el del recurso del que cuelga.
- **El alta es idempotente con 201 y 200**, y ambos devuelven el mismo cuerpo
  (`datos.favorito`). El 201 significa "guardado ahora" y el 200 "ya estaba guardado"; en el 200 la
  fecha es la original, no se toca. La idempotencia la impone la restricción `UNIQUE` del esquema
  con un `INSERT IGNORE`, y el código se decide leyendo `affectedRows`, no preguntando antes con un
  `SELECT` (eso dejaría una carrera entre dos peticiones a la vez).
- **Quitar un favorito que no está devuelve 404**, no 204. Es lo que fija la SPEC de la I4 y es
  deliberado, aunque lo idiomático en un `DELETE` sea devolver 204 siempre.
- **El listado devuelve el mismo resumen ligero que los demás listados de anuncios**, con los
  anuncios vendidos dentro (que un favorito esté vendido es información, no un error) y ordenado
  por `favoritos.fecha` descendente con `favoritos.id` de desempate. Al ser un recurso secundario
  no se le añade `num_favoritos` por fila ni filtros propios: el frontend tiene un solo caso que
  aprender y el detalle ya trae el contador.

## Segundo backend (Supabase)

Como requerimiento adicional se desarrolla un segundo backend con **Supabase**, en un proyecto
totalmente aparte (`supabase-backend/`) y con su propio proceso SDD en `supabase-backend/docs/`.
Alcance reducido: autenticación y registro de usuarios y operaciones sobre el recurso principal
(anuncios), expuesto mediante una **capa de servicios** que aísla al cliente del API de Supabase.

