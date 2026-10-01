# Iteración 05 - Mensajería (recurso secundario)

## SPEC

### Objetivo

Implementar la mensajería privada entre comprador y vendedor mediante la entidad `Conversacion`,
con envío y listado de mensajes y autorización por participante.

### Requisitos

Funcionales:

- `POST /anuncios/:id/mensajes` (JWT) inicia (o reutiliza) la conversación del usuario autenticado
  con el vendedor y envía el primer mensaje.
- `GET /anuncios/:id/mensajes` (JWT) devuelve los mensajes de la conversación del usuario
  autenticado (como comprador) con el vendedor de ese anuncio, de forma paginada.
- `GET /usuarios/me/conversaciones` (JWT) lista las conversaciones del usuario (como comprador o
  como vendedor) de forma paginada.
- `GET /conversaciones/:id/mensajes` (JWT) lista los mensajes de una conversación, solo si el
  usuario es participante.
- `POST /conversaciones/:id/mensajes` (JWT) envía un mensaje, solo si el usuario es participante.
- El vendedor no puede iniciar una conversación consigo mismo (400).
- Al listar, se marcan como leídos los mensajes del otro participante.

Técnicos:

- Restricción `UNIQUE (id_anuncio, id_comprador)` en `conversaciones`.
- Participante = autor del anuncio (vendedor) ∪ `id_comprador`.
- Códigos coherentes: 401 sin token, 403 si no es participante, 404 si no existe, 400 si es el
  vendedor intentando iniciar su propia conversación.
- Paginación según el formato común.

### Fuera de alcance

- Mensajería en tiempo real (WebSockets / SSE).
- Adjuntos e imágenes en los mensajes.
- Notificaciones push o por email.

### Ajustes durante la iteración

La SPEC fija el comportamiento pero deja muchas cosas sin decidir, y esas se preguntaron **antes**
de escribir código (está en *Decisión del estudiante*). Lo que salió de ahí, más lo que salió de la
revisión hecha al empezar:

- **Las rutas van repartidas por la URL, no en un `routes/mensajes.js`.** El PLAN pedía un fichero
  de rutas propio, pero hay tres URLs en dos recursos distintos, y el proyecto ya tiene repartido
  todo lo demás así: `routes/anuncios.js` es dueño de lo que cuelga de `/anuncios` y
  `routes/usuarios.js` de lo que cuelga de `/usuarios`. Como solo hay una URL que no cuelga de
  `/anuncios` ni de `/usuarios`, esa sí tiene fichero propio: `routes/conversaciones.js`.
- **`POST /anuncios/:id/mensajes` devuelve `datos.conversacion` y `datos.mensaje`**, con 201 si el
  hilo se acaba de abrir y 200 si ya existía. `POST /conversaciones/:id/mensajes` devuelve solo
  `datos.mensaje`: el hilo ya existe y el cliente lo pidió por su id, así que devolvérselo sería
  repetir lo que ya sabe.
- **`conversacion: { id }` en `GET /anuncios/:id`.** Para poder escribir el primer mensaje hace
  falta saber si el hilo ya está abierto, y sin eso el frontend tendría que escribir un mensaje para
  averiguarlo. Como el detalle es público, el token pasa a ser opcional: si viene y su usuario
  participa, se añade el campo; si no, el anuncio se sirve igual.
- **`?desde=inicio|final` en los dos listados de mensajes.** No está en la SPEC. Un hilo se lee del
  más antiguo al más nuevo, y con la paginación común quien entra en una conversación de 40 mensajes
  tiene que pedir la tercera página para ver lo último. `desde=final` invierte **por dónde se cuentan
  las páginas**, no el orden dentro de la página, que sigue siendo ascendente.
- **`ultimo_mensaje` y `no_leidos` en la bandeja.** Sin ellos el cliente tendría que abrir los
  hilos uno a uno solo para saber cuál tiene algo pendiente, que es justo lo que una bandeja de
  mensajes existe para evitar. El detalle del anuncio, en cambio, no lleva ningún contador: ahí lo
  que se quiere es saber si hay hilo, no cuántos mensajes lleva.
- **Un anuncio `vendido` bloquea la apertura de un hilo nuevo, no la escritura en uno ya abierto.**
  La SPEC no lo dice y la primera implementación lo aplicaba a las dos cosas, lo que producía un
  bug real (ver *Correcciones manuales* 1).
- **Revisión de las cuatro iteraciones anteriores antes de empezar**, de la que salieron el bug del
  token de un usuario borrado y una proyección reutilizable (ver *Correcciones manuales* 2 y 3).

## PLAN

