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

### Valoraciones

Campos:

- id
- puntuación # entero del 1 al 5
- comentario # texto opcional de hasta 500 caracteres
- fecha (fecha)
- id_valorador # quién valora (N:1 con Usuarios)
- id_valorado # quién recibe la valoración (N:1 con Usuarios)

`UNIQUE (id_valorador, id_valorado)`: un usuario valora a otro como mucho una vez, y volver a
valorar edita la fila en lugar de crear otra. Las dos claves foráneas van con `ON DELETE CASCADE`, de
modo que al borrar un usuario se van sus valoraciones dadas y recibidas sin tocar nada a mano. Hay un
índice por `id_valorado`, que es el que usa el resumen y el listado de lo que ha recibido.

### Convenciones de MySQL

- Todos los `id` son `INT UNSIGNED AUTO_INCREMENT PRIMARY KEY`
- Las fechas son `TIMESTAMP` con `DEFAULT CURRENT_TIMESTAMP`
- Los textos son `VARCHAR` (con `utf8mb4` para los acentos y la `ñ`), salvo la `descripcion` de los anuncios, que será `TEXT`
- El `precio` es `DECIMAL(10,2)` para evitar errores de redondeo de coma flotante
- `leido` es `BOOLEAN` (`TINYINT(1)`), y `estado` es `ENUM('disponible', 'vendido')`
- Los `id` no son correlativos y no tienen que serlo: el alta de favoritos y de conversaciones usa
  `INSERT IGNORE` para que la restricción `UNIQUE` decida sin preguntar antes, y MySQL consume un
  valor del `AUTO_INCREMENT` cada vez que el `INSERT` se descarta por duplicado. Comprobado en
  MySQL 8.0.46: tras un `INSERT` correcto y cinco ignorados, el siguiente `INSERT` correcto sale con
  `id` 7. Un cliente no debe suponer que el `id` siguiente es `id_anterior + 1`.
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
| GET | `/usuarios/:id` | JWT opcional | Perfil público (sin email), con `mi_valoracion` si el token ya ha valorado a ese usuario |
| GET | `/usuarios/:id/anuncios` | - | Anuncios publicados por el usuario (paginado) |
| GET | `/usuarios/me/anuncios` | JWT | Anuncios publicados por el usuario autenticado (paginado) |
| GET | `/usuarios/me/favoritos` | JWT | Anuncios guardados por el usuario autenticado (paginado) |
| GET | `/usuarios/me/conversaciones` | JWT | Conversaciones activas del usuario autenticado (paginado) |
| PUT | `/usuarios/:id/valoracion` | JWT | Crea o edita la valoración sobre ese usuario. 201 si es nueva, 200 si ya existía |
| DELETE | `/usuarios/:id/valoracion` | JWT | Borra mi valoración sobre ese usuario. 404 si no había ninguna |
| GET | `/usuarios/:id/valoraciones` | - | Valoraciones que ha recibido ese usuario (paginado) |
| GET | `/usuarios/me/valoraciones` | JWT | Valoraciones que he puesto yo (paginado) |
| GET | `/categorias` | - | Listado de categorías para los filtros (paginado) |
| GET | `/anuncios` | - | Listado con búsqueda por texto, filtro por categoría y ordenación por fecha o precio (paginado) |
| POST | `/anuncios` | JWT | Creación de un anuncio (`multipart/form-data` con campos + `imagen` opcional) |
| GET | `/anuncios/:id` | JWT opcional | Detalle + autor + categoría + `num_favoritos` (+ `conversacion`, `ultimos_mensajes` y `num_mensajes` si el token participa en un hilo del anuncio) |
| PATCH | `/anuncios/:id` | JWT (autor) | Edición de un anuncio (multipart opcional para la imagen) |
| PATCH | `/anuncios/:id/estado` | JWT (autor) | Cambio de estado disponible / vendido |
| DELETE | `/anuncios/:id` | JWT (autor) | Eliminación de un anuncio |
| POST | `/anuncios/:id/favorito` | JWT | Marca el anuncio como favorito (idempotente). 201 si es nuevo, 200 si ya estaba |
| DELETE | `/anuncios/:id/favorito` | JWT | Elimina el favorito (quitar de favoritos) |
| GET | `/anuncios/:id/mensajes` | JWT (comprador) | Mensajes de mi conversación con el vendedor (paginado). 400 si lo pide el vendedor |
| POST | `/anuncios/:id/mensajes` | JWT | Inicia (o reutiliza) la conversación con el vendedor y envía el mensaje |
| GET | `/clasify_api/uploads/:fichero` | - | Sirve una imagen subida |
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

