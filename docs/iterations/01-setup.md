# Iteración 01 - Setup y autenticación

## SPEC

### Objetivo

Poner en marcha el proyecto desde cero: repositorio git y `.gitignore`, estructura de carpetas,
configuración del backend, conexión con la base de datos, modelo de datos y autenticación de
usuarios.

### Requisitos

Funcionales:

- Registrar un usuario con email, nombre y contraseña.
- Hacer login y recibir un token JWT.
- Cerrar sesión en el cliente (el token se descarta).
- Una petición protegida rechaza peticiones sin token o con token inválido.
- No se pueden registrar dos usuarios con el mismo email.

Técnicos:

- Repositorio **git** inicializado en la raíz `P1/`, con un `.gitignore` que excluye `node_modules/`,
  `.env`, `backend/uploads/` (salvo `.gitkeep`) y `coverage/`.
- Estructura de carpetas del backend: `backend/src/{routes,services,middleware,db}`, `backend/tests`
  y `backend/uploads` (con `.gitkeep` para que la carpeta exista en el repo).
- Backend Node/Express con API REST bajo el prefijo `/clasify_api/`.
- Dependencias instaladas: `express`, `mysql2`, `jsonwebtoken`, `bcrypt`, `multer` y, para pruebas,
  `jest` y `supertest`.
- MySQL como base de datos, accesible con `mysql2`.
- Esquema creado con las tablas `usuarios`, `categorias`, `anuncios`, `favoritos`, `conversaciones` y `mensajes` según `ARCHITECTURE.md`.
- Contraseñas almacenadas como hash, nunca en claro.
- Validación de entradas en el backend (campos obligatorios, formato de email, contraseña).
- El script de creación del esquema debe poder ejecutarse más de una vez sin fallar.

### Fuera de alcance

- Perfil de usuario (ver/editar perfil propio y perfil público).
- Anuncios (CRUD completo, búsqueda, filtros y paginación).
- Favoritos.
- Conversaciones y mensajería.
- Frontend (solo se deja la base de la API).

### Ajustes durante la iteración

- Se añade **`dotenv`** como dependencia, que no estaba en la lista del PLAN, para cargar
  `backend/.env`.
- Se instala **Express 5** en lugar de Express 4. En Express 5 los handlers `async` propagan solos
  sus errores al manejador central, así que no hacen falta funciones envolventes.
- Se añade el script **`db:create-databases`**, además de `db:schema` y `db:seed`, porque crear las
  bases de datos la primera vez necesita un usuario con permiso `CREATE`.
- Se añaden dos endpoints que no estaban en la tabla de `ARCHITECTURE.md`: `GET /clasify_api/salud`
  (comprobar que el servidor responde) y `GET /clasify_api/auth/yo` (endpoint protegido del paso 11
  del PLAN). Se han documentado ya en `ARCHITECTURE.md`.
- `GET /clasify_api/auth/yo` devuelve el email del propio usuario, igual que hará `/usuarios/me` en
  la I2. `/usuarios/me` sigue deliberadamente fuera de alcance en esta iteración.
- Las respuestas correctas que no son un listado se envuelven en `datos`, igual que los listados
  paginados pero sin `paginacion`, para no mantener dos convenciones.

## PLAN

1. Inicializar el repositorio git en la raíz `P1/`.
2. Crear el `.gitignore` (`node_modules/`, `.env`, `backend/uploads/` salvo `.gitkeep`, `coverage/`, `*.log`, `.DS_Store`).
3. Crear la estructura de carpetas del backend: `backend/src/{routes,services,middleware,db}`, `backend/tests` y `backend/uploads` con `.gitkeep`.
4. Inicializar el proyecto Node (`package.json`) e instalar las dependencias (`express`, `mysql2`, `jsonwebtoken`, `bcrypt`, `multer`, `jest`, `supertest`).
5. Configurar las variables de entorno (`.env` y `.env.example`) y el pool de conexión con `mysql2`.
6. Crear el script de esquema (`schema.sql`) a partir del modelo de datos de `ARCHITECTURE.md`, con las convenciones de MySQL definidas allí.
7. Cargar datos iniciales: categorías y usuarios de prueba.
8. Crear `src/services/authService.js` para el hash y la verificación de contraseñas.
9. Crear `src/routes/auth.js` con `/auth/register` y `/auth/login`.
10. Crear `src/middleware/auth.js` con la verificación del token JWT.
11. Añadir un endpoint protegido de prueba para comprobar que el middleware bloquea peticiones sin token válido.
12. Validar entradas en los endpoints de autenticación.
13. Hacer el primer commit de la iteración (setup + autenticación).

