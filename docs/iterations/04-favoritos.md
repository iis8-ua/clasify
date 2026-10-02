# Iteración 04 - Favoritos (recurso secundario)

## SPEC

### Objetivo

Implementar los favoritos como recurso secundario: listar los anuncios guardados por el usuario y
añadir/quitar favoritos sin duplicados.

### Requisitos

Funcionales:

- `POST /anuncios/:id/favorito` (JWT) añade el anuncio a los favoritos del usuario autenticado.
  Es idempotente: **201** si es nuevo y **200** si ya estaba; nunca duplica.
- `DELETE /anuncios/:id/favorito` (JWT) quita el anuncio de los favoritos del usuario.
- `GET /usuarios/me/favoritos` (JWT) lista los favoritos del usuario de forma paginada.
- Un usuario no puede marcar como favorito su propio anuncio (400).
- Un usuario no puede ver ni modificar los favoritos de otro.

Técnicos:

- Restricción `UNIQUE (id_usuario, id_anuncio)` en la tabla `favoritos`.
- Las operaciones de escritura requieren JWT y comprueban que el anuncio exista (404 si no).
- Respuestas coherentes: 201/200 en el alta (nuevo/ya existía), 204 al quitar, formato paginado
  en el listado.

### Fuera de alcance

- Notificaciones al vendedor cuando alguien guarda su anuncio.
- Listas o carpetas de favoritos.

### Ajustes durante la iteración

La SPEC fijaba el comportamiento pero no la forma de las respuestas ni dónde vive cada ruta. Eso se
preguntó antes de escribir código y está en *Decisión del estudiante*:

- **Las rutas van repartidas según la URL, no en un `routes/favoritos.js`.** El PLAN pedía un
  fichero de rutas propio, pero `POST /anuncios/:id/favorito` cuelga de un anuncio y
  `GET /usuarios/me/favoritos` cuelga del usuario, que es como ya está repartido el resto del
  proyecto: `routes/anuncios.js` es dueño de todo lo que hay bajo `/anuncios` y `routes/usuarios.js`
  de todo lo que hay bajo `/usuarios`. Un mismo router montado bajo dos prefijos distintos se
  entiende peor que dos ficheros que ya existen.
- **El `POST` devuelve el favorito creado en los dos casos**, con la misma forma:
  `{"datos": {"favorito": {"id", "fecha", "id_anuncio", "id_usuario"}}}`. El 201 y el 200 lo
  distinguen, y el cliente puede pintar la respuesta sin una segunda llamada.
- **El 400 de marcar tu propio anuncio es `VALIDACION` con `campo: "anuncio"`.** No hace falta un
  código nuevo en el catálogo para una regla que es, de hecho, una validación del campo `anuncio`.
- **El listado devuelve el resumen ligero de los anuncios, con los vendidos dentro y ordenados por
  la fecha en que se guardaron**, no por la del anuncio. Es el mismo formato que `GET /anuncios` y
  que `GET /usuarios/:id/anuncios`, para que el frontend tenga un solo caso que aprender. Si
  alguien guardó algo y luego se vendió, quiere saber que lo tenía guardado.

Antes de empezar la I4 se hizo una revisión de las tres iteraciones anteriores, y de ella salieron
tres arreglos que también se cuentan en *Correcciones manuales*.

## PLAN

1. Crear `src/services/favoritoService.js` con alta, baja y listado paginado de favoritos.
2. Añadir `POST /anuncios/:id/favorito` y `DELETE /anuncios/:id/favorito` a `src/routes/anuncios.js`,
   y `GET /usuarios/me/favoritos` a `src/routes/usuarios.js`.
3. Implementar la idempotencia del alta con un `INSERT IGNORE` que se apoya en la restricción
   `UNIQUE` del esquema, distinguiendo 201 de 200 con `affectedRows`.
