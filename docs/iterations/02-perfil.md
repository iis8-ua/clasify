# Iteración 02 - Perfil de usuario

## SPEC

### Objetivo

Permitir consultar el perfil público de cualquier usuario y que cada usuario autenticado vea y
edite su propio perfil.

### Requisitos

Funcionales:

- `GET /usuarios/me` (JWT) devuelve el perfil propio, incluyendo el email.
- `PATCH /usuarios/me` (JWT) permite editar nombre, biografía y contraseña del propio usuario.
- `GET /usuarios/:id` devuelve el perfil público (id, nombre, biografía, fecha de alta) **sin email**.
- `GET /usuarios/:id/anuncios` devuelve los anuncios del usuario de forma paginada.
- Un usuario solo puede editar su propio perfil; no existe forma de editar el de otro.

Técnicos:

- Las rutas de `/usuarios/me` usan el middleware de JWT; `/usuarios/:id` es pública.
- Al cambiar la contraseña se vuelve a aplicar el hash (nunca se guarda en claro).
- El email no se puede cambiar en esta versión.
- Validación de entradas: nombre obligatorio, longitudes acotadas, contraseña con longitud mínima.

### Fuera de alcance

- Foto de perfil / avatar.
- Cambio de email.
- Borrado de la propia cuenta.

### Ajustes durante la iteración

- Se implementa también **`GET /usuarios/me/anuncios`** (JWT), que estaba en la tabla de
  `ARCHITECTURE.md` pero no en el PLAN. Se hace aquí porque es el mismo listado que
  `GET /usuarios/:id/anuncios` y así el usuario puede ver sus anuncios con su propio token.
- **Cambiar la contraseña exige enviar `password_actual`**. No lo pedía la SPEC: con solo el token
  bastaba, y eso hace que un token robado permita cambiar la contraseña. Si la actual no coincide
  se devuelve 401 `CREDENCIALES_INVALIDAS` y no se escribe nada.
- Si el `PATCH` incluye `email`, se responde **400 `VALIDACION`** con el mensaje "El email no se
  puede cambiar". La alternativa era ignorarlo en silencio, que se eligió la opción explícita.
- Campos desconocidos en el `PATCH`: se **ignoran**, como es habitual en un PATCH. Si no viene
  ningún campo editable (cuerpo vacío o solo campos desconocidos), se devuelve 400 en vez de un
  200 que no cambia nada.
- El perfil público **no lleva `num_anuncios`**: el total de anuncios sale del `total` de
  `paginacion` de `GET /usuarios/:id/anuncios`, y así no hay que mantener un contador.
- Un `:id` que no es un entero positivo (`abc`, `0`, `-3`, `1.5`) devuelve **400** con
  `campo: "id"`, no 404: es un id mal formado, no un recurso que no exista.
- `GET /usuarios/:id/anuncios` de un usuario inexistente devuelve 404, para que se comporte igual
  que `GET /usuarios/:id`.
- Se crea **`src/helpers/paginacion.js`**. El PLAN daba por hecho que ya existía, pero hasta ahora
  no había ningún listado paginado en el proyecto. Lo usarán el resto de listados a partir de
  aquí, así que fija el formato de `ARCHITECTURE.md`: `pagina` (1 por defecto), `limite` (20 por
  defecto, máximo 100) y `paginas: 0` cuando no hay elementos.
- `usuarioService` reutiliza `hashearContrasena` y `verificarContrasena` de `authService` en vez de
  volver a llamar a `bcrypt`, para que el coste del hash (12) esté escrito en un solo sitio.
- Se cierran los tres puntos que la I1 dejó como pendientes (ver `01-setup.md`): hash señuelo en el
  login, `USUARIO_NO_EXISTE` con `ApiError` y documentado, y el test automático de `TOKEN_CADUCADO`.
  El cuarto (que la SPEC de la I1 no mencionaba `src/errors/`) era solo documentación y no hacía
  falta cambiar nada.

