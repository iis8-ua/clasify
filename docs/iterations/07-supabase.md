# Iteración 07 - Segundo backend (Supabase)

## SPEC

### Objetivo

Desarrollar el segundo backend que pide el enunciado como requerimiento adicional: una capa de
servicios sobre Supabase, en un proyecto aparte, que aísle al cliente del API de la plataforma.

No es una API REST. El enunciado dice que el código cliente "no debería necesitar conocer que este
está implementado en Supabase", y para eso lo que se escribe son funciones JavaScript, no rutas. El
resultado es un `require` de cuatro servicios.

### Requisitos

Funcionales:

- Registro, login y logout con email y contraseña, con el token siendo un JWT.
- Perfil del usuario autenticado: el propio con su email, y el público de cualquiera sin el email.
- Editar el propio perfil, sin poder editar el de otro.
- Anuncios: crear, listar con búsqueda, filtro por categoría y paginación, obtener por id, editar y
  eliminar, con el autor y la categoría embebidos.
- Cambiar el estado de un anuncio entre `disponible` y `vendido`.
- Listado de categorías para los filtros.
- El listado es público: se puede leer sin sesión.

Técnicos:

- Las reglas de acceso se expresan con RLS en la base de datos, no en código. Que `anon` no pueda
  escribir un anuncio ajeno se cumple en Postgres, no porque el servicio se acuerde.
- Tres migraciones SQL, aplicadas por orden de nombre y de forma idempotente, con `pg` por la
  connection string del *session pooler*. Cada una se anota en `schema_migrations`, así que no se
  re-aplican: sin ese registro, la segunda ejecución fallaba en el `ADD COLUMN` de la 0001.
- Los servicios encapsulan todas las consultas: el cliente no llama a `supabase.from` directamente.
- Los errores de Supabase se traducen a un único tipo con código, mensaje y estado HTTP, y el texto
  de Postgres no sale hacia el consumidor: se queda en `errorOriginal`, que no es enumerable.
- La búsqueda se materializa en dos columnas y se indexa con trigramas de `pg_trgm`, en vez de
  llamar a `unaccent()` en el `WHERE`, que no usa ningún índice.
- Suite de Jest contra el proyecto real, sin dobles ni emuladores.

### Fuera de alcance

- **El CRUD del recurso secundario.** Favoritos, mensajería y valoraciones no se llevan aquí. En el
  enunciado está escrito que para el backend adicional "no es necesario CRUD sobre uno secundario, no
  os aportaría gran cosa pedagógicamente". Los favoritos son precisamente ese recurso secundario.
- Subida real de imágenes: el campo `imagen` guarda una URL o un nombre de fichero.
- Frontend, y también API REST: este backend son funciones, no endpoints.
- Lista negra de tokens. El logout llama a `signOut`, que revoca el refresh token, pero **no
  invalida el access token ya emitido**: los JWT son sin estado y siguen valiendo hasta que caducan.
  Es una limitación de la plataforma, no una decisión de diseño.

### Ajustes durante la iteración

1. **El perfil se crea con el nombre vacío.** La primera versión llevaba el nombre en
   `raw_user_meta_data` y confiaba en que el trigger lo copiara. Esta versión de GoTrue descarta las
   claves propias del metadata al registrarse, así que el nombre no llegaba nunca. Ahora `registro`
   hace el `signUp` y luego una segunda llamada que escribe el nombre en el perfil.
2. **`perfilService` usaba un argumento como dos cosas distintas**, a la vez credencial y uuid. Con
   un token en `.eq('id', token)` la escritura no tenía sentido. La firma pasó a ser
   `{ token, usuarioId }`.
3. **`actualizarPerfil` devolvía `null` en vez de fallar.** Cuando RLS bloquea un `update` no da
   error: no toca filas y `maybeSingle()` devuelve `null`, así que "el perfil es de otro" y "no hay
   nada que actualizar" eran la misma respuesta.
4. **`getClaims()` sin argumento no validaba el token.** Usa la sesión guardada en el cliente, y el
   cliente por token no guarda ninguna. Ahora se le pasa el token explícitamente.