1. Crear `src/services/conversacionService.js` para iniciar/reutilizar conversación y comprobar
   la participación.
2. Crear `src/services/mensajeService.js` con envío y listado paginado de mensajes.
3. Crear `src/routes/mensajes.js` con las rutas `/anuncios/:id/mensajes`,
   `/conversaciones/:id/mensajes` y `/usuarios/me/conversaciones`.
4. Implementar la autorización por participante (vendedor o comprador) en un único guard.
5. Marcar como leídos los mensajes del otro participante al listar.
6. Escribir las pruebas automáticas de la iteración.

### Revisión del estudiante

Qué hay que mirar de esta iteración:

- [x] `src/services/conversacionService.js`: **la idempotencia la decide la base de datos, igual que
      en los favoritos de la I4**:

      ```sql
      INSERT IGNORE INTO conversaciones (id_anuncio, id_comprador) VALUES (?, ?)
      ```

      Con `UNIQUE (id_anuncio, id_comprador)`, MySQL inserta la fila o la descarta, y `affectedRows`
      vale 1 o 0. La ruta lee ese valor y contesta 201 o 200. No se pregunta antes con un `SELECT`,
      porque eso dejaría una carrera entre dos peticiones simultáneas del mismo comprador sobre el
      mismo anuncio.

      Lo que **no** puede estar ocultando el `IGNORE` es otro error, y aquí hay que mirar con más
      cuidado que en la I4: `INSERT IGNORE` **se traga también los errores de clave foránea**, no solo
      la violación de la restricción `UNIQUE`. Si `id_anuncio` no existiera, el `INSERT` devolvería
      `affectedRows: 0` y la ruta leería "el hilo ya existía" en lugar de un 404. No puede pasar por
      dos razones, y las dos importan:

- `id_anuncio` sale de `validarId` y antes se ha comprobado que el anuncio existe (404).
   - `id_comprador` sale del token, y el token ya no puede ser de alguien borrado porque
     `autenticar` comprueba que el usuario existe (esto es nuevo de esta iteración; ver
     *Correcciones manuales* 2). Esta es la que faltaba: hasta entonces el `id_comprador` venía
     del token sin mirar la tabla, y el `INSERT IGNORE` se comía el error de clave foránea si el
     usuario ya no estaba.

      Se comprobó contra MySQL 8.0.46 que el hueco en los `id` es real, y se documentó en
      `ARCHITECTURE.md` en vez de dejarlo como sorpresa:

      ```text
      1 INSERT IGNORE correcto      -> affectedRows 1, id 1
      5 INSERT IGNORE descartados   -> affectedRows 0 los cinco
      1 INSERT IGNORE correcto      -> affectedRows 1, id 7   (¡no id 2!)
      ```

      MySQL consume un valor del `AUTO_INCREMENT` cada vez que descarta la fila. Los `id` no tienen
      que ser correlativos, pero un cliente no debe suponer `id + 1`.

- [x] `src/services/conversacionService.js`: **la autorización vive en un solo sitio**.
      `exigirParticipante` es el único punto que decide quién entra en un hilo, y devuelve 404 si la
      conversación no existe y 403 si existe pero el usuario no es participante, en ese orden. Las dos
      rutas de `/conversaciones/:id` pasan por ahí; `deComprador` es la variante para
      `/anuncios/:id/mensajes`, donde la comprobación es "soy el comprador de este anuncio", no
      "soy participante de este hilo".

      ```js
      if (conversacion.id_comprador !== idUsuario && conversacion.id_autor !== idUsuario) {
        throw ApiError.prohibido('Solo los participantes pueden ver esta conversación');
      }
      ```

- [x] `src/services/mensajeService.js`: **listar marca como leídos solo los del otro, y el contador
      sale del propio `UPDATE`**:

      ```sql
      UPDATE mensajes SET leido = 1 WHERE id_conversacion = ? AND id_emisor = ? AND leido = 0
      ```

      El `id_emisor` del `UPDATE` es el otro participante, no el que lista. Es lo contrario de lo
      intuitivo al escribir el código ("marcar lo que veo"), y es lo correcto: quien lista es quien
      lee, así que lo que se marca es lo que había pendiente de *otro*.

      `affectedRows` de ese `UPDATE` es el número que sale como `no_leidos` en la respuesta, porque
      MySQL devuelve las filas *cambiadas* y el `WHERE` lleva `leido = 0`, así que cambiadas y
      encontradas son las mismas. Por eso los mensajes del otro **de esta misma respuesta** ya
      aparecen con `leido: true`: es el estado en que quedan después de esta llamada, no el de antes.