## PLAN

1. Crear `src/services/usuarioService.js` con las consultas de perfil (público y propio) y la
   actualización del perfil (incluido el re-hash de la contraseña).
2. Crear `src/routes/usuarios.js` con `GET /usuarios/:id`, `GET /usuarios/me`, `PATCH /usuarios/me`
   y `GET /usuarios/:id/anuncios`.
3. Reutilizar el helper de paginación para `GET /usuarios/:id/anuncios`.
4. Definir la proyección del perfil público para no exponer `email` ni `password_hash`.
5. Validar las entradas del `PATCH` y devolver el error uniforme.
6. Escribir las pruebas automáticas de la iteración.

### Revisión del estudiante

Qué hay que mirar de esta iteración:

- [x] `src/routes/usuarios.js`: las rutas con `me` están **antes** que las de `/:id`. Si no fuera
      así, Express leería `"me"` como un id y `GET /usuarios/me` pediría el usuario número 0.

    ```http
    GET /clasify_api/usuarios/me
    Authorization: Bearer <token>
    ```

    ```json
    { "datos": { "usuario": { "id": 1, "email": "ana@example.com", "nombre": "Ana Ruiz" } } }
    ```

    Y sin token, que es el mismo `SIN_TOKEN` de siempre, así que no se cuela por ahí:

    ```json
    { "error": { "codigo": "SIN_TOKEN", "mensaje": "Falta el token en la cabecera Authorization" } }
    ```

- [x] `src/services/usuarioService.js`: el perfil público no sale de un `SELECT *` con el email
      borrado después, sino de un `SELECT` que nunca pide el email ni el `password_hash`.

    ```bash
    mysql -u clasify_app -p clasify -e "SELECT id, email, nombre, biografia, fecha_alta FROM usuarios WHERE id = 1;"
    ```

    ```text
    +----+--------------------+------------------+----------+-------------------------+
    | id | email              | nombre           | biografia | fecha_alta              |
    +----+--------------------+------------------+----------+-------------------------+
    |  1 | ana@example.com    | Ana Editada      | Vendo ... | 2026-09-29 12:06:06     |
    +----+--------------------+------------------+----------+-------------------------+
    ```

    ```http
    GET /clasify_api/usuarios/1
    ```

    ```json
    {
        "datos": {
            "usuario": {
                "id": 1,
                "nombre": "Ana Editada",
                "biografia": "Vendo cosas que ya no uso. Perfil de prueba.",
                "fecha_alta": "2026-09-29T12:06:06.000Z"
            }
        }
    }
    ```

- [x] `src/services/usuarioService.js`: al cambiar la contraseña se comprueba la actual **antes**
      de escribir, y el hash se vuelve a aplicar. Comprobado en la base de datos después de
      cambiar la de `ana@example.com`:

    ```bash
    mysql -u clasify_app -p clasify -e "SELECT email, LEFT(password_hash,7) AS inicio, CHAR_LENGTH(password_hash) AS largo FROM usuarios WHERE email='ana@example.com';"
    ```

    ```text
    +-----------------+---------+-------+
    | email           | inicio  | largo |
    +-----------------+---------+-------+
    | ana@example.com | $2b$12$ |    60 |
    +-----------------+---------+-------+
    ```

- [x] `src/helpers/paginacion.js`: `pagina` y `limite` se validan y el `total` sale de un
      `COUNT(*)` aparte, para no calcularlo en memoria. Con cuatro anuncios en la base de datos:

    ```http
    GET /clasify_api/usuarios/1/anuncios?pagina=2&limite=2
    ```

    ```json
    {
        "datos": [ { "id": 3, "titulo": "Mesa de madera" }, { "id": 2, "titulo": "Bicicleta de montaña" } ],
        "paginacion": { "pagina": 2, "limite": 2, "total": 4, "paginas": 2 }
    }
    ```

    (En la respuesta real cada anuncio trae también `precio`, `estado`, `imagen`, `fecha_creacion`
    e `id_categoria`; aquí están recortados.)