4. Añadir la comprobación del anuncio (404) y del propio anuncio (400).
5. Validar que el listado respeta la paginación común.
6. Escribir las pruebas automáticas de la iteración.

### Revisión del estudiante

Qué hay que mirar de esta iteración:

- [x] `src/services/favoritoService.js`: **la idempotencia se decide en la base de datos, no
      preguntando antes**:

      ```sql
      INSERT IGNORE INTO favoritos (id_usuario, id_anuncio) VALUES (?, ?)
      ```

      Con la restricción `UNIQUE (id_usuario, id_anuncio)` del esquema, MySQL inserta la fila o la
      descarta, y `affectedRows` vale 1 o 0. La ruta lee ese valor y contesta 201 o 200. Se
      comprobó contra MySQL 8.0.46 que las tres formas habituales de hacerlo dan números distintos,
      y por eso se eligió esta:

      ```text
      ON DUPLICATE KEY UPDATE id = id                    nuevo: affectedRows 1  insertId 3
                                                          repetido: affectedRows 1  insertId 0
      ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)    ambos: affectedRows 1
      INSERT IGNORE                                      nuevo: affectedRows 1  repetido: affectedRows 0
      ```

      Solo `INSERT IGNORE` separa los dos casos con `affectedRows`, que es lo que hace falta para
      distinguir el 201 del 200. Aquí no puede estar ocultando otro error, porque antes se ha
      comprobado que el anuncio existe y el usuario sale del token verificado, así que ninguna
      clave foránea puede fallar. La alternativa de preguntar antes con un `SELECT` dejaría una
      carrera entre dos peticiones simultáneas.

- [x] `src/services/favoritoService.js`: **al repetir no cambia la fecha**. `INSERT IGNORE` deja la
      fila como estaba, así que la fecha es la de la primera vez que se guardó, que es lo que
      responde a la pregunta que se hace un usuario ("¿cuándo lo guardé?"). Con
      `ON DUPLICATE KEY UPDATE fecha = NOW()`, en cambio, un usuario que pulsara dos veces el botón
      de guardar vería cambiarle la fecha sin motivo.

- [x] `src/services/favoritoService.js`: **el `DELETE` va filtrado por `id_usuario`**, no borra la
      fila que encuentre:

      ```sql
      DELETE FROM favoritos WHERE id_usuario = ? AND id_anuncio = ?
      ```

      Es lo que hace que un usuario no pueda quitarle un favorito a otro aunque conozca el id del
      anuncio: si la fila es de otro, `affectedRows` vale 0 y sale 404.

- [x] `src/services/favoritoService.js`: **el listado reutiliza la proyección de los anuncios**,
      que vive en `src/helpers/proyecciones.js`, en vez de escribir las columnas otra vez. Este es el
      punto que salió de la revisión previa: `usuarioService` y `anuncioService` tenían cada uno su
      propia copia de las mismas siete columnas, y con esta iteración el mismo listado tendría que
      escribirlas por tercera vez. Lo que no se puede hacer es importarlas de `anuncioService`
      desde `usuarioService`, porque `anuncioService` ya importa `usuarioService` y saldría un ciclo
      de `require` que rompería en tiempo de ejecución, no al importar.

      ```js
      const CAMPOS_LISTADO_ANUNCIO =
        'id, titulo, precio, estado, imagen, fecha_creacion, id_categoria';
      ```

      Y por el mismo motivo la configuración de las imágenes se mudó de `middleware/subidaImagen.js`
      a `src/config.js`: un servicio no debería tener que importar un middleware para saber dónde
      está la carpeta de `uploads/`.

- [x] `src/routes/usuarios.js`: **`/me/favoritos` va antes que `/:id`**, siguiendo el mismo criterio
      que el resto de rutas con "me" del fichero. En este caso el orden no importaría, porque
      `/:id` solo casa con un segmento y `/usuarios/2/favoritos` tiene dos, pero mantener el criterio
      evita tener que pensarlo cada vez que se añada una ruta.