- [x] `src/services/mensajeService.js`: **con `desde=final` hay que ajustar también cuántas filas se
      piden, no solo el `offset`**. Contadas desde el final, las páginas van hacia atrás y la última
      en llegar al principio puede quedar a medias:

      ```js
      const offset = desdeFinal ? Math.max(0, total - pagina * limite) : (pagina - 1) * limite;
      const registros = desdeFinal
        ? Math.min(limite, total - offset - (pagina - 1) * limite)
        : limite;
      ```

      Sin ese recorte, con 5 mensajes y `limite=2`, la tercera página devolvería M1 y M2, y M2 ya
      había salido en la segunda. Está verificado a mano contra el servidor real, no solo con los
      tests, y da `[M4 M5]`, `[M2 M3]`, `[M1]`.

- [x] `src/services/conversacionService.js`: **la bandeja ordena por última actividad y no por
      `conversaciones.fecha_creacion`**, que es lo que dictaría el nombre del recurso:

      ```sql
      ORDER BY ultimo_fecha DESC, ultimo_id DESC
      ```

      Un hilo al que se acaba de responder tiene que subir, aunque se abriera hace un mes. El `id`
      de desempate no es decorativo: `fecha` es un `TIMESTAMP` de segundos, así que dos mensajes del
      mismo segundo empatan y sin el `id` dos conversaciones saldrían en orden arbitrario entre
      peticiones. Las conversaciones sin ningún mensaje tienen `ultimo_fecha` a `NULL`, y en MySQL
      los `NULL` van al final en un `DESC`, así que aparecen al final de la bandeja, que es lo
      razonable. Hay un test que lo fija.

- [x] `src/services/conversacionService.js`: **la contraparte se calcula con un `CASE` en el SQL** y
      no con dos consultas:

      ```sql
      CASE WHEN c.id_comprador = ? THEN a.id_autor ELSE c.id_comprador END
      ```

      Es el mismo dato en la fila que se ve como comprador y en la que se ve como vendedor, y sale
      con `CAMPOS_PUBLICOS` de `usuarioService` como `contraparte_`: sin email ni `password_hash`,
      como el `autor` del detalle. Ojo con el orden de los parámetros del array: es el del `CASE` del
      `SELECT`, luego el del `JOIN`, luego los dos del `WHERE`, y al final `LIMIT` y `OFFSET`.

- [x] `src/helpers/proyecciones.js`: **`camposListadoAnuncio(tabla, alias)`** sustituye a la
      constante duplicada. La bandeja mete el anuncio dentro de un objeto `anuncio` y sus columnas
      pueden chocar con las de la conversación y las de la contraparte, así que hacen falta los dos
      modificadores a la vez:

      ```js
      camposListadoAnuncio('a.', 'anuncio_')  // -> a.id AS anuncio_id, a.titulo AS anuncio_titulo, ...
      camposListadoAnuncio('a.')              // -> a.id, a.titulo, ...
      ```

      Sigue sin poder importarse de `anuncioService`, porque `anuncioService` ya importa
      `usuarioService` y `conversacionService` importa los dos: el ciclo se rompería en tiempo de
      ejecución, no al importar. Es el mismo motivo por el que en la I4 las columnas se movieron a
      `helpers/`.

- [x] `src/routes/conversaciones.js`: **las dos rutas repiten `validarMensaje` / `validarDesde` /
      `leerPaginacion` antes de tocar la base de datos.** Un 400 por un `?desde=` inválido no puede
      haber marcado nada como leído, que es lo que se comprueba en el test.

      Ojo con el orden de comprobaciones de `GET /anuncios/:id/mensajes`: `deComprador` va antes de
      `validarDesde`, así que si lo pide el vendedor con un `?desde=` también inválido, el error que
      sale es el del vendedor (400 `campo: "anuncio"`), no el del parámetro. Es lo que se quiere: el
      papel de quien pregunta se comprueba antes que el formato de lo que pregunta.

### Riesgos o dudas

- Resuelto: si `GET /anuncios/:id/mensajes` lo pide el vendedor devuelve 400 con la ruta donde están
  las suyas.
- Resuelto: un anuncio `vendido` no admite hilos nuevos, pero sí mensajes en los que ya existen.
- Resuelto: qué sale en el `POST` de cada ruta (`datos.conversacion` + `datos.mensaje` en el del
  anuncio, solo `datos.mensaje` en el de la conversación).
- Resuelto: si `GET /anuncios/:id` necesita un token para decir si hay hilo. No: el token es
  opcional y solo cambia el detalle.