### Revisión del estudiante

Qué hay que mirar de esta iteración:

- [x] `src/services/authService.js`: el hash se genera con `bcrypt` y coste 12, y el login no
      distingue entre "email no existe" y "contraseña incorrecta" a propósito, para no revelar qué
      emails están registrados.

    El coste está en `COSTE_HASH = 12`, y `autenticar()` lanza siempre el mismo
    `CREDENCIALES_INVALIDAS` llegue o no el email. Para comprobar que en la base de datos se guarda
    el hash y no la contraseña:

    ```bash
    mysql -u clasify_app -p clasify -e "SELECT email, LEFT(password_hash,7) AS inicio, CHAR_LENGTH(password_hash) AS largo FROM usuarios;"
    ```

    ```text
    +--------------------+---------+-------+
    | email              | inicio  | largo |
    +--------------------+---------+-------+
    | ana@example.com    | $2b$12$ |    60 |
    | carlos@example.com | $2b$12$ |    60 |
    +--------------------+---------+-------+
    ```

    Los 60 caracteres son el formato de bcrypt (`$2b$` + coste + sal + hash), y tanto el prefijo
    `$2b$12$` como el largo son los de un hash de coste 12: ninguna contraseña se guarda en claro.

- [x] `src/middleware/auth.js`: comprueba el esquema `Bearer` y distingue token inválido de
      caducado.

    Sin cabecera `Authorization`:

    ```http
    GET /clasify_api/auth/yo
    ```

    ```json
    {
        "error": {
            "codigo": "SIN_TOKEN",
            "mensaje": "Falta el token en la cabecera Authorization"
        }
    }
    ```

    Con un esquema que no es `Bearer`:

    ```http
    GET /clasify_api/auth/yo
    Authorization: Basic dXNlcjpwYXNz
    ```

    ```json
    {
        "error": {
            "codigo": "ESQUEMA_INVALIDO",
            "mensaje": "El token debe enviarse como \"Authorization: Bearer <token>\""
        }
    }
    ```

    Con `Bearer`, pero un token que no verifica la firma:

    ```http
    GET /clasify_api/auth/yo
    Authorization: Bearer token-que-no-es-valido
    ```

    ```json
    {
        "error": {
            "codigo": "TOKEN_INVALIDO",
            "mensaje": "El token no es válido"
        }
    }
    ```

    Y con un token bien firmado pero ya caducado (generado con `expiresIn: -10`):

    ```json
    {
        "error": {
            "codigo": "TOKEN_CADUCADO",
            "mensaje": "El token ha caducado"
        }
    }
    ```

- [x] `src/middleware/validar.js`: la contraseña mínima son 8 caracteres. Es una decisión propia,
      no venía especificada.

    Con 7 caracteres, el 400:

    ```http
    POST /clasify_api/auth/register
    Content-Type: application/json

    { "email": "limite1@example.com", "nombre": "Límite", "password": "1234567" }
    ```

    ```json
    {
        "error": {
            "codigo": "VALIDACION",
            "mensaje": "La contraseña debe tener al menos 8 caracteres",
            "campo": "password"
        }
    }
    ```

    Con 8 caracteres, el 201 esperado:

    ```http
    POST /clasify_api/auth/register
    Content-Type: application/json

    { "email": "limite2@example.com", "nombre": "Límite", "password": "12345678" }
    ```

    ```json
    {
        "datos": {
            "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<payload>.<firma>",
            "usuario": {
                "id": 6,
                "email": "limite2@example.com",
                "nombre": "Límite"
            }
        }
    }
    ```

    El token va recortado: es una firma real de un servidor local y no dice nada más entero.