- [x] `num_favoritos` del detalle **ya lo calculaba el detalle desde la I3** con un `COUNT` sobre
      `favoritos`. Esta iteración solo ha tenido que comprobar que sube y baja con las altas y las
      bajas, que es lo que hacen los dos últimos tests de `favoritos.test.js`.

### Riesgos o dudas

- Resuelto: el alta devuelve 201 la primera vez y 200 si ya estaba.
- Resuelto: qué se devuelve en el cuerpo del alta y con qué código se rechaza marcar el propio
  anuncio (ver *Decisión del estudiante*).
- Resuelto: el `DELETE` de un favorito inexistente devuelve 404, tal como fija el `TEST_PLAN` de la
  SPEC, y no 204. Es una decisión poco habitual en un `DELETE` (lo idiomático sería que la segunda
  vez también saliera 204 y fuese igualmente idempotente), pero está escrita en el documento de
  requisitos y se ha respetado en lugar de cambiarla por gusto.
- Pendiente para más adelante: no hay forma de cambiar el orden de la lista de favoritos ni de
  guardar notas sobre un anuncio guardado. Ninguna de las dos está en la SPEC.

## TEST_PLAN

### Pruebas manuales

Probadas el 30/09/2026 con el servidor arrancado (`npm start`, MySQL 8.0.46) y peticiones `curl`.
Los cuatro anuncios que dejó la I2 (ids 5 a 8) son de `ana@example.com`, así que `carlos` hace de
otro usuario y `ana` de autora.

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| Añadir a favoritos un anuncio ajeno | Devuelve 201 | Correcto. 201 con `favorito` de `id_anuncio: 5` e `id_usuario: 2` |
| Añadir dos veces el mismo anuncio | La segunda devuelve 200 y no duplica | Correcto. 201 y luego 200 con el mismo `id` y la misma `fecha`; sigue habiendo una fila |
| Añadir a favoritos sin token | Devuelve 401 | Correcto. 401 `SIN_TOKEN` |
| Añadir a favoritos con un esquema que no es `Bearer` | Devuelve 401 | Correcto. 401 `ESQUEMA_INVALIDO` |
| Añadir a favoritos un anuncio inexistente | Devuelve 404 | Correcto. 404 `NO_ENCONTRADO` con "No existe el anuncio 999" |
| Añadir a favoritos tu propio anuncio | Devuelve 400 | Correcto. 400 `VALIDACION` con `campo: "anuncio"` |
| Añadir a favoritos con un id no numérico | Devuelve 400 | Correcto. 400 `VALIDACION` con `campo: "id"` |
| `GET /usuarios/me/favoritos` | Devuelve 200 con el formato paginado | Correcto. 200 con `datos` y `paginacion` |
| `GET /usuarios/me/favoritos` sin token | Devuelve 401 | Correcto. 401 `SIN_TOKEN` |
| Consultar los favoritos de otro usuario | No es posible (solo `/usuarios/me`) | Correcto. `/usuarios/2/favoritos` da 404 `NO_ENCONTRADO`; con su propio token, `ana` ve `total: 0` y no ve las filas de `carlos` |
| Quitar un favorito existente | Devuelve 204 | Correcto. 204 y cuerpo vacío |
| Quitar un favorito que no existía | Devuelve 404 | Correcto. 404 con "El anuncio 5 no está en tus favoritos" |
| Quitar un favorito sin token | Devuelve 401 | Correcto. 401 `SIN_TOKEN` |
| Quitar un favorito de otro usuario | No lo quita | Correcto. 404 para quien no lo tenía, y la fila del otro sigue ahí |
| El listado ordena por fecha de guardado | Del más nuevo al más antiguo | Correcto. Guardados el 6, el 7 y el 8 en ese orden, salen 8, 7 y 6 |
| El listado incluye los vendidos | Sí | Correcto. El anuncio 7 estaba `vendido` y sale con su `estado` |
| El listado pagina con `pagina` y `limite` | Devuelve la página pedida | Correcto. `?limite=2&pagina=2` da `total: 3`, `paginas: 2` y una fila |
| `?limite=` fuera de rango | Devuelve 400 | Correcto. 400 `VALIDACION` con `campo: "limite"` |
| `num_favoritos` del detalle | Cuenta los favoritos reales | Correcto. 0 antes de marcar y 1 después |