- [x] `src/middleware/validar.js`: el `PATCH` valida solo lo que se envía, y el email se rechaza
      aunque se mande el mismo.

    ```http
    PATCH /clasify_api/usuarios/me
    Content-Type: application/json

    { "email": "otro@example.com" }
    ```

    ```json
    { "error": { "codigo": "VALIDACION", "mensaje": "El email no se puede cambiar", "campo": "email" } }
    ```

### Riesgos o dudas

- Decidir si se permite que `PATCH /usuarios/me` acepte el email vacío sin modificarlo. **Resuelto**:
  se rechaza con 400 en cuanto el campo `email` aparece, tenga el valor que tenga.
- Confirmar si el perfil público debe incluir el número de anuncios publicados. **Resuelto**: no.
  El total sale de `paginacion.total` del listado de anuncios, para no mantener un contador que se
  pueda desincronizar.
- Exigir la contraseña actual al cambiarla no estaba en la SPEC. Es una decisión del estudiante,
  tomada como mejora de seguridad, y queda documentada en `ARCHITECTURE.md`.
- La contraseña de `ana@example.com` se cambió a mano durante las pruebas y luego se dejó de vuelta
  en `Clasify123!` para que la base de desarrollo siga igual que la del seed.

## TEST_PLAN

### Pruebas manuales

Probadas el 30/09/2026 con el servidor arrancado (`npm start`, MySQL 8.0.46) y peticiones `curl`.

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `GET /usuarios/me` con token válido | Devuelve 200 con el perfil y el email | Correcto. 200 con `id`, `email`, `nombre`, `biografia` y `fecha_alta` |
| `GET /usuarios/me` sin token | Devuelve 401 | Correcto. 401 `SIN_TOKEN` |
| `GET /usuarios/:id` de otro usuario | Devuelve 200 y **no** incluye el email | Correcto. 200 con `id`, `nombre`, `biografia` y `fecha_alta`, sin `email` |
| `GET /usuarios/:id` con id inexistente | Devuelve 404 | Correcto. 404 `NO_ENCONTRADO`, "No existe el usuario 999" |
| `GET /usuarios/abc` | Devuelve 400 con el campo señalado | Correcto. 400 `VALIDACION` con `campo: "id"` |
| `PATCH /usuarios/me` cambiando el nombre | Devuelve 200 con el perfil actualizado | Correcto. 200 y el nombre ya viene recortado y guardado |
| `PATCH /usuarios/me` con nombre vacío | Devuelve 400 con el campo señalado | Correcto. 400 `VALIDACION` con `campo: "nombre"` |
| `PATCH /usuarios/me` con `email` | Devuelve 400 con el campo señalado | Correcto. 400 `VALIDACION` con `campo: "email"`, tanto con otro email como con el mismo |
| `PATCH /usuarios/me` sin campos editables | Devuelve 400 | Correcto. 400 `VALIDACION`, "No hay ningún campo editable en el cuerpo de la petición" |
| `PATCH /usuarios/me` con biografía de 501 caracteres | Devuelve 400 con el campo señalado | Correcto. 400 `VALIDACION` con `campo: "biografia"` |
| `PATCH /usuarios/me` con contraseña nueva sin la actual | Devuelve 400 | Correcto. 400 `VALIDACION` con `campo: "password_actual"` |
| `PATCH /usuarios/me` con la contraseña actual incorrecta | Devuelve 401 y no cambia la contraseña | Correcto. 401 `CREDENCIALES_INVALIDAS`; el login con la antigua sigue entrando |
| `PATCH /usuarios/me` cambiando la contraseña | Se puede hacer login con la nueva contraseña | Correcto. 200; login con la nueva 200 y con la antigua 401. El hash en la BD sigue siendo `$2b$12$` de 60 caracteres |
| `GET /usuarios/:id/anuncios` | Devuelve 200 con el formato paginado | Correcto. 200 con `datos` y `paginacion` (`total: 4, paginas: 1` con cuatro anuncios insertados a mano) |
| `GET /usuarios/:id/anuncios?pagina=2&limite=2` | Devuelve la segunda página | Correcto. 2 anuncios y `paginacion: {pagina: 2, limite: 2, total: 4, paginas: 2}` |
| `GET /usuarios/:id/anuncios?limite=999` | Devuelve 400 (límite fuera de rango) | Correcto. 400 `VALIDACION` con `campo: "limite"` |
| `GET /usuarios/:id/anuncios` de un usuario sin anuncios | Devuelve 200 con la lista vacía | Correcto. `datos: []` y `paginacion.total: 0` |
| `GET /usuarios/999/anuncios` | Devuelve 404 | Correcto. 404 `NO_ENCONTRADO` |
| `GET /usuarios/me/anuncios` con token | Devuelve 200 con el listado del token | Correcto. 200 con el mismo formato paginado |
| `GET /usuarios/me/anuncios` sin token | Devuelve 401 | Correcto. 401 `SIN_TOKEN` |

