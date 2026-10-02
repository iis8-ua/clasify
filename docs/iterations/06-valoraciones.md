# Iteración 06 - Valoraciones

## SPEC

### Objetivo

Permitir que los usuarios valoren a otros usuarios con una puntuación del 1 al 5 y un comentario
opcional, y que esa valoración se vea resumida en el perfil y junto al autor de sus anuncios.

De paso se refuerza el detalle del anuncio: el requisito del enunciado pide devolver un elemento
"junto con algún recurso secundario relacionado", y hasta ahora el detalle solo daba el `id` del
hilo, no su contenido.

### Requisitos

Funcionales:

- Un usuario autenticado puede valorar a cualquier otro usuario distinto de él, con una puntuación
  entera del 1 al 5 y un comentario opcional de hasta 500 caracteres.
- Valorar es editable: si ya existe una valoración de ese usuario sobre ese otro, se sobrescribe.
  La primera vez responde 201 y las siguientes 200, para que el cliente sepa si está creando o
  actualizando sin tener que preguntar antes.
- Un usuario autenticado puede borrar su propia valoración sobre otro usuario. Si no había ninguna,
  responde 404.
- Cualquier visitante, sin token, puede listar paginadamente las valoraciones de un usuario, de la
  más reciente a la más antigua, con la puntuación, el comentario, la fecha y el nombre de quien
  valoró.
- El perfil de un usuario incluye su `valoracion_media` (media redondeada a dos decimales) y su
  `num_valoraciones`. Sin valoraciones, la media es `null` y el recuento 0.
- Si quien consulta el perfil lleva token y ya ha valorado a ese usuario, la respuesta añade
  `mi_valoracion` con lo que le puso, para que el cliente pueda pintar las estrellas directamente.
- El perfil propio y `/auth/yo` incluyen también la media y el recuento, que son datos sobre el
  usuario que ya se le pueden enseñar a sí mismo.
- El `autor` del detalle de un anuncio incluye `valoracion_media` y `num_valoraciones`, que es
  donde un comprador mira antes de escribirle al vendedor.
- El detalle de un anuncio, cuando quien consulta participa en algún hilo de ese anuncio, añade
  `ultimos_mensajes` con los tres últimos mensajes del hilo y `num_mensajes` con el total. Un
  comprador tiene como mucho un hilo con un anuncio, así que no hay ambigüedad; si quien consulta
  es el vendedor y tiene varios, se muestra su hilo más reciente.

Técnicos:

- Nueva tabla `valoraciones` con `UNIQUE (id_valorador, id_valorado)`, las dos claves foráneas a
  `usuarios` con `ON DELETE CASCADE` e índice por `id_valorado`. Al borrar un usuario se borran
  las valoraciones que dio y las que recibió sin tocar nada a mano.
- La puntuación se valida en la capa de validación, no en el esquema. El `CHECK` del esquema es una
  red de seguridad para que nadie pueda meter un 7 por la API, pero nunca es lo que responde, porque
  lo que tiene que contestar la API es un 400 con el nombre del campo. Un `CHECK` violado, si llegara
  hasta MySQL, se convertiría en un 500 desde el manejador central de errores.
- `GET /usuarios/:id` pasa a llevar token **opcional**, igual que `GET /anuncios/:id`, porque solo
  hace falta para devolver `mi_valoracion`. Sin token la respuesta es exactamente la de antes.
- El resumen de las valoraciones se calcula con un `AVG` y un `COUNT` sobre `id_valorado`, en la
  misma consulta que el perfil, no en una segunda.
- Ver `docs/ARCHITECTURE.md` para las convenciones de esquema, rutas, errores y paginación.

### Fuera de alcance

- Moderación de valoraciones: reportar una, ocultarla o borrarla por el usuario valuedo.
- Ponderación por antigüedad. Una valoración cuenta lo mismo la primera semana que el primer año, y
  una media ponderada al estilo de Wallapop es complicación sin valor docente aquí.
- Valorar anuncios. Solo se valoran personas.
- Notificaciones al usuario valorado y avisar de que le han escrito.
- Rango de puntuaciones en el listado, tipo "solo las de 5 estrellas".
- Moderar contenido: sigue siendo cosa del frontend, como el resto de la aplicación.