Al terminar se borraron los favoritos de prueba y el anuncio 7 volvió a `disponible`, así que la base
de desarrollo queda con sus tres usuarios, sus ocho categorías y los cuatro anuncios de la I2, y la
tabla `favoritos` vuelve a estar vacía.

### Tests automáticos

- `tests/favoritos.test.js`, **29 pruebas**:
  - **Alta**: 201 con el favorito completo, 200 al repetir, no duplica, la fecha no cambia, 401 sin
    token, 401 con esquema equivocado, 404 de anuncio inexistente, 400 con `campo: "anuncio"` al
    marcar el propio anuncio, 400 con `campo: "id"` si el id no es numérico, y que dos usuarios
    tengan listas independientes.
  - **Baja**: 204 sin cuerpo, 404 si no estaba, 401 sin token, 404 de anuncio inexistente, que no
    toque la fila de otro usuario, y que borrar el anuncio se lleve sus favoritos por cascada.
  - **Listado**: formato paginado vacío, las columnas exactas del resumen ligero, orden por fecha de
    guardado, anuncios vendidos dentro, paginación con `pagina` y `limite`, cuatro valores de
    `?pagina=` y `?limite=` inválidos, 401 sin token, que no se vean los de otro, y que no exista
    ruta de favoritos de otro usuario.
  - **`num_favoritos`**: sube al marcar y baja al desmarcar.

Igual que en `anuncios.test.js`, los usuarios se insertan por SQL y los tokens se firman con
`firmarToken` en lugar de registrarse en cada prueba: `bcrypt` con coste 12 son unos 300 ms por
llamada, y multiplicado por toda la suite serían casi medio minuto sin ganar nada, porque el login ya
está cubierto en `auth.test.js`.

Resultado obtenido el 30/09/2026 con `npm test`: **166 pruebas, 166 correctas, 0 fallidas** (16 de
`auth.test.js`, 33 de `usuarios.test.js`, 88 de `anuncios.test.js` y 29 de `favoritos.test.js`).
Cobertura: 96,1 % de sentencias, 83,1 % de ramas y 98,9 % de funciones, desde el 95,5 % de la I3.
El fichero nuevo, `favoritoService.js`, queda al 100 % de sentencias. `errores.js` sigue siendo el
peor con 45,5 %, y es a propósito: sus tres caminos internos quedan para la I6, tal y como ya
apuntaba el documento de la I3.

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: big-pickle
- Tipo: generación y revisión de código, con las decisiones de diseño y de alcance tomadas por el
  estudiante, y una revisión previa de las tres iteraciones anteriores.

### Uso realizado

La IA se usó por partes, no de una sola vez:

1. **Revisión de lo hecho antes de empezar.** Antes de escribir nada de la I4 se revisaron las tres
   iteraciones juntas, buscando errores que solo aparecieran al juntarlas. Se ejecutaron los tests,
   se comprobó la base de datos y se probó la API a mano. Salió un bug real: una imagen subida que
   después se rechazaba, por una validación o por un 403, se quedaba en `uploads/` para siempre.
2. **Preguntas antes de escribir código**: la IA leyó `04-favoritos.md`, `ARCHITECTURE.md` y el
   esquema, localizó lo que la SPEC dejaba abierto (dónde viven las rutas, qué devuelve el alta, con
   qué código se rechaza marcar el propio anuncio, y qué filas trae el listado) y preguntó en vez de
   elegir.