5. **Los filtros se encadenaban sobre `from()`.** `eq`, `or`, `order` y `range` están en lo que
   devuelve `select()`, no en `from()`. Todos los listados fallaban.
6. **`listarPorAutor` ignoraba la paginación.** Aceptaba `pagina` y `limite` en un argumento aparte
   del de los filtros; al llamarla como se llama a `listar` los dos acababan dentro de los filtros y
   se ignoraban sin error, así que devolvía siempre la página de 20.

Los seis aparecieron al probar contra el proyecto real, no al leer el código.

### Dónde está el detalle

Este documento es el resumen de la I7 dentro de la secuencia del proyecto principal. El proceso de
desarrollo del subproyecto está en sus propios ficheros, que son la fuente y no este resumen:

- `supabase-backend/docs/PROJECT_SPEC.md`: qué se pide y qué queda fuera, y por qué el alcance da
  dos iteraciones de SDD en vez de siete.
- `supabase-backend/docs/ARCHITECTURE.md`: arquitectura, los seis comportamientos de Supabase que
  conviene conocer, y por qué la búsqueda se materializó en columnas.
- `supabase-backend/docs/AI_SUMMARY.md`: los seis fallos de la IA y las decisiones sobre lo que
  propuso.
- `supabase-backend/docs/iterations/01-auth.md` y `02-anuncios.md`: las dos iteraciones del
  subproyecto, con sus tablas de pruebas manuales y sus `COMMITS RELACIONADOS`.

## PLAN

1. Crear el proyecto en Supabase (nube) y activar el proveedor Email con **"Confirm email" en OFF**:
   con la confirmación activada, Supabase envía un correo y el plan gratuito salta por el límite de
   correos, y además el `signUp` no devolvería sesión.
2. Escribir `migrations/0001_inicial.sql`: tablas `perfiles`, `categorias` y `anuncios`, el trigger que
   crea el perfil al registrarse, las RPC `mi_perfil` y `mi_perfil_actual`, las siete políticas de
   RLS y las ocho categorías iniciales.
3. Montar el proyecto Node con `@supabase/supabase-js` y `pg`, y `src/db/migrar.js` para aplicar las
   migraciones con la connection string del *session pooler*.
4. Implementar `src/supabase/cliente.js` con dos clientes: uno compartido sin sesión para todo lo
   público, y uno por petición con la cabecera `Authorization`, porque el cliente guarda la sesión en
   memoria y compartirlo cruzaría los tokens de dos usuarios.
5. Implementar los servicios `authService`, `perfilService`, `anuncioService` y `categoriaService`,
   con el helper de paginación y el tradutor de errores.
