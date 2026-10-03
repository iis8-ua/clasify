# Iteración 01 - Autenticación y perfil (Supabase)

## SPEC

### Objetivo

Montar el proyecto Supabase y la capa de servicios de autenticación y perfil.

### Requisitos

Funcionales:

- `registro(email, password, nombre)` crea el usuario en Supabase Auth y su fila en `perfiles`.
- `login(email, password)` devuelve la sesión (JWT emitido por Supabase).
- `logout()` cierra la sesión.
- `perfil(usuarioId)` y `actualizarPerfil(datos)` gestionan el perfil del usuario autenticado.
- No se pueden registrar dos usuarios con el mismo email.

Técnicos:

- Proyecto Supabase en la nube y cliente `@supabase/supabase-js`.
- Variables de entorno en `.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) y `.env.example`.
- Políticas RLS en `perfiles` (lectura pública, edición solo del propio perfil).
- Los servicios encapsulan el API de Supabase; el cliente no lo usa directamente.

### Fuera de alcance

- Anuncios (iteración 02).
- Favoritos y mensajería (fuera del alcance de este backend).
- Frontend.

### Ajustes durante la iteración

1. **El nombre no se puede enviar en el `signUp`.** Este proyecto corre una versión de GoTrue que
   descarta las claves propias de `raw_user_meta_data` al registrarse: de los `data: { nombre }`
   solo llega `{ sub, email, email_verified, phone_verified }`. El trigger `trg_crear_perfil` lee el
   nombre de ahí, así que el perfil se creaba con el nombre vacío y `perfil()` devolvía `nombre: ""`.
   Comprobado contra el proyecto: `updateUser({ data })` sí guarda la clave, `signUp` no.
   **Arreglo:** `registro` hace el `signUp` y acto seguido llama a `actualizarPerfil` para poner el
   nombre. Siguen siendo dos llamadas a la API, pero el resultado de cara al usuario es el correcto.
2. **Firma de los servicios.** El token y el id del usuario se pasan por separado, en
   `{ token, usuarioId }`. La primera versión pasaba un solo argumento y lo usaba a la vez como
   credencial y como uuid en `.eq('id', ...)`; con un token en `.eq('id', token)` la escritura no
   tenía sentido.
3. **`actualizarPerfil` distingue "no existe" de "no tienes permiso".** Cuando RLS bloquea un
   `update`, no da error: no toca filas y `maybeSingle()` devuelve `null`. Devolver `null` era
   responder "no hay nada que actualizar" cuando el motivo real es que el perfil es de otro.
4. **`login` no devuelve el nombre.** Vive en `perfiles.nombre`, no en el JWT: por el punto 1 no
   viene en `user_metadata`, y aunque viniera el token lo dejaría congelado con el valor del momento
   en que se emitió. Quien lo necesite, `perfilService.perfil`.
5. **Configuración del proyecto.** El proveedor Email estaba desactivado, y con él el registro no
   existe. Además hace falta **"Confirm email" en OFF**: con la confirmación activada Supabase envía
   un correo y en el plan gratuito eso salta con `over_email_send_rate_limit`, y aunque no saltara
   el `signUp` no devolvería sesión.

## PLAN

1. Crear el proyecto en Supabase (nube) y las tablas `perfiles` y `categorias`.
2. Configurar RLS en `perfiles` y cargar las categorías iniciales.
3. Crear el proyecto Node con `@supabase/supabase-js` y el cliente de Supabase.
4. Implementar `src/services/authService.js` y `src/services/perfilService.js`.
5. Configurar `.env` / `.env.example`.
6. Escribir las pruebas con Jest sobre la capa de servicios.

### Revisión del estudiante

El diseño de auth se apoyaba en que el trigger de `perfiles` copiaba el nombre del registro, y eso
no funciona en la versión de GoTrue de este proyecto (ajuste 1). Se revisó que la fila la siga
creando el trigger y no el servicio, porque el servicio no tiene permiso de `INSERT` en `perfiles` y
no debe tenerlo: si lo tuviera, cualquier `authenticated` podría crear filas de perfil de otros.

También se revisó que el email no se expone. Va por dos puertas a la vez, y por eso hace falta las
dos: permisos de columna quitan el `SELECT` de `perfiles.email` a `anon` y a `authenticated`, y
además la proyección de las consultas (`id, nombre, biografia, created_at`) ni siquiera pide esa
columna. La RPC `mi_perfil_actual` es la única forma de leer el email propio, y al ser
`SECURITY DEFINER` con `p_id` comprobado contra `auth.uid()` no sirve para leer el de otro.

### Riesgos o dudas

- **Proyecto de pruebas y limpieza.** La clave publicable no tiene permiso para borrar usuarios de
  `auth.users`, así que probar contra el proyecto real deja datos. Se decidió usar **emails únicos
  por ejecución y no borrar nada**, meter una credencial de superusuario en los tests no compensa.
  Para vaciar el proyecto a mano: `npm run db:limpiar -- --confirmar`, que pide confirmación
  explícita justamente porque borra usuarios de verdad.
- **Límite de registros.** El plan gratuito limita los registros de auth por hora (unos 30). La
  primera versión de los tests creaba un usuario por test y se comía el límite a mitad con
  `Request rate limit reached`. Se redujeron a cinco usuarios compartidos por fichero, cada uno con
  un propósito (solo lectura, editable, con la sesión revocada y los dos de permisos cruzados). Una
  ejecución completa de la suite gasta once registros: cinco en este fichero, cuatro en
  `anuncios.test.js` y uno en `paridadConBackendPropio.test.js`, más el del email duplicado. Dan para
  dos o tres ejecuciones seguidas.
- **Límite de correos.** Con "Confirm email" activado, cada registro envía un correo. En plan
  gratuito eso salta antes que el propio registro.

### Verificación en base de datos

- Las tres tablas con RLS activo, ocho categorías con id 1–8.
- `anon` y `authenticated` sin permiso de `SELECT` sobre `perfiles.email`.
- `anon` sin permiso de `EXECUTE` sobre `mi_perfil` y `mi_perfil_actual`.
- Tras varias ejecuciones: 41 usuarios en `auth.users` y 41 filas en `perfiles`, o sea que el
  trigger crea exactamente un perfil por usuario y ninguno se queda fuera.

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `registro` con datos válidos | Crea el usuario y su perfil | Usuario `117c8dff…`, perfil con el nombre correcto |
| `registro` con email repetido | Devuelve error | `EMAIL_DUPLICADO` |
| `login` con credenciales correctas | Devuelve sesión y token | Token de 966 caracteres |
| `login` con contraseña incorrecta | Devuelve error | `CREDENCIALES_INVALIDAS` |
| `perfil(id)` | Devuelve los datos del perfil | Email y nombre correctos, vía `mi_perfil_actual` |
| `actualizarPerfil(datos)` | Actualiza solo el perfil propio | Biografía guardada y recortada |
| `logout()` | Cierra la sesión | `{ "cerrada": true }` |

### Tests automáticos

- `tests/auth.test.js`: registro, email duplicado, login correcto e incorrecto, `usuarioDelToken`,
  logout y lectura/escritura del perfil.
- `tests/lecturaPublica.test.js`: proyección pública del perfil y que no incluye el email.

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: big-pickle
- Tipo: IA asistente de programación

### Uso realizado

La IA propuso el esquema de las tablas, el trigger, las RPC, los servicios, los tests y la
migración. El estudiante revisó y decidió. Hay cinco cosas que hubo que corregir porque la IA no las
dio bien, y las cinco se encontraron probando contra el proyecto real:

1. **El trigger guardaba el nombre vacío** (ajuste 1). La IA diseñó el perfil creándose entero desde
   el trigger, leyendo el nombre de `raw_user_meta_data`, sin comprobar que ese proyecto guardara
   ahí las claves propias. Los tests.lo tapaban porque usaban el mismo `nombre` que devolvía el
   servicio, así que comparaban la respuesta consigo misma. Se cayó el test al comprobar en la base
   de datos que `raw_user_meta_data` solo tenía `sub`, `email` y los dos `*_verified`.
2. **`perfilService` usaba un argumento como dos cosas.** La firma era `actualizarPerfil(datos,
   usuarioId)` y dentro ese mismo valor se pasaba como token a `clienteConToken` y como uuid en
   `.eq('id', ...)`. Funcionaba en ningún caso. Se unificó en `{ token, usuarioId }`.
3. **`actualizarPerfil` devolvía `null` en vez de fallar** cuando RLS bloqueaba (ajuste 3). El test de
   "no deja editar el perfil de otro usuario" falló con "Received promise resolved instead of
   rejected".
4. **`getClaims()` sin argumento no validaba nada.** `usuarioDelToken` lo llamaba sin el token y se
   fiaba de la sesión guardada en el cliente, pero `clienteConToken` no guarda ninguna, solo pone la
   cabecera `Authorization`. Con cualquier token bueno daba error. Se le pasa el token explícito.
5. **La suite se comía el límite de registros.** Creaba un usuario por test. Ver riesgos.

Aparte, la IA propuso `perfilPublico(id)` para el autor de un anuncio, sin equivalente en el
spec. Se queda porque el anuncio necesita el nombre de su autor y no puede traer el email.

### Prompt importante 1

> Implementa la iteración de autenticación siguiendo el SPEC de
> `supabase-backend/docs/iterations/01-auth.md`. Antes de escribir código, decide y pregunta cualquier
> punto que sea dudoso: en concreto cómo se crea la fila de `perfiles` (si la inserta el servicio o
> el trigger), cómo se protege el email de los demás usuarios y cómo se limpian los datos que crean
> las pruebas, que van contra un proyecto real. Avisa antes de commitear y enséñame el reparto de
> commits.

### Resultado

- 126 tests en verde contra el proyecto real de Supabase, repartidos en seis ficheros. Los 21 que
  se añadieron después son de anuncios, al cerrar la paridad con el backend propio.
- Las siete comprobaciones manuales de la tabla se hicieron con un script contra el proyecto real,
  no solo con los tests.
- Se comprobó en base de datos que RLS está activo en las tres tablas, que el email está protegido a
  nivel de columna y que las RPC privadas no son ejecutables por `anon`.

### Decisión del estudiante

- **Los datos de las pruebas no se borran.** Se crean usuarios con email único y punto. Meter una
  credencial de superusuario en el código de test solo para dejar la base limpia no compensa, y el
  script `npm run db:limpiar` ya está para cuando haga falta.
- **Activar el proveedor Email del proyecto** para poder probar el registro, con "Confirm email" en
  OFF para que el `signUp` devuelva sesión y no dependa del correo.

### Correcciones manuales

- Migración aplicada con `npm run db:migrate` tras revisar los permisos de columna, que se
  escriben a mano y son fáciles de dejar mal.
- Verificación con `pg` de usuarios frente a perfiles para confirmar que el trigger no se deja
  ninguno sin crear.

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

> Los merges a `develop` (`8aeaef8` y `89e3f99`) no se listan, igual que en las
> iteraciones del backend propio. La convención de commits y el proceso de la
> iteración están en `CONTRIBUTING.md`.
>
> Los cuatro últimos son de una segunda vuelta que no estaba en el plan: al
> comparar los dos backends aparecieron diferencias de comportamiento, y su
> historia está en la sección "Segunda vuelta" del AI_LOG de la iteración 02.