- Resuelto: la bandeja no marca nada como leído. Abrir la lista no puede vaciar los pendientes; solo
  abrir un hilo lo hace.
- Decidido y documentado: los `id` de `conversaciones` y de `favoritos` dejan huecos por el
  `INSERT IGNORE`. No es un defecto, pero hay que avisar a quien consume la API.
- Pendiente para más adelante: no hay forma de bloquear a un usuario ni de reportar un mensaje.
  Ninguna de las dos está en la SPEC.

## TEST_PLAN

### Pruebas manuales

Probadas el 01/10/2026 con el servidor arrancado (`npm start`, MySQL 8.0.46) y peticiones `curl`.
Los cuatro anuncios que dejó la I2 (ids 5 a 8) son de `ana@example.com` (que sale con el nombre
"Ana Editada" desde la I2), así que `carlos` hace de comprador y se creó un tercer usuario para el
papel de participante ajeno que necesitan varios de los casos.

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| Iniciar conversación en un anuncio ajeno | Devuelve 201 con el mensaje creado | Correcto. 201 con `conversacion` y `mensaje` de `id_conversacion` y `id_emisor` coherentes |
| Escribir dos veces en el mismo anuncio | Se reutiliza la misma conversación | Correcto. 201 y luego 200 con el mismo `id` de conversación y la misma `fecha_creacion` |
| Iniciar conversación sin token | Devuelve 401 | Correcto. 401 `SIN_TOKEN` |
| El vendedor intenta iniciar su propia conversación | Devuelve 400 | Correcto. 400 `VALIDACION` con `campo: "anuncio"` |
| El vendedor pide `GET /anuncios/:id/mensajes` | Devuelve 400 (debe usar `/usuarios/me/conversaciones`) | Correcto. 400 `VALIDACION` con `campo: "anuncio"` y el mensaje que le dice dónde están las suyas |
| Comprador lista los mensajes de su conversación | Devuelve 200 y marca como leído | Correcto. 200 con los del vendedor en `leido: true` y los suyos en `false`, y `no_leidos: 1` |
| Un tercer usuario intenta leer la conversación | Devuelve 403 | Correcto. 403 `SIN_PERMISOS` y sin `datos` en el cuerpo |
| Vendedor lista `GET /usuarios/me/conversaciones` | Incluye la conversación del comprador | Correcto. Sale el anuncio, la contraparte (`Carlos Díaz`), `ultimo_mensaje` y `no_leidos` |
| Enviar mensaje en una conversación ajena | Devuelve 403 | Correcto. 403 `SIN_PERMISOS` y no se escribe nada |
| Conversación inexistente | Devuelve 404 | Correcto. 404 `NO_ENCONTRADO` con "No existe la conversación 999" |

Los que salieron de la revisión y no estaban en la tabla:

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| Iniciar un hilo **nuevo** sobre un anuncio vendido | Devuelve 400 | Correcto. 400 `VALIDACION` con `campo: "estado"` |
| Escribir en un hilo ya abierto de un anuncio vendido | Las dos rutas dejan escribir | Correcto. `POST /anuncios/5/mensajes` da 200 y `POST /conversaciones/19/mensajes` da 201 sobre el mismo hilo. Antes de corregirlo el primero daba 400 |
| `?desde=final` con 5 mensajes y `limite=2` | La primera página trae los dos últimos, y se retrocede | Correcto. `[M4 M5]`, `[M2 M3]`, `[M1]`, y la cuarta vacía con `total: 5` |
| `?desde=final` con 5 mensajes, recorrida hacia delante | Vuelve a ser el hilo entero | Correcto. `[M1 M2]`, `[M3 M4]`, `[M5]`, y la cuarta vacía |
| `?desde=` inválido | Devuelve 400 en las dos rutas | Correcto. 400 `VALIDACION` con `campo: "desde"` en las dos, y sin marcar nada como leído |
| Texto de 1000 y de 1001 caracteres | 201 y 400 | Correcto. 201 con el de 1000 y 400 `VALIDACION` con `campo: "texto"` en el de 1001 |
| `POST` sin cuerpo | Devuelve 400, no un 500 | Correcto. 400 `VALIDACION` con `campo: "texto"` |
| Un usuario sin ninguna conversación con ese anuncio | Hilo vacío, no un error | Correcto. 200 con `datos: []` y `total: 0` |
| `conversacion` en `GET /anuncios/:id` con el token del comprador | Devuelve el `id` del hilo | Correcto. `{"id": 2}`, solo el id |
| Lo mismo sin token, o con el token de alguien que no participa | No añade el campo | Correcto. El anuncio se sirve 200 y `conversacion` no aparece |
| Lo mismo con un token inválido | No es un error | Correcto. 200 con el anuncio, como anónimo |
| Token de un usuario borrado en rutas de mensajería | 401 en todas | Correcto. 401 `USUARIO_NO_EXISTE` en las cinco |
| Borrar un anuncio con una conversación | Se llevan la conversación y sus mensajes | Correcto. `DELETE /anuncios/5` da 204 y las dos tablas quedan a 0 filas |
| La bandeja no marca nada como leído | `no_leidos` no baja al listar | Correcto. Dos listados seguidos dan el mismo `no_leidos` y el `leido` en la base sigue a 0 |