Todos los listados de la API, **`GET /categorias` incluido**, usan ese mismo sobre. El de categorías
podría quedar fuera: son filas fijas de una tabla de referencia y un desplegable de filtros no
necesita paginación, y en el enunciado la exigencia de paginar está escrita dentro del bloque de
requisitos del recurso principal. Se pagina igualmente, y por dos razones concretas: para no tener que
recordar que un endpoint es el raro, y porque el backend de Supabase pagina el suyo y los dos
proyectos comparten la misma API, así que dejarlo solo aquí obligaría a mantener dos formatos de
respuesta distintos.

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

### Filtros del listado de mensajes

Los dos listados de mensajes (`/anuncios/:id/mensajes` y `/conversaciones/:id/mensajes`) aceptan,
además de la paginación:

| Parámetro | Valores | Por defecto |
|---|---|---|
| `desde` | `inicio`, `final` | `inicio` |

- `inicio` cuenta las páginas desde el principio del hilo, que es lo habitual en cualquier listado
  paginado. `final` cuenta desde el otro extremo: la primera página trae los últimos mensajes del
  hilo, que es lo que necesita quien está dentro de una conversación y quiere los últimos sin
  tener que paginar hasta el final.
- **Dentro de la página el orden siempre es del más antiguo al más nuevo**, también con
  `desde=final`, porque es como se lee un hilo. `desde=final` solo cambia por dónde se cuentan las
  páginas, no cómo se ordena lo que devuelve cada una.
- Un valor fuera de la lista es un 400 `VALIDACION` con `campo: "desde"`, como el resto de filtros.

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
  que la inició (`id_comprador`). El comprador usa `/anuncios/:id/mensajes`, que encuentra su hilo a
  partir del anuncio; el vendedor usa `/conversaciones/:id/mensajes`, porque puede tener varios.
  Si el vendedor pide la ruta del comprador, devuelve 400 `VALIDACION` con `campo: "anuncio"` y el
  mensaje que le dice dónde están las suyas.
- El perfil público no expone el email; solo el propio usuario lo ve en `/usuarios/me`. El `autor`
  que va embebido en `GET /anuncios/:id` sale con la misma proyección pública, sin email ni
  `password_hash`.
- El detalle de un anuncio devuelve `autor`, `categoria` y `num_favoritos`. `num_favoritos` sale de
  un `COUNT` sobre `favoritos`. Si quien lo pide es participante de alguna conversación de ese anuncio,
  el detalle añade además `conversacion: { id }`, `ultimos_mensajes` con los tres últimos mensajes
  del hilo y `num_mensajes` con el total, para que el cliente sepa si ya hay un hilo abierto y qué
  se ha dicho en él sin tener que escribir un mensaje ni hacer una llamada aparte. Un comprador
  tiene como mucho un hilo con un anuncio, pero el vendedor puede tener varios: para él se
  enseña el más reciente, ordenando por `fecha_creacion` y, a igualdad de fecha, por `id`
  descendente. La ruta es pública, así que el token es opcional: sin token, con uno que no
  verifique, o con el de alguien que no participa, el anuncio se sirve sin esos tres campos.
  Ver el detalle **no** marca ningún mensaje como leío: `leido` solo cambia cuando se lee el
  hilo por `GET /anuncios/:id/mensajes` o `GET /conversaciones/:id/mensajes`.