Los cuatro anuncios usados en las pruebas se insertaron directamente con `mysql`, porque el CRUD de
anuncios es la I3 y todavía no hay endpoint para crearlos. Después se borraron.

### Tests automáticos

Con **Jest + Supertest** contra la API (base de datos de pruebas `clasify_test`):

- `tests/usuarios.test.js`, 33 pruebas: perfil propio con y sin token, perfil público sin email ni
  `password_hash`, 404 con id inexistente, 4 casos de id mal formado, edición de nombre y
  biografía, biografía vacía que se guarda a `null`, 9 casos de validación del `PATCH` (nombre
  vacío o largo, biografía no textual o larga, contraseña corta, email distinto o igual, cambio de
  contraseña sin la actual y cuerpo sin campos editables), `PATCH` sin token, cambio de contraseña
  comprobando que el login con la nueva funciona y con la vieja no, contraseña actual incorrecta
  comprobando que no se cambia nada, listado paginado con `pagina` y `limite`, 4 casos de
  paginación inválida, listado vacío, 404 y `/usuarios/me/anuncios` con y sin token.
- `tests/auth.test.js` se le añade el test de `TOKEN_CADUCADO`, que era el único caso del
  `TEST_PLAN` de la I1 que solo se había comprobado a mano.

Resultado obtenido el 30/09/2026 con `npm test`: **49 pruebas, 49 correctas, 0 fallidas**, en 34,6 s
(16 de `auth.test.js` y 33 de `usuarios.test.js`).
Cobertura: 92,9 % de sentencias, 77,9 % de ramas, 95,6 % de funciones. Sube desde el 86,4 % de la I1.
El fichero peor cubierto sigue siendo `middleware/errores.js` (45,5 %), porque sus caminos internos
de error (JSON inválido, cuerpo demasiado grande, error no controlado) no se comprueban hasta que
existan las rutas que los disparan.

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: big-pickle
- Tipo: generación y revisión de código, con las decisiones de diseño y de alcance tomadas por el
  estudiante

### Uso realizado

La IA se usó por partes, no de una sola vez:

1. **Generación del código**: `helpers/paginacion.js`, `usuarioService.js`, `routes/usuarios.js`, los
   validadores del `PATCH` y los 33 tests de `usuarios.test.js`.
2. **Revisión**: la IA contrastó la SPEC de la iteración con `ARCHITECTURE.md` y avisó de que
   `GET /usuarios/me/anuncios` faltaba en el PLAN, de que el helper de paginación no existía todavía
   y de los tres pendientes que la I1 había dejado abiertos. De ahí salieron las cuatro decisiones
   de la sección *Ajustes*.