Se comprobaron también los casos de la I4 y de la I3 que tocaban rutas modificadas: el alta y la
baja de favoritos (201/200/400/401/204/404), el listado de anuncios con filtros y paginación, el
perfil propio y el público, `/auth/yo` con un token que no verifica, la subida de una imagen con
`multipart/form-data` y el borrado del fichero huérfano tanto en el 400 por una errata como en el
403 de editar el anuncio de otro. Todo sigue igual que antes de la I5.

Al terminar se borraron las conversaciones y los mensajes de prueba, el usuario creado para las
pruebas, la imagen de prueba y se devolvieron los anuncios a `disponible`, así que la base de
desarrollo queda con sus tres usuarios, sus ocho categorías y los cuatro anuncios de la I2, con las
tablas `favoritos`, `conversaciones` y `mensajes` vacías y `uploads/` sin ficheros.

### Tests automáticos

- `tests/mensajeria.test.js`, **58 pruebas**:
  - **`POST /anuncios/:id/mensajes`**: 401 sin token, 201 con conversación y mensaje, 200 al repetir
    sobre el mismo anuncio, el texto se guarda recortado, 400 `campo: "anuncio"` sobre el propio
    anuncio, 400 `campo: "estado"` sobre un vendido sin hilo, 200 si el hilo del vendido ya existía
    (y 201 por la otra ruta sobre el mismo hilo), 404 de anuncio inexistente, 400 sin cuerpo, 400 con
    texto vacío comprobando que no se crea la conversación, 400 sin el campo `texto`, y el límite de
    1000 caracteres con 1000 acepta y 1001 rechaza.
  - **`GET /anuncios/:id/mensajes`**: 401 sin token, 200 con lista vacía si no hay hilo, el hilo del
    más antiguo al más nuevo, que se marcan los del vendedor y no los propios, que lo ya leído no
    cuenta como pendiente, que cada comprador tiene su hilo, que el vendedor recibe 400, 404 de
    anuncio inexistente, 200 vacío para un usuario sin conversación con ese anuncio, página fuera de
    rango con el `total` real, y 400 de `limite` fuera de rango.
  - **`POST /conversaciones/:id/mensajes`**: 401 sin token, 201 del vendedor con solo el mensaje,
    201 del comprador, 403 de quien no participa comprobando que no escribe, 404 de conversación
    inexistente, 400 de id no numérico y 400 de texto vacío.
  - **`GET /conversaciones/:id/mensajes`**: 401 sin token, el hilo del comprador marcando lo del
    vendedor, 403 de quien no participa sin ver el contenido, 404 de conversación inexistente.
  - **`?desde`**: las siete pruebas de `inicio` y `final` (incluida la última página a medias con 5
    mensajes y `limite=2`), que funciona igual en la ruta de la conversación, y que las dos rutas
    rechazan un `?desde` inválido sin marcar nada como leído.
  - **`GET /usuarios/me/conversaciones`**: 401 sin token, la fila completa con anuncio, contraparte,
    último mensaje y pendientes, que la contraparte se invierte según se mire como comprador o como
    vendedor, que se ven las compradas y las vendidas sin duplicar ni mezclar, que cuenta pendientes
    y no marca, el orden por última actividad, la conversación sin mensajes al final con
    `ultimo_mensaje: null`, y la paginación.
  - **`conversacion` en el detalle del anuncio**: sin token, con el token del comprador, con el del
    vendedor que es comprador de ese anuncio, con el del vendedor sin hilo, con el de un no
    participante, con un token inválido, con un token de un usuario borrado, y que el resto del
    detalle no cambia.
- `tests/auth.test.js`, **10 pruebas nuevas** sobre el token de un usuario borrado: un `test.each`
  de nueve rutas protegidas que ahora devuelven 401 `USUARIO_NO_EXISTE` en lugar de fallar cada una
  de su manera, y que el mismo token vuelve a valer en cuanto el usuario reaparece en la base.