- [x] `src/db/schema.sql`: cada `CREATE TABLE` es `IF NOT EXISTS` y el seed usa `INSERT IGNORE`, por
      eso ambos scripts se pueden repetir sin romper nada.

    Ejecutados los dos scripts dos veces seguidas: las 6 tablas ya estaban y no saltó ningún error.

- [x] `src/app.js`: las rutas se montan bajo `/clasify_api` y las imágenes se sirven en
      `/clasify_api/uploads`.

    Todas las peticiones de esta iteración llevan el prefijo, y el `express.static` de la línea 13
    es el que sirve `/clasify_api/uploads`.

- [x] `tests/ayudaBaseDeDatos.js`: los `TRUNCATE` usan **una conexión dedicada** del pool. Si se
      hicieran con `pool.execute` uno a uno, el `SET FOREIGN_KEY_CHECKS` se aplicaría a una sesión
      distinta de la del `TRUNCATE` y no serviría de nada.

    En `limpiarTablas()` se ve: `pool.getConnection()` para el `SET FOREIGN_KEY_CHECKS`, los
    `TRUNCATE` y el `SET FOREIGN_KEY_CHECKS = 1`, y `release()` en el `finally`.

Decisiones que tomó el estudiante y conviene que se lean antes de dar la iteración por buena: el
seed se dejó con los usuarios de prueba y `GET /auth/yo` devuelve el email (ver `AI_LOG`).

### Riesgos o dudas

- **Versión de MySQL**: resuelta. MySQL 8.0.46 en el entorno de desarrollo, confirmado al empezar.
- **Seed en el script de esquema o aparte**: resuelta. Va aparte, en `src/db/seed.sql`, para poder
  recargar los datos sin recrear las tablas.
- **Permisos de MySQL**: crear las bases requiere un usuario con permiso `CREATE`. Una vez creadas
  con `db:create-databases`, el usuario de la aplicación solo necesita permisos sobre `clasify` y
  `clasify_test`.

### Pendiente para la I2

Cosas que han salido al revisar la I1. **Los tres primeros puntos se han resuelto en la I2**, en el
commit `1098d1e` y en `c885e48`; el cuarto no hacía falta tocar nada.

- ~~`src/routes/auth.js` devuelve `USUARIO_NO_EXISTE` con `res.json` en vez de `ApiError`, y ese
  código no está en la tabla de errores de `ARCHITECTURE.md`.~~ **Resuelto en la I2**: ahora se lanza
  `ApiError` y el código está en la tabla de `ARCHITECTURE.md`.
- ~~`src/services/authService.js` no llama a `bcrypt.compare` cuando el email no existe. El mensaje
  es el mismo en los dos casos, pero el tiempo de respuesta no, así que en teoría se puede deducir
  qué emails están registrados.~~ **Resuelto en la I2**: se compara siempre, contra un hash señuelo
  si el usuario no existe.
- ~~No hay test automático de `TOKEN_CADUCADO`, solo la prueba manual de la tabla de arriba.~~
  **Resuelto en la I2**: está en `auth.test.js`.
- La estructura de carpetas de la SPEC no menciona `src/errors/`. No es un problema: la carpeta
  existe y se usa, solo es que la SPEC no la recogía.

## TEST_PLAN

### Pruebas manuales