3. **Generación del código**: `services/favoritoService.js`, las dos rutas nuevas en
   `routes/anuncios.js`, la nueva en `routes/usuarios.js`, `helpers/proyecciones.js` y los 29 tests
   de `favoritos.test.js`.
4. **Corrección durante la implementación**: la IA detectó montando los tests que las expectativas de
   la paginación y del orden contaban con un anuncio de más, porque el anuncio 7 del `beforeEach` es
   de `carlos` y `carlos` no puede guardarse a sí mismo su propio anuncio.

Lo que **no** hizo la IA: decidir dónde viven las rutas, qué devuelve el cuerpo del alta, con qué
código se rechaza el propio anuncio, ni qué filas y en qué orden devuelve el listado. Esas cuatro
las decidió el estudiante tras ver las opciones. Tampoco decidió qué arreglar de la revisión previa:
preguntó, y el estudiante pidió arreglarlo en la I4 en lugar de dejarlo para el final.

### Prompt importante 1

> "he probado ya todo el flujo que tengo manual ya con el postman y veo que todo funciona como se
> espera y la experiencia para el usuario va a ser buena, de todas formas, revisa ya todo lo que
> esta hecho por si ha apareceido un error nuevo al juntar estas 3 iteraciones, y una vez esté todo en
> orden y listo procede a crear la iteración 4"

El prompt que condicionó la iteración. La parte importante es que la revisión de las tres iteraciones
anteriores no era un trámite: de ahí salió el bug de los ficheros huérfanos, que las 133 pruebas que
había hasta entonces no veían porque ningún caso combinaba una imagen válida con una petición
rechazada después.

### Resultado

- 166 pruebas, 166 correctas, con 29 nuevas de esta iteración.
- `npm test -- --coverage`: 96,1 % de sentencias y 98,9 % de funciones.
- Los 18 casos del `TEST_PLAN` verificados sobre el servidor real con `curl`, no solo con los tests.
- Los 20 casos del `TEST_PLAN` de la I3 vuelven a pasar después de los arreglos.
- El bug de los ficheros huérfanos, arreglado y con cuatro pruebas de regresión que fallan sin él.
- La base de desarrollo y `uploads/` dejadas como estaban.

### Decisión del estudiante

Lo que se aceptó de lo propuesto por la IA:

- **Las rutas repartidas según la URL**, con `POST` y `DELETE /anuncios/:id/favorito` en
  `routes/anuncios.js` y `GET /usuarios/me/favoritos` en `routes/usuarios.js`, en vez del
  `routes/favoritos.js` que pedía el PLAN.
- **El `POST` devuelve `datos.favorito` en los dos casos**, con la misma forma en el 201 y en el 200.
- **El 400 de propio anuncio es `VALIDACION` con `campo: "anuncio"`**, sin añadir un código al
  catálogo de errores.
- **El listado devuelve el resumen ligero con los vendidos dentro y ordenado por fecha de
  guardado.**
- **Arreglar en la I4 lo que salió de la revisión**, y no dejarlo para el final: el bug de los
  ficheros huérfanos, la función muerta y el ciclo de `require` latente.

Lo que se cambió o rechazó de lo generado:

- El listado de favoritos no devuelve `num_favoritos` en cada fila. Es un dato que se puede pedir con
  una llamada aparte y rompe la coherencia de formato con el resto de listados.
- No se añadió un filtro por estado al listado de favoritos. Que salga un favorito vendido es
  información, no un error: el usuario quiere saber qué se guardó.
- La cobertura de los caminos internos de `errores.js` se dejó para la I6, tal y como ya estaba
  apuntado en el documento de la I3, en lugar de resolverla de paso.

### Correcciones manuales