Igual que en `anuncios.test.js` y en `favoritos.test.js`, los usuarios se insertan por SQL y los
tokens se firman con `firmarToken` en lugar de registrarse en cada prueba: `bcrypt` con coste 12 son
unos 300 ms por llamada.

Resultado obtenido el 01/10/2026 con `npm test`: **234 pruebas, 234 correctas, 0 fallidas** (16 de
`auth.test.js`, 33 de `usuarios.test.js`, 88 de `anuncios.test.js`, 29 de `favoritos.test.js`, 58 de
`mensajeria.test.js`). Cobertura: 97,1 % de sentencias, 85,6 % de ramas y 99,2 % de funciones, desde el
96,1 % de la I4. Los dos ficheros nuevos, `conversacionService.js` y `mensajeService.js`, quedan al
100 % de sentencias y de funciones. `errores.js` sigue siendo el peor con 45,5 %, y es a propósito:
sus tres caminos internos quedan para la I6, tal y como ya apuntaba el documento de la I3.

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: big-pickle
- Tipo: generación y revisión de código, con las decisiones de diseño y de alcance tomadas por el
  estudiante, y una revisión previa de las cuatro iteraciones anteriores.

### Uso realizado

La IA se usó por partes, no de una sola vez:

1. **Revisión de lo hecho antes de empezar.** Antes de escribir nada de la I5 se revisaron las
   cuatro iteraciones juntas y se ejecutaron los 166 tests que había. Salieron dos cosas: un bug real
   de tokens de usuarios borrados y una proyección que iba a hacer falta reutilizar.
2. **Preguntas antes de escribir código**: la IA leyó `05-mensajeria.md`, `ARCHITECTURE.md` y el
   esquema, localizó lo que la SPEC dejaba abierto y preguntó en vez de elegir.
3. **Generación del código**: `services/conversacionService.js`, `services/mensajeService.js`,
   `routes/conversaciones.js`, las dos rutas nuevas de `routes/anuncios.js`, la de
   `routes/usuarios.js`, el `autenticarSiHayToken` del middleware, las dos validaciones nuevas y los
   tests de `mensajeria.test.js`.
4. **Corrección durante la implementación**: se ajustaron las expectativas de los tests al detectar
   que `GET /anuncios/:id/mensajes` comprueba el papel de quien pregunta antes que `?desde=`, y se
   añadió la prueba que fija ese orden.
5. **Revisión al terminar, antes de los commits**: se revisó todo lo elaborado, se probó la API a
   mano con `curl` y se encontró el bug del anuncio vendido que se cuenta en *Correcciones
   manuales* 1. También se comprobó contra MySQL 8.0.46 que el `INSERT IGNORE` consume valores del
   `AUTO_INCREMENT`, y se añadió esa nota a `ARCHITECTURE.md`.

Lo que **no** hizo la IA: decidir dónde viven las rutas, qué devuelve el cuerpo de cada `POST`, si el
detalle del anuncio lleva token, qué pasa con los anuncios vendidos, qué recibe la bandeja ni qué
significa `?desde=`. Esas las decidió el estudiante tras ver las opciones. Tampoco decidió qué
arreglar de la revisión previa: preguntó, y el estudiante pidió arreglarlo en la I5 en lugar de
dejarlo para el final.

### Prompt importante 1

> "ayer nos quedamos en medio de la iteración 5, mira por donde nos quedamos y si tienes dudas me
> preguntas, al igual que antes de hacer los commits, analiza todo lo elaborado y mira que funcione
> todo antes de seguir"

Es el mismo prompt que el de la I4 y el de la I3, palabra por palabra casi: la revisión previa a la
iteración **no es un trámite**. De la de la I4 salió el bug de los ficheros huérfanos en `uploads/`
que 133 pruebas no veían, y de la de esta salió el bug de las dos rutas de escritura, que 230 tests
no cazaban porque ninguno combinaba "hilo ya abierto" con "anuncio ya vendido". Ninguno de los dos
se habría encontrado leyendo el código: hacen falta ejecutar la API y probarla.

### Resultado

- 234 pruebas, 234 correctas, con 68 nuevas de esta iteración.
- `npm test -- --coverage`: 97,07 % de sentencias, 85,59 % de ramas, 99,15 % de funciones y
  97,06 % de líneas.
- Los 24 casos del `TEST_PLAN` verificados sobre el servidor real con `curl`, no solo con los tests.
- Los casos manuales de la I3 y de la I4 que tocaban rutas modificadas vuelven a pasar.
- El bug de los dos caminos de escritura dando respuestas distintas, arreglado y con un test de
  regresión que se comprobó que falla sin el arreglo.