- Las valoraciones son siempre del usuario del token, y solo se pueden crear o borrar sobre otro
  usuario: valerse a uno mismo se rechaza con 400 `VALIDACION` y `campo: "usuario"`, igual que
  marcar el propio anuncio como favorito. `GET /usuarios/:id/valoraciones` es pública porque el
  enunciado pide poder ver la reputación de un vendedor; lo que no sale nunca es el email de quien
  valoró.
- `valoracion_media` sale como **número** en el JSON, no como el texto que devuelve el driver.
  `AVG` de una columna entera es un DECIMAL en MySQL y `mysql2` serializa los DECIMAL como texto,
  igual que hace con `precio`. Aquí sí cambia, a propósito: `precio` es dinero y el texto evita
  perder precisión, mientras que una media de 1 a 5 con dos decimales no tiene precisión que
  perder y quien la consume la quiere comparar, ordenar y pintar como estrellas. Se convierte con
  `Number(...)` al serializar.
- Las validaciones de entrada se aplican en el backend (precio no negativo, campos obligatorios,
  email único, formatos, etc.).
- `PATCH /usuarios/me` es un PATCH: solo se validan y se escriben los campos enviados, y los campos
  desconocidos se ignoran. El email no se puede cambiar (400 si viene en el cuerpo) y cambiar la
  contraseña exige enviar `password_actual`.
- Los favoritos son siempre del usuario del token: no hay ruta para ver ni para tocar los de otro, y
  el `DELETE` borra filtrando por `id_usuario`, así que conocer el id de un anuncio no da acceso a
  la fila de otra persona. Marcar el propio anuncio se rechaza con 400 `VALIDACION` y
  `campo: "anuncio"`, en el mismo orden de comprobaciones que el resto (existe, luego es propio).
- Un token JWT solo demuestra que la firma es nuestra, no que su usuario siga en la base de datos, y
  el token vive 7 días. El middleware `autenticar` comprueba que el usuario exista y devuelve 401
  `USUARIO_NO_EXISTE` si no, de modo que ninguna ruta protegida tenga que hacerlo por su cuenta
  (`/auth/yo` lo hacía antes, y el resto de rutas fallaba cada una a su manera).

### Decisiones de la I5 (mensajería)

- **Las rutas van repartidas por el recurso al que cuelgan**, igual que en la I4 y por el mismo
  motivo: `/anuncios/:id/mensajes` en `routes/anuncios.js`, `/conversaciones/:id/mensajes` en el
  nuevo `routes/conversaciones.js` y la bandeja `GET /usuarios/me/conversaciones` en
  `routes/usuarios.js`.
- **`POST /anuncios/:id/mensajes` devuelve `datos.conversacion` y `datos.mensaje`, con 201 si el hilo
  se acaba de abrir y 200 si ya existía.** La unicidad la impone la restricción `UNIQUE (id_anuncio,
  id_comprador)` con un `INSERT IGNORE` y el código se lee de `affectedRows`, igual que en los
  favoritos. `POST /conversaciones/:id/mensajes` solo devuelve `datos.mensaje`: el hilo ya está ahí y
  el cliente lo pidió por su id.
- **Un anuncio `vendido` solo bloquea la apertura de un hilo nuevo**, con 400 `VALIDACION` y
  `campo: "estado"`. Un hilo abierto antes de la venta sigue aceptando mensajes por las dos rutas,
  porque es justo cuando el comprador necesita hablar con el vendedor (dónde queda, cómo se paga) y
  porque bloquear solo una de las dos rutas daría dos respuestas distintas para lo mismo.
- **Leer un hilo marca como leídos los mensajes del otro participante**, y solo los suyos: quien
  lista es quien "lee". Se marcan todos los pendientes del otro, no solo los de la página devuelta,
  para que `no_leidos` sea el total real. La bandeja **no** marca nada: abrir la lista no puede vaciar
  los pendientes.
- **La bandeja ordena por última actividad** (fecha del último mensaje, con el `id` de desempate
  porque `fecha` es un `TIMESTAMP` de segundos) y trae el resumen ligero del anuncio, la
  contraparte con su proyección pública, el último mensaje y `no_leidos`.