Probadas el 29/09/2026 con el servidor arrancado (`npm start`, MySQL 8.0.46) y peticiones `curl`.

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| El servidor arranca con la base de datos disponible | Arranca sin errores y responde | Correcto. Log: "Conectado a la base de datos clasify" y `GET /clasify_api/salud` → 200 `{"datos":{"estado":"ok"}}` |
| El repositorio git está inicializado en `P1/` | `git status` funciona y hay historial de commits | Correcto. 10 commits, repositorio enlazado con `origin` |
| `.gitignore` excluye `node_modules/`, `.env` y subidas | No aparecen en `git status` | Correcto. `git check-ignore` confirma `.env`, `node_modules/` y `backend/uploads/*` |
| La carpeta `backend/uploads/` se conserva en el repo | El `.gitkeep` está versionado | Correcto. `backend/uploads/.gitkeep` versionado |
| El script de esquema se ejecuta dos veces | La segunda ejecución no falla | Correcto. Ejecutado dos veces, aparecen las 6 tablas y no hay error |
| Registro con email, nombre y contraseña válidos | Devuelve 201 y el usuario creado | Correcto. 201 con `token` y `usuario` |
| Registro con email ya existente | Devuelve 409 con mensaje de error | Correcto. 409 `EMAIL_DUPLICADO`, `campo: "email"` |
| Registro con email inválido o contraseña corta | Devuelve 400 con el campo señalado | Correcto. 400 `VALIDACION` con `campo: "email"` y con `campo: "password"` |
| Login con credenciales correctas | Devuelve 200 y un token JWT | Correcto. 200 con token; verificado también con el usuario del seed |
| Login con contraseña incorrecta | Devuelve 401 con mensaje de error | Correcto. 401 `CREDENCIALES_INVALIDAS` |
| Petición protegida con token válido | Devuelve 200 | Correcto. `GET /clasify_api/auth/yo` → 200 con los datos del usuario |
| Petición protegida sin token | Devuelve 401 | Correcto. 401 `SIN_TOKEN` |
| Petición protegida con token inválido o caducado | Devuelve 401 | Correcto. Token falso → 401 `TOKEN_INVALIDO`; token firmado con `expiresIn: -10` → 401 `TOKEN_CADUCADO` |

### Tests automáticos

Con **Jest + Supertest** contra la API (base de datos de pruebas `clasify_test`):

- `tests/auth.test.js`, 15 pruebas repartidas en cuatro bloques:
  - `POST /clasify_api/auth/register` (7): registro válido (201 + token), el token recibido abre
    una ruta protegida (200), email duplicado (409) y cuatro validaciones con `test.each` (400)
    para email ausente, email inválido, nombre ausente y contraseña corta.
  - `POST /clasify_api/auth/login` (3): credenciales correctas (200 + token), contraseña
    incorrecta (401) y email inexistente (401).
  - `Middleware de autenticación` (3): ruta protegida sin token (401), con token inválido (401) y
    con un esquema distinto de `Bearer` (401).
  - `Formato de respuesta` (2): ruta inexistente (404) y `/clasify_api/salud` (200).

Resultado obtenido el 29/09/2026 con `npm test`: **15 pruebas, 15 correctas, 0 fallidas**, en 9,8 s.
Cobertura: 86,4 % de sentencias, 66,7 % de ramas, 88,9 % de funciones. Los ficheros peor cubiertos
son `middleware/errores.js` (45 %) y `ApiError.js` (86 %), porque los caminos internos de error no
se comprueban en la I1.

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: big-pickle
- Tipo: generación y revisión de código, con las decisiones de diseño y de alcance tomadas por el
  estudiante

### Uso realizado

La IA se usó por partes, no de una sola vez:

1. **Generación del código** de los 13 pasos del PLAN: `package.json` y scripts, `config.js`, pool
   de `mysql2`, `schema.sql`, `seed.sql`, `authService`, rutas de autenticación, middleware de
   tokens, validadores y los 15 tests.
2. **Revisión y depuración** durante la implementación. La IA localizó y corrigió cuatro fallos
   propios antes de dar la iteración por buena (ver *Correcciones manuales*).
3. **Documentación**: ayuda para redactar los ajustes de esta SPEC, la tabla de endpoints de
   `ARCHITECTURE.md`, el formato de respuesta y los códigos de error.

Lo que **no** hizo la IA: decidir el modelo de datos (ya estaba en `ARCHITECTURE.md` de la
iteración 0), crear el usuario y las bases de datos en MySQL, ni elegir el alcance de la iteración.

### Prompt importante 1

> "haz al I1, ves diciéndome cuando sea necesario poner algo en un documento y cuando vayas a hacer un
> commit para revisar"