- El token de un usuario borrado, arreglado en el middleware y con 10 tests que fallan sin él.
- La base de desarrollo y `uploads/` dejadas como estaban.

### Decisión del estudiante

Lo que se aceptó de lo propuesto por la IA:

- **Las rutas repartidas por la URL**: `/anuncios/:id/mensajes` en `routes/anuncios.js`,
  `/conversaciones/:id/mensajes` en el nuevo `routes/conversaciones.js` y la bandeja en
  `routes/usuarios.js`, en vez del `routes/mensajes.js` que pedía el PLAN.
- **`datos.conversacion` y `datos.mensaje` en el `POST` del anuncio, solo `datos.mensaje` en el de la
  conversación.**
- **`conversacion: { id }` en el detalle del anuncio, con el token opcional.** La ruta pública no
  pasa a exigir token, y un token que no verifica no la convierte en un 401.
- **`?desde=inicio|final`**, con el orden dentro de la página siempre ascendente.
- **La bandeja no marca nada como leído**, y el listado de un hilo sí, marcando solo lo del otro.
- **`no_leidos` y `ultimo_mensaje` en la bandeja**, y orden por última actividad.
- **Un anuncio `vendido` bloquea solo la apertura de un hilo nuevo**, no la escritura en uno que ya
  existe, para que las dos rutas de escritura no se contradigan.
- **Arreglar en la I5 lo que salió de la revisión**, y no dejarlo para el final: el token de un
  usuario borrado y la proyección reutilizable.

Lo que se cambió o rechazó de lo generado:

- El bloqueo de `vendido` se aplicaba también al hilo ya abierto. Se probó contra el servidor real
  y se vio que `POST /anuncios/:id/mensajes` daba 400 mientras `POST /conversaciones/:id/mensajes`
  daba 201 sobre el mismo hilo, con el mismo usuario. Se corrigió para que el 400 sea solo del hilo
  nuevo.
- El mensaje de error decía "No se puede iniciar una conversación sobre un anuncio vendido" incluso
  cuando la conversación ya existía. Ese camino ya no existe, pero el mensaje se dejó como estaba
  porque ahora solo se llega a él cuando de verdad se va a iniciar una.
- No se añade `num_favoritos` ni nada parecido a la conversación en el listado de mensajes: es un
  recurso secundario y el contador es información del anuncio, no del hilo.
- No se añadió un filtro por estado al listado de conversaciones. Que un hilo sea de un anuncio
  vendido es información, igual que en los favoritos de la I4.
- La cobertura de los caminos internos de `errores.js` se dejó para la I6, tal y como ya estaba
  apuntado en el documento de la I3, en lugar de resolverla de paso.
- Los huecos en los `id` que deja el `INSERT IGNORE` se documentaron en lugar de cambiar el
  mecanismo, que viene de la I4 y ya estaba aceptado.

### Correcciones manuales

1. **Las dos rutas de escritura daban respuestas distintas para lo mismo.** El bloqueo de anuncio
   `vendido` estaba en `iniciar`, antes del `INSERT IGNORE`, así que se aplicaba también cuando el
   hilo ya existía. Se reprodujo contra el servidor real:

   ```text
   POST /anuncios/8/mensajes          -> 400  "No se puede iniciar una conversación sobre un anuncio vendido"
   POST /conversaciones/9/mensajes    -> 201  (el hilo sigue vivo)
   ```

   El segundo caso era con el mismo usuario y sobre el mismo hilo, abierto cuando el anuncio todavía
   estaba disponible. El 400 no impedía nada (la otra ruta lo esquivaba) y el mensaje mentía, porque
   la conversación no se estaba iniciando.

   El arreglo es que el `vendido` solo bloquee cuando el hilo **todavía no existe**:

   ```js
   const previa = await consultarConversacion(idAnuncio, idComprador);

   if (previa.length === 0 && anuncio.estado === 'vendido') {
     throw ApiError.validacion('No se puede iniciar una conversación sobre un anuncio vendido', 'estado');
   }
   ```

   El `SELECT` previo decide solo esa política, nunca el código de la respuesta: el 201 y el 200 los
   sigue decidiendo `affectedRows` del `INSERT IGNORE`. La única ventana que abre es que el vendedor
   marque el anuncio como vendido entre las dos consultas, y en ese caso se abre un hilo sobre un
   anuncio recién cerrado, que es un problema mucho menor que dejar al comprador sin poder escribir.

   De paso, `deComprador` tenía su propia copia del `SELECT` del hilo, con el mismo `JOIN` a
   `anuncios`. Las dos rutas de escritura y de lectura ahora comparten `consultarConversacion`, que