6. Escribir las pruebas de Jest contra el proyecto real y hacer las comprobaciones manuales.
7. Documentar el subproyecto: `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `AI_SUMMARY.md` y sus dos
   iteraciones de SDD.
8. Comparar los dos backends uno detrás de otro y corregir las diferencias de comportamiento.

### Revisión del estudiante

Qué se revisó de lo que propuso la IA, porque varias cosas parecían bien y no lo eran:

- [x] Que el perfil lo creara entero el trigger leyendo `raw_user_meta_data`. Se revisó que la fila la
      siga creando el trigger y no el servicio, porque el servicio no debe tener permiso de `INSERT`
      en `perfiles`: si lo tuviera, cualquier `authenticated` podría crear filas de perfil de otros.
- [x] Que `login` devolviera el nombre. Se descartó: vive en `perfiles.nombre`, no en el JWT, y
      aunque viniera el token lo dejaría congelado con el valor del momento en que se emitió.
- [x] Se aceptó `perfilPublico(id)`, que no estaba en el enunciado, porque el anuncio necesita el
      nombre de su autor y no puede llevar el email.

### Riesgos o dudas

- Que lo que impide las escrituras ajenas sea RLS y no el servicio. Se comprobó directamente
  con `pg` que las siete políticas existen y que `anon` puede leer pero no escribir, en lugar de
  fiarse de que el código las crea.
- Que los tests escriban usuarios de verdad contra el proyecto real y no un doble, porque lo que hay que
  comprobar es precisamente que RLS bloquea. Un doble en memoria no pondría a prueba nada de eso.
- El límite de registros del plan gratuito, unas 30 por hora. La primera versión de la suite creaba un
  usuario por test y se comía el límite a mitad de ejecución. Ahora hay cinco usuarios compartidos por
  fichero, cada uno con un papel, y una ejecución completa gasta once registros: cinco en
  `auth.test.js`, cuatro en `anuncios.test.js` y uno en `paridadConBackendPropio.test.js`, más el del
  test de email duplicado.

## TEST_PLAN

### Pruebas manuales

Hechas con un script contra el proyecto real, en los dos ficheros de iteración del subproyecto
(`supabase-backend/docs/iterations/`). Aquí van las 14.

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `registro` con datos válidos | Crea el usuario y su perfil con el nombre | Usuario y perfil correctos, con el nombre puesto |
| `registro` con email repetido | Error explícito | `EMAIL_DUPLICADO` |
| `registro` sin nombre o con contraseña corta | Error antes de llamar a Supabase | `VALIDACION` |
| `login` con credenciales correctas | Sesión y token | Token y `usuario` correctos |
| `login` con contraseña incorrecta o email inexistente | Error sin filtrar cuál de los dos falló | `CREDENCIALES_INVALIDAS` |
| `perfil(id)` con token ajeno | Devuelve el perfil de quien llama | No devuelve el ajeno |
| `actualizarPerfil` sobre otro usuario | Rechaza la escritura | `SIN_PERMISOS` |
| `logout()` | Sin error | Sin error |
| Crear anuncio autenticado | Lo crea con autor y categoría | Correcto |
| Crear anuncio sin sesión | RLS lo bloquea | `SIN_PERMISOS` |
| Listado con `pagina` y `limite` | Trae la página pedida y el total | Correcto |
| Listado con `texto` y `categoria` | Filtra por los dos | Correcto |
| Editar o borrar anuncio de otro | RLS lo bloquea | `SIN_PERMISOS` |
| `listarCategorias` sin sesión | Catálogo completo | 8 categorías |

Además, se comprobó con `pg` que hay una fila en `perfiles` por cada usuario de `auth.users`, para
confirmar que el trigger no se deja ninguno sin crear.

### Tests automáticos

169 tests en 7 ficheros, todos contra el proyecto real de Supabase:

- `auth.test.js` (26): registro, login, logout, validación del token y perfiles, incluido el caso de que
  el access token siga siendo válido después de cerrar sesión.
- `anuncios.test.js` (28): escritura de anuncios, RLS entre usuarios, listado por autor y rechazo de
  ids que no son uuid.
- `errores.test.js` (26): traducción de los errores de Supabase y Postgres, y que su texto no se
  cuele hacia el consumidor.
- `lecturaPublica.test.js` (26): listado, detalle y categorías sin sesión, con la paginación del
  listado de categorías.
- `listado.test.js` (25): paginación, cálculo de páginas y escapado de comodines.
- `paridadConBackendPropio.test.js` (13): búsqueda con y sin acentos, filtro por estado y listado por
  autor, contra lo que hace el backend propio.
- `validacionAnuncio.test.js` (25): validaciones puras, sin red.

El que más valor ha sostenido fue `paridadConBackendPropio.test.js`, que es nuevo y a propósito:
los demás comprueban que cada cosa funcione, ese comprueba que se comporte como la del backend
propio, que es una comparación y no un requisito suelto.

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: big-pickle
- Tipo: (local / remoto) — asistente de programación en el repositorio

### Uso realizado

Planificación de las dos iteraciones del subproyecto (SPEC, PLAN y TEST_PLAN antes de escribir
código), la migración SQL, la capa de servicios, los tests y la documentación. Y después una segunda
vuelta que no estaba en el plan: comparar los dos backends y corregir lo que no coincidía.

### Prompt importante 1

> Implementa el segundo backend con Supabase como capa de servicios. Antes de escribir código decide
> y pregunta cualquier punto dudoso: de dónde sale el total de la paginación, cómo se distingue en el
> servicio entre "no existe" y "no tienes permiso" cuando RLS bloquea sin dar error, y qué tipo tiene
> el identificador. Avisa antes de commitear y enséñame el reparto de commits.

La pregunta del identificador iba con razón: los ids del backend propio son `INT`, y en Supabase el
autor tiene que ser el mismo identificador que da Auth, así que son `UUID`. Y la del total también:
en PostgREST el `count` de la respuesta de una página es el número de filas de esa página, no el
total, así que hace falta una segunda petición con `head: true`.

### Resultado

La estructura salió bien y rápida: la migración, el reparto de los servicios y el esqueleto de las
pruebas. Lo que no se sostuvo fue el comportamiento real de la plataforma. Seis veces dio por bueno
algo que no funcionaba, y las seis aparecen en "Ajustes durante la iteración".

También propuso usar `unaccent()` en el `WHERE` para buscar sin acentos, que no valía: la función
sobre la columna no usa índice, y PostgREST no deja escribir funciones dentro de `.or()`.

### Decisión del estudiante

- **Se descartó normalizar el texto en el cliente**, porque obligaría a traer todos los anuncios para
  filtrarlos en memoria.
- **Se aceptó materializar la búsqueda** en dos columnas que un trigger deja en minúsculas y sin
  acentos, indexadas. Duplica el texto, y en un proyecto con millones de filas habría que mirar otras
  cosas, pero para lo que hay aquí es la opción que aguanta.
- **Se normaliza también el término de búsqueda en JavaScript.** Al principio parecía innecesario:
  buscar sobre la columna ya normalizada arregla `electronica` y rompe `Electrónica`. La columna no
  se puede indexar si el otro lado no pasa por la misma normalización. Hace falta además una tabla
  aparte para las letras que `unaccent` convierte y Unicode no, como la `ñ`.
- **Se descartó meter una credencial de superusuario en el código de test** para poder borrar lo que
  se crea. Los tests usan emails únicos y no borran nada; para vaciar el proyecto está
  `npm run db:limpiar -- --confirmar`.

### Correcciones manuales

- Configuración del proyecto Supabase: creación, activación del proveedor Email y desactivación de
  "Confirm email".
- Revisión de los permisos de columna de `perfiles`, que son los que impiden leer el email de otros.
- Comprobación con `pg` de que existe una fila en `perfiles` por cada usuario de `auth.users`.
- Comprobación con `pg` de que las siete políticas de RLS existen y funcionan.
- Comparación de los dos backends y las correcciones que salieron de ahí.

## COMMITS RELACIONADOS

- `2e7f05e` - `tarea(supabase)`: migración inicial, proyecto Node y `.env.example`
- `71d8e40` - `añadir(supabase)`: capa de servicios de auth, perfil, anuncios y categorías
- `672b401` - `probar(supabase)`: 105 pruebas contra el proyecto real de Supabase
- `cfa45ec` - `documentar(supabase)`: arquitectura, iteraciones y puesta en marcha
- `1fb7ac3` - `documentar(docs)`: sitúa I7 en el README raíz y en el diseño
- `19d0285` - `documentar(docs)`: registra los commits de I7
- `e11ff80` - `añadir(supabase)`: listado por autor, filtro de estado y búsqueda sin acentos
- `4b0b424` - `añadir(supabase)`: quita variables de entorno de los tests que no se usaban
- `4ffa7fc` - `probar(supabase)`: 21 pruebas para la paridad con el backend propio
- `43b4e87` - `documentar(supabase)`: deja por escrito en qué se parecen los dos backends
- `debf423` - `documentar(supabase)`: completa el SDD de las dos iteraciones

Los merges a `develop` (`8aeaef8` y `89e3f99`) no se listan, igual que en el resto de iteraciones.

> La convención de commits y el proceso de la iteración están en `CONTRIBUTING.md`.