### Ajustes durante la iteración

- Las valoraciones no salían en el enunciado: estaban declaradas fuera de alcance en el
  `PROJECT_SPEC`, en el `Diseno.md` y en el `README`. Se meten dentro porque el enunciado deja
  margen hasta el proyecto principal y el recurso ya estaba medio hecho (dos usuarios con un hilo
  entre ellos), pero hay que cambiar los tres documentos o se contradicen.
- El detalle del anuncio pasa a mostrar los mensajes, no solo el `id` del hilo, por lo que dijo el
  enunciado de "obtener un elemento junto con algún recurso secundario relacionado".
- `deParticipante` devolvía un hilo cualquiera si quien consultaba era el vendedor con varias
  conversaciones sobre el mismo anuncio. Se le pone orden para que sea el más reciente.

## PLAN

1. Añadir la tabla `valoraciones` a `src/db/schema.sql` y el validador de la valoración en
   `middleware/validar.js`.
2. Crear `src/services/valoracionService.js` con `valorar`, `quitar`, `listar` y `listarPropias`.
   El resumen no va aquí como función suelta: se calcula con subconsultas dentro de la consulta del
   perfil, para que no haya dos fuentes de verdad que se desincronicen.
3. Añadir las cuatro rutas a `routes/usuarios.js`, cuidando el orden de registro porque `/me/valoraciones`
   y `/:id/valoraciones` tienen la misma forma.
4. Añadir `valoracion_media` y `num_valoraciones` al perfil público, al propio, a `/auth/yo` y al
   `autor` del detalle del anuncio.
5. Poner token opcional en `GET /usuarios/:id` y devolver `mi_valoracion` cuando el token existe.
6. Añadir `mensajeService.ultimos` y enganchar `ultimos_mensajes` y `num_mensajes` en
   `GET /anuncios/:id`, con `deParticipante` ordenado por fecha.