- **`?desde=final` cuenta las páginas desde el final del hilo** para quien está dentro de una
  conversación y quiere los últimos mensajes. Dentro de la página el orden no cambia: un hilo se lee
  de más antiguo a más nuevo.
- **`GET /anuncios/:id` acepta token opcional** (`autenticarSiHayToken`) y añade
  `conversacion: { id }` solo si quien pregunta participa. Un token ausente, inválido, caducado o de
  un usuario borrado no es un error en una ruta pública: la petición sigue como anónima.

### Decisiones de la I6 (valoraciones)

- **Las rutas cuelgan de `routes/usuarios.js`**, con el nombre en singular para la acción y en plural
  para el listado: `PUT`/`DELETE /usuarios/:id/valoracion` y `GET /usuarios/:id/valoraciones`, más
  `GET /usuarios/me/valoraciones`. `/me/valoraciones` se registra **antes** que
  `/:id/valoraciones`, porque en Express el orden de registro manda y si no, `/me` se come el
  `/:id`.
- **Valorar es `PUT` y no `POST`.** Repetir la misma acción es actualizar, no crear, y el cliente
  puede repetir la llamada sin miedo. El `201` del primer alta y el `200` de las siguientes lo dice
  el propio servicio con un campo `nuevo`, no el cliente tiene que preguntar antes.
- **El alta y la edición se resuelven con `INSERT IGNORE` y, solo si dio 0, un `UPDATE`.** Se
  descartó `ON DUPLICATE KEY UPDATE`, que sería lo natural en una sola sentencia, porque devuelve
  `affectedRows` 1 tanto al insertar como al actualizar con los mismos valores, así que no permite
  distinguir el 201 del 200. Comprobado contra el MySQL 8.0.46 de la máquina. El `UPDATE` va con
  `WHERE id_valorador = ? AND id_valorado = ?`, no con el `id` de la valoración, para que el borrado
  en cascada de un usuario no deje el `UPDATE` escribiendo sobre una fila que ya no existe.
- **`INSERT IGNORE` se traga los errores, y eso es un riesgo asumido.** Se traga también una
  violación del `CHECK` de la puntuación. No puede colar un 7 porque la validación de la capa de
  entrada ya lo ha rechazado con un 400, pero si algún día alguien salta esa capa la fila no entra y
  el `UPDATE` posterior falla, así que el error sale igualmente.
- **La puntuación se valida en el middleware, no en el esquema.** El `CHECK` es la red de seguridad
  final, no la respuesta: un `CHECK` violado sería un 500 desde el manejador central de errores, y lo
  que tiene que contestar la API es un 400 con el nombre del campo. El `CHECK` solo se cumple a
  partir de MySQL 8.0.16, que ya es la versión mínima del proyecto.
- **El resumen va en la misma consulta que el perfil**, con dos subconsultas correlacionadas por
  `id_valorado` en lugar de un `AVG` con `GROUP BY`: así la fila del usuario y su resumen salen
  siempre juntas y no puede aparecer un resumen sin dueño. Sin ninguna valoración la media es
  `null` y el recuento 0, porque el 0 significaría a la vez "nadie me ha valorado" y "mi media es
  cero", y no es lo mismo.
- **`mi_valoracion` va dentro de `GET /usuarios/:id` con token opcional**, y no en una llamada
  aparte, porque el frontend ya está cargando ese perfil. Solo se devuelve sobre el perfil del otro:
  sobre el propio ya viene todo en `PATCH`/`GET /usuarios/me`.
- **`GET /usuarios/:id` pasa a llevar token opcional** (`autenticarSiHayToken`), igual que el detalle
  del anuncio desde la I5. No rompe a quien ya la llamaba sin token: el middleware solo borra
  `req.usuario` cuando el token no verifica, así que la respuesta sin token es idéntica a la
  anterior.
- **`ultimos_mensajes` enseña los tres últimos mensajes, de más antiguo a más nuevo.** Es el orden
  en que se lee un hilo; devolverlos del revés obliga al frontend a invertir el array para pintar.
  `num_mensajes` va aparte para que el cliente sepa que hay más sin tener que paginar para
  enterarse.

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