siempre trae el `id_autor` del vendedor; `iniciar` lo descarta. La prueba del hilo vendido se
comprobó quitando el arreglo y falla sin él.

2. **El token de un usuario borrado.** Un JWT verifica la firma, no que su usuario siga en la base de
   datos, y el token vive 7 días. Si se borraba el usuario y se guardaba su token, cada ruta
   protegida se equivocaba a su manera. Se comprobó contra el servidor real quitando la comprobación
   del middleware (es decir, en el estado en que estaba antes de arreglarse) y pidiendo las rutas
   protegidas con un token de un usuario ya borrado:

   ```text
   GET  /auth/yo                -> 500  TypeError: Cannot read properties of null (reading 'id')
   GET  /usuarios/me            -> 200  {"datos":{"usuario":null}}
   GET  /usuarios/me/anuncios   -> 500  TypeError: Cannot read properties of null (reading 'id')
   POST /anuncios               -> 500  ER_NO_REFERENCED_ROW_2 (clave foránea fk_anuncios_autor)
   GET  /usuarios/me/favoritos  -> 200  {"datos":[], "paginacion":{...}}
   GET  /usuarios/me/conversaciones -> 200  {"datos":[], "paginacion":{...}}
   PATCH /anuncios/5            -> 403  (aquí sí, pero por casualidad: el anuncio es de otro)
   ```

   Los tres 500 son lo grave. Un 500 es lo que se ve cuando algo se rompe de verdad, así que un
   cliente no puede ni distinguirlo de un fallo suyo ni reintentar, y encima el detalle real solo
   queda en el log del servidor. Los dos 200 con `usuario: null` o con la lista vacía son peor en
   cierto sentido: son respuestas **correctas** que no dicen la verdad, y un frontend que confíe en
   ellas pinta un perfil vacío o un carrito vacío en lugar de echar a la sesión.

   El arreglo va en el middleware `autenticar`, no en las rutas: si el usuario del token no existe,
   401 `USUARIO_NO_EXISTE`. Cada ruta protegida lo tiene gratis, y las que lo comprobaban por su
   cuenta ya no lo hacen. `/auth/yo` es la única que lo hacía, y se le quitó esa comprobación con
   un comentario que explica que ya no hace falta.

   De paso, para el detalle del anuncio hacía falta lo mismo pero sin fallar: `autenticarSiHayToken`
   hace la misma comprobación y, si el usuario no existe o el token no verifica, **borra**
   `req.usuario` y deja seguir la petición como anónima. Un token ausente, con otro esquema,
   inválido, caducado o de un usuario borrado se ignoran; solo se acepta uno que verifique contra
   nuestro secreto **y** con un usuario en la base. Que las dos cosas hagan falta no es casualidad:
   un token de otro origen no puede firmarse contra nuestro secreto, pero uno nuestro de hace una
   semana sí puede ser de alguien que ya no existe.

   Esto importa también para el `INSERT IGNORE` de `conversaciones`, que se traga los errores de
   clave foránea: con `autenticar` comprobando que el usuario existe, no hay forma de que
   `id_comprador` sea de alguien que no está en la tabla.

   Con diez pruebas: un `test.each` de nueve rutas y otra de que el mismo token vuelve a valer en
   cuanto el usuario reaparece.

3. **Una proyección reutilizable para la bandeja.** `camposListadoAnuncio` sustituye a la
   constante `CAMPOS_LISTADO_ANUNCIO_ALIAS`, que estaba escrita a mano con el prefijo `a.`. La
   bandeja necesita las mismas siete columnas **y** un alias, porque el anuncio va envuelto en un
   objeto y sus columnas chocarían con las de la conversación y la contraparte:

   ```js
   const CAMPOS_ANUNCIO = camposListadoAnuncio('a.', 'anuncio_');
   ```

   Sigue sin poder importarse de `anuncioService`, por el ciclo que ya se explicó en la I4:
   `conversacionService` importa los dos servicios, así que sacarla de cualquiera de los dos la
   dejaría igual de imposible.

## COMMITS RELACIONADOS

- `981fb97` refactor(anuncios): proyecta los listados con sufijo configurable
- `243e752` corregir(auth): rechaza el token de un usuario que ya no existe
- `c414fe6` añadir(mensajería): conversaciones y mensajes entre comprador y vendedor
- `2a4b21f` probar(auth): 10 tests del token de un usuario borrado
- `9139676` probar(mensajería): 58 tests de conversaciones, mensajes y bandeja
- `d2a3499` documentar(docs): mensaje, filtros y permisos de la I5