7. Pruebas de las cuatro rutas, de la validación, de la cascada y de los resúmenes.
8. Actualizar `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `Diseno.md` y `README.md`.

### Revisión del estudiante

- Las rutas van repartidas por el sujeto: `/:id/valoracion` para valorar a alguien y
  `/me/valoraciones` para lo que he escrito yo. No se mete `/valoraciones` sueltas porque en
  `routes/usuarios.js` `/:id` se come el resto.
- Valorar es un `PUT` y no un `POST`: repetir la misma acción es Actualizar, no Crear, y así el
  cliente puede repetir la llamada sin miedo.
- La valoración se edita, no se bloquea. Una vez que te han valorado mal vas a querer corregirlo.
- Cualquiera autenticado puede valorar a cualquiera. No se pide que hayan hablado antes, porque
  atarlo a la mensajería mezcla dos recursos y no lo pide nadie.
- El `mi_valoracion` se devuelve en el perfil y no en una llamada aparte, porque el frontend ya está
  cargando ese perfil y pedirlo dos veces es tirar.
- El resumen va en la misma consulta que el perfil y no en una aparte, para que no haya dos
  fuentes de verdad que se puedan desincronizar.
- `valoracion_media` sale como número y no como el texto que devuelve el driver. `AVG` de una
  columna entera es un DECIMAL en MySQL y `mysql2` serializa los DECIMAL como texto para no perder
  precisión, igual que hace con `precio`, pero una media de 1 a 5 con dos decimales no tiene
  precisión que perder y quien la consume la quiere comparar y ordenar. Es una excepción consciente
  a la convención de `precio`, y se anota en el `ARCHITECTURE.md`.
- Autovalorarse devuelve 400 `VALIDACION` con `campo: "usuario"` y no 403. Es la misma respuesta que
  ya da "no se puede añadir a favoritos tu propio anuncio": es una regla de negocio sobre los datos
  que se han mandado, no falta de permisos para llegar al recurso.

### Riesgos o dudas

- Riesgo de arrastre: `ON DUPLICATE KEY UPDATE` parece la forma natural de resolver el
  "crea o actualiza" en una sentencia, pero devuelve `affectedRows` 1 tanto al insertar como al
  actualizar con los mismos valores, así que no sirve para distinguir el 201 del 200. Se
  comprueba contra el MySQL de la máquina y se descarta. La solución es `INSERT IGNORE` (que sí da
  0 en duplicado, como ya viene haciendo I4 e I5) y, solo si dio 0, un `UPDATE`.
- `INSERT IGNORE` se traga cualquier error, incluida una violación del `CHECK` de la puntuación. No
  puede dar un 201 con una puntuación inválida porque antes la validación ya la ha rechazado, pero
  si algún día alguien salta esa capa, la fila no se inserta y el `UPDATE` posterior falla con un
  500, o sea que el error sale igualmente.
- El `CHECK` solo se cumple a partir de MySQL 8.0.16. Se documenta que la versión mínima es 8.0.
- `GET /usuarios/:id` pasa a llevar token opcional. Hay que comprobar que no rompe a los que ya la
  llamaban sin token: no, porque el middleware solo borra `req.usuario` si el token no vale.
- Borrar un usuario borra las valoraciones que dio y las que recibió. Si en algún momento se
  quisiera conservar el histórico, haría falta desacoplar las dos FK, pero para esta aplicación no
  tiene sentido guardar la opinión de alguien que ya no existe.

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `npm install`, `.env` y scripts de base de datos siguiendo el README | Arranca y crea el esquema | Correcto, ya documentado en el README de la I5 |
| `PUT /usuarios/2/valoracion` con 5 y comentario | 201 con la valoración creada | 201, `nuevo: true`, comentario recortado y `id` 2 |
| Otro `PUT` con 3 sobre el mismo usuario | 200 con la puntuación cambiada | 200, `nuevo: false` y la misma fila, sin crear otra |
| `PUT` con el mismo 3 otra vez | 200 y `fecha` sin tocar | Correcto |
| `PUT` sobre uno mismo | 400 `VALIDACION` con `campo: "usuario"` | 400 `VALIDACION`, `campo: "usuario"` |
| `PUT` con 0, con 6, con 3.5 o con `"4"` | 400 `VALIDACION` con `campo: "puntuacion"` | 400 en los cuatro casos, con el campo bien señalado |
| `PUT` con un comentario de 501 caracteres | 400 `VALIDACION` con `campo: "comentario"` | 400 `VALIDACION`, `campo: "comentario"` |
| `PUT` sin token | 401 `SIN_TOKEN` | 401 `SIN_TOKEN` |
| `PUT` sobre un usuario inexistente | 404 `NO_ENCONTRADO` | 404 `NO_ENCONTRADO` |
| `DELETE /usuarios/2/valoracion` | 204 | 204 |
| `DELETE` otra vez | 404 | 404 `NO_ENCONTRADO` |
| `GET /usuarios/2/valoraciones` sin token | 200 paginado, con la puntuación, el comentario y el nombre | 200, paginación correcta y sin `email` ni `password_hash` |
| `GET /usuarios/me/valoraciones` con token | 200 con lo que ha escrito el usuario | 200, solo lo suyo y con la media de quien la recibió |
| `GET /usuarios/2` sin token | 200 con `valoracion_media` y `num_valoraciones`, sin `mi_valoracion` | Correcto |
| `GET /usuarios/2` con el token de quien ya le puso | 200 con `mi_valoracion` | Correcto, con la puntuación y el comentario que puso |
| `GET /usuarios/2` con token de un tercero que no ha valorado | 200 sin `mi_valoracion` | Correcto |
| `GET /usuarios/9` sin valoraciones | `valoracion_media: null` y `num_valoraciones: 0` | `null` y 0, no 0 y 0 |
| `GET /auth/yo` | El resumen también sale aquí | Correcto, con `valoracion_media` y `num_valoraciones` |
| `GET /anuncios/5` con `autor` | `valoracion_media` y `num_valoraciones` dentro del autor | Correcto, y sin el email del autor |
| `GET /anuncios/5` siendo parte del hilo | `conversacion`, `ultimos_mensajes` y `num_mensajes` | Correcto, con 5 mensajes salen los 3 últimos y `num_mensajes: 5` |
| `GET /anuncios/5` sin relación con el hilo | Ninguna de las tres claves | Correcto, ni con token de un tercero ni sin token |
| `GET /anuncios/5` siendo el vendedor con tres compradores | Sale el hilo más reciente, no uno al azar | Correcto |
| Abrir el detalle del anuncio | No marca ningún mensaje como leído | Correcto, la bandeja sigue con 5 sin leer |
| Un token inválido en el detalle | 200 y sin `mi_valoracion` ni preview | 200, la petición se trata como anónima |
| MySQL rechaza un 7 saltándose la validación | 500 en vez de colar el 7 | Correcto, el `CHECK` lo para |
| Borrar un usuario | Se borran las valoraciones que dio y las que recibió | Correcto por cascada |

### Tests automáticos

- `tests/valoraciones.test.js`:
  - Alta: 201, y el `id` y la fecha los pone la base de datos.
  - Reeditar: 200, cambia la puntuación y el comentario, y `num_valoraciones` sigue siendo 1.
  - Repetir el mismo `PUT`: 200 y no crea una segunda fila.
  - No valorarse a uno mismo: 400 `VALIDACION` con `campo: "usuario"`.
  - Validación de la puntuación: 0, 6, 3.5, `"3"`, `null` y ausente dan 400 con `campo: "puntuacion"`.
  - Validación del comentario: 501 caracteres dan 400 con `campo: "comentario"`, y 500 pasan.
  - Autorización: 401 sin token en `PUT` y en `DELETE`.
  - 404 de usuario inexistente en el `PUT`, el `DELETE` y el listado.
  - Borrado: 204 la primera vez, 404 la segunda.
  - Listado: paginación, orden de más reciente a más antigua, y que el nombre del que valorar viene
    sin email ni `password_hash`.
  - `GET /usuarios/:id/valoraciones` funciona sin token.
  - Resúmenes: media de varias valoraciones redondeada a dos decimales, `null` sin ninguna, y
    coherente entre el perfil, `/auth/yo` y el `autor` del anuncio.
  - `mi_valoracion`: presente con token si ya se le puso una, ausente sin token y
    ausente si el token es de alguien que no le ha valorado.
  - `valoracion_media` no se confunde con la de quien mira: la media es siempre la del perfil visto.
  - Cascada: al borrar un usuario desaparecen las valoraciones que dio y las que recibió, y la del
    tercero se queda con la media recalculada.
- `tests/mensajeria.test.js` (se amplía):
  - `ultimos_mensajes` con 3 o menos mensajes trae todos, y con 5 trae los tres últimos en orden de
    más antiguo a más nuevo, con `num_mensajes: 5`.
  - No aparece nada si quien consulta no participa del hilo.
  - El vendedor con varias conversaciones ve su hilo más reciente.
  - Abrir el detalle no marca ningún mensaje como leído: `leido` sigue en `false` y el contador de
    la bandeja no baja.
- Suite completa: `npm test`.

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: big-pickle
- Tipo: IA asistente de programación

### Uso realizado

La IA propone y el estudiante decide. En esta iteración la IA propuso el esquema de la tabla, el
servicio, las rutas, los resúmenes y el refuerzo del detalle del anuncio, y los tests. El estudiante
revisó y corrigió por su cuenta, y hay cuatro cosas que se hicieron a mano porque la IA no las dio
bien:

1. **El `valoracion_media` salía como texto.** Los diez primeros tests en rojo eran eso: MySQL
   devuelve `ROUND(AVG(puntuacion), 2)` como `"4.50"` porque `AVG` de una columna entera es un DECIMAL
   y `mysql2` serializa los DECIMAL como texto. La IA propuso quitar los `Number(...)` y bajar los
   tests a `"4.50"`. El estudiante preguntó y decidió que sea número, porque una media de
   1 a 5 no tiene precisión que perder y quien la consume la quiere comparar y ordenar. Se convirtió
   con `Number(...)` en los cuatro sitios y se documentó la excepción a la convención de `precio`.
2. **`/auth/yo` no llevaba el resumen.** La IA cambió `/auth/yo` para usar `perfilPropio` y se quedó
   corto: el test pedía `biografia` en el `autor` del anuncio pero no en la sesión. Se añadió el
   aserto.
3. **Un 500 en vez de un 400.** El validador convertía un comentario en blanco a `null` y acto
   seguido leía `.length` de `null`. Lo cazó el test de "un comentario en blanco". Se comprobó la
   longitud antes de convertir.
4. **Código muerto.** `valoracionService` exportaba un `resumenDe` que nadie llamaba desde que el
   resumen se calculaba con subconsultas dentro del perfil. Se borró en vez de testearlo.

### Prompt importante 1

> Implementa la iteración de valoraciones siguiendo el SPEC de
> `docs/iterations/06-valoraciones.md`. Antes de escribir código, decide y pregunta cualquier punto
> que sea dudoso: en concreto el tipo del JSON de `valoracion_media`, el código de estado para
> autovalorarse y si el detalle del anuncio debe marcar los mensajes como leídos. Avisa antes de
> commitear y enséñame el reparto de commits.

### Resultado

- 50 tests nuevos en `tests/valoraciones.test.js` y 12 en `tests/mensajeria.test.js`.
- Suite completa: 297 tests, todos en verde (el total final, tras la revisión de la iteración 8,
  está en `docs/iterations/08-cierre.md`).
- Cobertura: `valoracionService` 100 % de líneas, `routes/usuarios.js` y `routes/anuncios.js` al 100 %.
- Las 26 comprobaciones manuales de la tabla de arriba se hicieron con `curl` contra un servidor real
  en el puerto 3100, no solo con los tests.
- Se añadió una tabla nueva (`valoraciones`) con su `UNIQUE`, sus dos `ON DELETE CASCADE` y su
  índice, y se aplicó el esquema sobre la base de datos de desarrollo.

### Decisión del estudiante

- **Se aceptó** el diseño por recurso (`/usuarios/:id/valoracion` en `PUT` y `DELETE`,
  `/usuarios/:id/valoraciones` en `GET`), que permite que `/me/valoraciones` no se coma
  `/:id/valoraciones`.
- **Se aceptó** que valorar sea editable con `PUT` y que el 201/200 le diga al cliente si está creando
  o editando.
- **Se aceptó** que el `mi_valoracion` vaya dentro del perfil con token opcional, y no en una llamada
  aparte.
- **Se aceptó** el `INSERT IGNORE` más `UPDATE` condicional en lugar de `ON DUPLICATE KEY UPDATE`,
  después de comprobar en el MySQL de la máquina que `affectedRows` no distinguía los dos casos.
- **Se rechazó** que `valoracion_media` saliera como texto. La IA lo propuso primero como cambio
  más pequeño (bajar los tests) y se decidió lo contrario.
- **Se mantuvo** el `404` cuando se borra una valoración que no existía, para que el cliente sepa
  que no había nada que borrar.
- **Se añadió** el refuerzo del detalle del anuncio, que no estaba en el enunciado literal de esta
  iteración pero sí en el del proyecto principal ("un elemento junto con algún recurso secundario
  relacionado"), y ya se avisó en el documento.

### Correcciones manuales

- `mensajeria.test.js` lleva un `describe` de 12 casos para el adelanto del hilo.
- Se corrigió un `}` de más que rompía el `describe` de `me/valoraciones`.
- Dos tests tenían mal el índice del array al asumir el orden de las valoraciones; los dos apuntaban
  al más antiguo cuando el listado es de más reciente a más antigua.
- El test de redondeo metía datos que violaban el `UNIQUE (id_valorador, id_valorado)`. La base de
  datos lo rechazó con su propio error y se reescribió con un cuarto usuario para tener tres
  valoraciones y que la media dé `4.33`.
- `resumenDe` y el paso 2 del PLAN se eliminaron al no quedar en uso.
- Se repararon tres typos en el documento (`por elAPI`, `han=valueado`) y se sustituuyó un caso del
  TEST_PLAN por `?pagina=999`, que no comprobaba nada porque el detalle no pagina.
- Se borraron de la base de datos de desarrollo los usuarios de prueba de esta iteración y todo lo que
  colgaba de ellos en cascada.

## COMMITS RELACIONADOS

- `034687a` añadir(valoraciones): valoración entre usuarios con media y recuento
- `347b952` añadir(mensajería): devuelve los últimos mensajes en el detalle del anuncio
- `e5c7b6c` probar(valoraciones): 50 tests de valoración, validación, cascada y resúmenes
- `93072a5` probar(mensajería): 12 tests del adelanto del hilo
- `e54099b` documentar(docs): valoraciones y segundo recurso del detalle
- `c4f0ce0` documentar(docs): cierra la iteración 06 de valoraciones