1. **Los ficheros huérfanos de `uploads/`.** `subirImagen` (multer) escribe el fichero antes de que
   se compruebe el cuerpo de la petición y antes de que se compruebe quién es el autor. Si después
   esa comprobación falla, el fichero se quedaba en `uploads/` sin que nada lo referenciara. Se
   reprodujo tres veces contra el servidor real antes de arreglarlo:

   ```text
   POST  /anuncios   imagen válida + categoria=abc     -> 400  y el PNG queda en uploads/
   POST  /anuncios   imagen válida + titulo vacío      -> 400  y el PNG queda en uploads/
   PATCH /anuncios/5 de Ana, hecho por Carlos + imagen -> 403  y el PNG queda en uploads/
   ```

   El tercero era el grave: sin arreglarlo, cualquier usuario autenticado podía llenar `uploads/` de
   ficheros simplemente intentando editar un anuncio que no es suyo, y el `POST` del primer caso lo
   disparaba el error más común de todos, una errata en el título.

   El arreglo va en el propio middleware, para que el manejador central de errores siga sin saber
   nada de un recurso concreto: se mira el estado con el que se respondió y, si es de error, se
   borra el fichero. Si la operación tuvo éxito, el nombre ya está en la fila del anuncio y hay que
   conservarlo. El error del borrado se ignora a propósito, porque la petición ya tiene su
   respuesta y un fallo al limpiar no debe convertirla en un 500.

   El borrado es **síncrono**, y no por capricho. Con `fs.unlink` en segundo plano las pruebas de
   regresión fallaban de forma intermitente: el 400 ya le había llegado a supertest y el fichero
   todavía estaba en `uploads/`, porque el `unlink` va por detrás. Se vio al repetir la suite
   tres veces seguidas (2 fallos, luego 1, luego ninguno) antes de entenderlo. Con `unlinkSync`
   dentro del manejador de `close` el fichero ya no está cuando el cliente recibe el error, que es
   lo que se quiere comprobar, y la suite es estable. El coste es bloquear el bucle de eventos unos
   microsegundos, solo en peticiones que ya están fallando, y es el mismo criterio que ya se usa
   en los tests con `fs.readdirSync`.

   Con cuatro pruebas de regresión encima: tres de alta y una de edición con un 403. Se comprobó
   que las cuatro fallan si se quita el arreglo.

2. **`projectionPublica` en `authService.js` era código muerto.** Se definía y se exportaba desde
   la I1, pero no la llamaba nadie: la proyección pública vive en `usuarioService.perfilPublico`, con
   `CAMPOS_PUBLICOS`. Se borró. Es la clase de resto que se acumula cuando una función se escribe
   para un caso y luego el caso se resuelve en otro sitio.

3. **Un ciclo de `require` latente.** `anuncioService` importa `CAMPOS_PUBLICOS` de `usuarioService`,
   y `usuarioService` guardaba su propia copia de las columnas del listado de anuncios. Escribir el
   listado de favoritos reutilizando una de las dos copias habría sido lo natural, e importarla desde
   `anuncioService` habría creado un ciclo que se rompe en tiempo de ejecución y no al importar. Las
   columnas se movieron a `helpers/proyecciones.js` y la configuración de las imágenes, de
   `middleware/subidaImagen.js` a `config.js`, con el criterio de que un servicio no importa
   middleware. Ninguno de los dos cambios cambia el comportamiento de la API.

## COMMITS RELACIONADOS

- `4cea237` - corregir(anuncios): borra la imagen si la petición acaba en error
- `851d490` - probar(anuncios): regresión para la imagen huérfana
- `58c0a40` - refactor(config): mueve la configuración de uploads fuera del middleware
- `0a775f8` - refactor(anuncios): centraliza la proyección de los listados
- `99fb679` - refactor(auth): elimina la proyección pública sin uso
- `4ab2dca` - añadir(favoritos): alta, baja y listado de los anuncios guardados
- `7b2bef1` - probar(favoritos): 29 tests del alta, la baja y el listado
- `e0e7fac` - documentar(docs): actualiza los resultados de I4