3. **Corrección durante la implementación**: la IA detectó al escribir el código que
   `usuarioService` duplicaba las proyecciones de `authService` y las quitó; y que el 404 de
   `perfilPublico` decía "El usuario 999 no encontrado", que sonaba mal, unificado en "No existe el
   usuario 999".

Lo que **no** hizo la IA: decidir el alcance de la iteración, si había que exigir la contraseña
actual, qué hacer con el `email` en el `PATCH`, ni si el perfil público llevaba el número de
anuncios. Esas cuatro las decidió el estudiante tras ver las opciones.

### Prompt importante 1

> "vale pues empezamos con la iteracion 2"

Contexto: la revisión de la I1 había dejado cuatro puntos anotados como "Pendiente para la I2". La
IA propuso resolverlos dentro de esta iteración, y preguntó antes las cuatro
decisiones que la SPEC dejaba abiertas, en lugar de elegir por su cuenta.

### Prompt importante 2

> "compruebas que esta todo bien en el documento de 01-setup"

Este prompt de la I1 condicionó el ritmo de la revisión: la IA no se limita a decir que el código
funciona, contrasta cada afirmación del documento con el código, la base de datos, la cobertura y
el historial de git, y da los números exactos que puede comprobar.

### Resultado

- 4 commits: 2 de código, 2 de pruebas.
- `npm test`: 49/49 correctas, 92,9 % de cobertura de sentencias (subió 6,5 puntos).
- Los 20 casos del `TEST_PLAN` verificados sobre el servidor real con `curl`, no solo con tests.
- 3 puntos de la I1 cerrados y 2 correcciones sobre lo generado en la propia iteración.
- Un contratiempo: cambiar la contraseña de `ana@example.com` durante las pruebas manuales dejó la
  base de desarrollo con una contraseña distinta de la del seed, y hubo que volver a ponerla.

### Decisión del estudiante

Lo que se aceptó de lo propuesto por la IA:

- **Implementar `GET /usuarios/me/anuncios` en la I2**, aunque no estuviera en el PLAN, porque el
  listado ya salía de la misma función.
- **Exigir `password_actual`** para cambiar la contraseña, aunque la SPEC no lo pedía.
- **Rechazar con 400 el `email` en el `PATCH`** en vez de ignorarlo en silencio.
- **No poner `num_anuncios`** en el perfil público: el total ya está en `paginacion.total`.
- **Cerrar en esta iteración los pendientes de la I1**, para no dejarlos colgando.

Lo que se cambió o rechazó:

- El helper de paginación se creó en `src/helpers/` y no como middleware: no hace falta una función
  de Express, solo leer la query y montar la respuesta.

### Correcciones manuales

1. `usuarioService.js` definía `projectionPrivada` y `projectionPublica`, los mismos nombres que ya
   exportaba `authService.js` con otra forma (3 campos frente a 5). Se quitaron y el perfil se
   devuelve directamente de la consulta, para que no hubiera dos proyecciones con el mismo nombre y
   distinto contenido.
2. El 404 de un usuario inexistente salía como "El usuario 999 no encontrado" por usar
   `ApiError.noEncontrado()`, que está pensado para recursos ("no encontrado"). Se unificó con el
   404 de ruta ("No existe la ruta ...") mediante un `usuarioNoEncontrado(id)` propio.
3. La primera versión de `GET /usuarios/:id/anuncios` construía el 404 a mano con `res.status(404).json(...)`,
   que es justo lo que la I1 había marcado como error a corregir. Se sustituyó por
   `usuarioService.exigirUsuario(id)`, que lanza el `ApiError` y lo formatea el manejador central.

## COMMITS RELACIONADOS

- `655e8c8` - `añadir(usuarios): perfil propio, perfil público y edición`
- `1098d1e` - `corregir(auth): iguala el tiempo del login y unifica el 401 de /auth/yo`
- `31b6748` - `probar(usuarios): añade los tests de perfil y edición`
- `c885e48` - `probar(auth): añade el test del token caducado`