Este prompt marca el ritmo de la iteración: la IA debía avisar antes de tocar la documentación y
antes de cada commit, y no decidir sola ni el contenido de los documentos ni lo que se commitea.

### Resultado

- 4 commits de código y configuración, 0 de documentación en el mismo commit.
- `npm test`: 15/15 correctas, 86,4 % de cobertura de sentencias.
- Los 13 casos del `TEST_PLAN` verificados sobre el servidor real, no solo con tests.
- 4 bugs encontrados y corregidos por la propia IA durante la iteración (ver abajo).
- Un contratiempo que no resolvió la IA: la creación del usuario de MySQL, que tuvo que hacer el
  estudiante a mano.

### Decisión del estudiante

Lo que se aceptó de lo propuesto por la IA:

- **El seed va en un script aparte** (`seed.sql`), no dentro de `schema.sql`.
- **Añadir `dotenv`** como dependencia, en vez de usar el cargador de `.env` nativo de Node, para no
  apartarse de la lista de dependencias del PLAN.
- **Mantener los dos usuarios de prueba en `seed.sql`**, aunque el hash bcrypt de `Clasify123!`
  quede versionado. Es cómodo para probar el login a mano y la base es local.
- **`GET /clasify_api/auth/yo` devuelve el email** del propio usuario, igual que hará `/usuarios/me`
  en la I2.

Lo que se cambió o rechazó:

- La contraseña de `DB_PASSWORD` se fijó a `Clasify123!` para coincidir con el usuario de MySQL que
  creó el estudiante, en vez de la aleatoria que proponía la IA. Consecuencia asumida: `DB_PASSWORD`
  y `SEED_PASSWORD` son la misma cadena. No afecta a la entrega porque `.env` no se versiona, pero
  conviene separarlas antes de desplegar.

### Correcciones manuales

Fallos encontrados y corregidos durante la implementación:

1. `app.js` se creó en una ruta con un error tipográfico (`4Carreria` en vez de `4Carrera`) y quedó
   fuera del repositorio. Los tests lo detectaron con `Cannot find module '../src/app'`.
2. `limpiarTablas()` ejecutaba `SET FOREIGN_KEY_CHECKS = 0` y los `TRUNCATE` con `pool.execute`, que
   toma conexiones distintas del pool. La instrucción de sesión no llegaba a la sesión del `TRUNCATE` y los
   tests fallaban con `Duplicate entry`. Corregido usando una conexión dedicada.
3. Se llamaba a `ApiError.noAutorado` cuando el método se llama `noAutorizado`. El `undefined`
   reventaba con 500 en vez de 401 en el login fallido. Lo detectaron los tests de login incorrecto.
4. Faltaba el script `db:create-databases` en `package.json`, así que `npm run` no lo encontraba.

Correcciones de estilo hechas sobre lo generado:

- Se unificó el mensaje del 404 a "No existe la ruta ..." (decía "no encontrado" y sonaba mal).
- Se añadió `servidor.closeIdleConnections()` al apagado, porque con conexiones *keep-alive* el
  servidor tardaba varios segundos en cerrar tras un SIGTERM.
- Se puso `quiet: true` en `dotenv.config()` para que no imprimiese su banner en la salida de los
  tests.

## COMMITS RELACIONADOS

- `9c02192` - `tarea(config): elimina los ficheros basura de macOS` (limpieza del repositorio, previa a la iteración)
- `0884172` - `tarea(config): inicializa el proyecto Node e instala dependencias`
- `92341d8` - `tarea(schema): crea el esquema y los datos iniciales`
- `6390ac2` - `añadir(auth): registro, login y middleware de tokens JWT`
- `bacaebd` - `probar(auth): añade los tests de autenticación`
- `f4a450d` - `documentar(docs): actualiza los resultados de I1`

Los pasos 1 a 3 del PLAN (repositorio git, `.gitignore` y estructura de carpetas) ya estaban
hechos en `9c02192` y en el commit inicial `302aad0`, antes de abrir la rama de la iteración.
