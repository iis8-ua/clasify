# Iteración 03 - Anuncios (recurso principal)

## SPEC

### Objetivo

Implementar el CRUD del recurso principal (anuncios) con búsqueda por texto, filtro por categoría,
ordenación, paginación y autorización por autor.

### Requisitos

Funcionales:

- `POST /anuncios` (JWT) crea un anuncio con título, descripción, precio, categoría e imagen
  (`multipart/form-data`, campo `imagen`).
- `GET /anuncios` lista los anuncios de forma paginada, con búsqueda por texto (`texto`), filtro
  por `categoria` y ordenación (`orden` = `fecha_desc|fecha_asc|precio_desc|precio_asc`).
- `GET /anuncios/:id` devuelve el anuncio con el autor, la categoría y `num_favoritos` (y la
  conversación si el usuario es participante).
- La imagen subida se sirve en `/clasify_api/uploads/:fichero`.
- `PATCH /anuncios/:id` (JWT) edita el anuncio, **solo su autor**.
- `PATCH /anuncios/:id/estado` (JWT) cambia el estado disponible/vendido, **solo su autor**.
- `DELETE /anuncios/:id` (JWT) elimina el anuncio, **solo su autor**.

Técnicos:

- Validación de entradas: título y descripción obligatorios con longitudes acotadas, `precio >= 0`,
  `categoria` existente, imagen con tipo (`jpeg/png/webp`) y tamaño (máx. 5 MB) válidos; en la
  edición solo se validan los campos enviados.
- Códigos de error coherentes: 400 (validación), 401 (sin token), 403 (no es el autor),
  404 (anuncio inexistente).
- Paginación según el formato común (`pagina`, `limite`, `paginacion`).

### Fuera de alcance

- Búsqueda avanzada (facetas, rangos de precio combinados, etc.).
- Redimensionado / generación de miniaturas de las imágenes.

### Ajustes durante la iteración

La SPEC dejaba cuatro cosas abiertas. Las cuatro se preguntaron al estudiante antes de escribir
código y están en *Decisión del estudiante*:

- **`GET /anuncios` sale solo con los anuncios disponibles.** La SPEC no lo decía y el propio
  documento lo marcaba como decisión pendiente. Por defecto `?estado=disponible`, y con
  `?estado=vendido` o `?estado=todos` se ven los demás.
- **`GET /categorias` entra en la I3.** Estaba en `ARCHITECTURE.md` y en `Diseno.md`, pero no en el
  PLAN ni en la SPEC de esta iteración. Se hace aquí porque el filtro por categoría del listado
  necesita la lista de categorías para el desplegable, la tabla ya está sembrada con las ocho y es
  la última iteración en la que sale prácticamente gratis.
- **`GET /anuncios/:id` devuelve `num_favoritos` pero no `conversacion`.** La SPEC pedía las dos
  cosas, pero favoritos es la I4 y mensajería la I5. El `COUNT` sobre `favoritos` sí sale ya, así
  que se implementa y cumple el requisito de "elemento + recurso"; `conversacion` se añade en la I5,
  que es cuando exista el recurso.
- **La imagen es opcional y `POST`/`PATCH` siempre van en `multipart/form-data`.** `PROJECT_SPEC`
  habla de crear anuncios "con fotografía" pero `Diseno.md` §8 no dice si el fichero es obligatorio.
  Se decidió que no lo es: un anuncio sin foto es un caso válido y la columna ya lo admite con
  `imagen` a `null`.

Otros cinco puntos que no estaban en la SPEC y se decidieron durante la implementación:

- **El listado es ligero**: cada fila es `id, titulo, precio, estado, imagen, fecha_creacion,
  id_categoria`, sin autor ni categoría dentro. Es el mismo formato que ya devolvía
  `GET /usuarios/:id/anuncios` en la I2, así que el frontend tiene un solo caso que aprender. El autor
  con nombre y la categoría con nombre salen en el detalle.
- **`?estado=` no se añade a `GET /usuarios/:id/anuncios` ni a `/usuarios/me/anuncios`.** Se podría
  tocar `usuarioService.js`, que ya estaba escrito y probado en la I2, y en un perfil tiene más
  sentido ver todo lo que ha publicado un usuario, vendidos incluidos.
- **`DELETE /anuncios/:id` devuelve 204 sin cuerpo**, igual que el `DELETE /anuncios/:id/favorito`
  que la I4 ya había especificado como 204.
- **El `precio` se valida antes de que lo vea MySQL.** Llega como texto en multipart y como número
  en JSON, así que se aceptan las dos formas pero se rechazan los negativos, los no numéricos y los
  que tienen más de 2 decimales, en vez de dejar que `DECIMAL(10,2)` redondee en silencio y guarde
  `45.68` cuando el usuario escribió `45.678`.
- **Los `MulterError` se traducen en el middleware de subida**, no en `middleware/errores.js`. Así el
  manejador central sigue siendo agnóstico al recurso y los 400 de imagen (`campo: "imagen"`) salen
  con el mismo formato que el resto de la API.

## PLAN

1. Crear `src/services/anuncioService.js` con las consultas de creación, listado (con filtros y
   paginación), detalle, edición, cambio de estado y borrado.
2. Crear `src/routes/anuncios.js` con las rutas y sus métodos HTTP.
3. Construir dinámicamente el `WHERE` del listado (texto sobre título/descripción, categoría) y el
   `ORDER BY` a partir de `orden`, validando los valores permitidos.
4. Añadir la comprobación de autor en edición, cambio de estado y borrado (401/403).
5. Validar las entradas y devolver el error uniforme.
6. Configurar `multer` (destino `backend/uploads/`, filtro de tipo y límite de tamaño) y servir la
   carpeta como estática en `/clasify_api/uploads`.
7. Borrar el fichero de imagen al sustituirlo o al eliminar el anuncio.
8. Escribir las pruebas automáticas de la iteración.

### Revisión del estudiante

Qué hay que mirar de esta iteración:

- [x] `src/routes/anuncios.js`: **el middleware de subida va antes del validador**, en las dos rutas
      que aceptan ficheros. Si se invirtieran, `validarNuevoAnuncio` leería un `req.body` vacío
      porque los campos de un `multipart` todavía no se han escrito en disco:

      ```js
      router.post('/', autenticar, subirImagen, async (req, res) => {
        const datos = validarNuevoAnuncio(req.body);
      ```

      También se ve que `PATCH /:id/estado` **no** lleva `subirImagen`: no tiene ficheros, así que va
      en JSON normal. Unificarlo por comodidad obligaría a un `try`/`catch` alrededor del
      `express.json()` global, que es justo lo que `express` no hace (y que en esta API se **
      comprueba** con un test de esta iteración, que es como se encontró el problema).

- [x] `src/services/anuncioService.js`: el `WHERE` del listado se monta con **valores de la query
      siempre como `?`**, nunca interpolados en el texto. Lo que sí se concatena son columnas y
      órdenes, pero solo después de pasar la lista cerrada de valores permitidos:

      ```js
      if (filtros.texto !== undefined) {
        condiciones.push('(a.titulo LIKE ? OR a.descripcion LIKE ?)');
        const patron = `%${escaparLike(filtros.texto)}%`;
        valores.push(patron, patron);
      }

      const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
      const orden = ORDENES_SQL[filtros.orden ?? ORDEN_POR_DEFECTO];
      ```

      Y el paréntesis en el `OR` no es decorativo: sin él, `titulo LIKE ? OR descripcion LIKE ? AND
      estado = ?` se leería como `titulo LIKE ? OR (descripcion LIKE ? AND estado = ?)` y se
      colarían anuncios vendidos al buscar texto.

      `escaparLike` escapa el propio `%` del usuario, así que buscar `50%` encuentra `Rebaja 50% en
      todo` en vez de devolver la tabla entera. Comprobado en la tabla de pruebas.

- [x] `src/services/anuncioService.js`: la lista de órdenes permitidos y su traducción a SQL
      (**un solo sitio**, para que no puedan divergir):

      ```js
      const ORDENES_SQL = {
        fecha_desc: 'a.fecha_creacion DESC, a.id DESC',
        fecha_asc: 'a.fecha_creacion ASC, a.id ASC',
        precio_desc: 'a.precio DESC, a.id DESC',
        precio_asc: 'a.precio ASC, a.id ASC'
      };
      const ORDENES_PERMITIDOS = Object.keys(ORDENES_SQL);
      ```

      `validarFiltrosAnuncios` importa `ORDENES_PERMITIDOS` de aquí, así que la lista que se valida y
      la que se traduce a SQL son literalmente el mismo objeto. El `id` de segunda está porque
      `TIMESTAMP` tiene precisión de segundo: sin él, dos anuncios con el mismo precio cambiarían de
      posición entre dos páginas y alguno se repetiría o se saltaría.

- [x] `src/services/anuncioService.js`: el autor del detalle **no se construye con un `SELECT *` al que se le quita el
      email**, sino que se deriva de la proyección pública que ya fijó la I2:

      ```js
      const CAMPOS_AUTOR = CAMPOS_PUBLICOS.split(', ')
        .map((campo) => `u.${campo} AS autor_${campo}`)
        .join(', ');
      ```

      Como el detalle se monta con `JOIN usuarios`, el autor y la categoría salen en la misma consulta
      y no en tres. Comprobado con el anuncio 13 de `ana@example.com`: en la tabla `usuarios` su `password_hash` es
      `$2b$12$`, y en el `autor` que devuelve el endpoint no aparece ni el email ni el hash.

- [x] `src/services/anuncioService.js`: la comprobación de autor va en **un solo sitio** y en el
      orden correcto, primero existencia y después propiedad:

      ```js
      async function exigirAnuncioDeAutor(id, idUsuario) {
        const anuncio = await buscar(id);
        if (!anuncio) {
          throw anuncioNoEncontrado(id);
        }
        if (anuncio.id_autor !== idUsuario) {
          throw sinPermisos();
        }
        return anuncio;
      }
      ```

      Con `carlos@example.com` sobre el anuncio 13 de `ana` sale 403 `SIN_PERMISOS`, y el anuncio
      sigue en la base con su título y su precio. Con el id 999 sale 404, no 403: un id que no
      existe no es un anuncio de otro.

- [x] `src/middleware/subidaImagen.js`: **el nombre del fichero lo pone el servidor**, con
      `crypto.randomUUID()` y la extensión del tipo declarado, y no el que envía el cliente. Subir un
      fichero llamado `../../secreto.png` guarda `18c61f62-8a0a-485e-81e3-0f01ba21ad2c.png` dentro de
      `uploads/`, así que no hay forma de escribir fuera de la carpeta. Y el `fileFilter` va antes de
      escribir nada, por lo que un `.txt` rechazado **no deja fichero en disco**.

      Comprobado con el límite de tamaño en el borde: 5 MiB exactos (5 242 880 bytes) se aceptan y
      5 MiB + 1 byte se rechazan con 400 `VALIDACION` y `campo: "imagen"`. Multer borra solo el
      fichero a medias, y el anuncio tampoco se crea: son las dos cosas o ninguna.

- [x] `src/services/anuncioService.js`: **sustituir o borrar el anuncio se lleva su imagen**, que si
      no se quedaría huérfana en `uploads/` para siempre. Al borrar el anuncio no hace falta tocar
      favoritos, conversaciones ni mensajes a mano: los borran los `ON DELETE CASCADE` del esquema,
      y está comprobado anuncio a anuncio.

      El borrado del fichero **tolerante**: si el fichero ya no está, no es un error, porque puede
      que alguien haya limpiado `uploads/` a mano y lo que importa es que la fila se borre.

      ```text
      $ curl -X POST ... -F imagen=@mesa.png      # announcement 13, image 18c61f62-....png
      $ curl -X PATCH /clasify_api/anuncios/13 ... -F imagen=@otra.png
      $ ls backend/uploads/
      6b84cfaa-bca9-4738-8610-057a7bac6f4d.png   # solo la nueva; la 18c61f62-... ya no está
      ```

### Riesgos o dudas

- Resuelto: la ordenación se pasa en un único parámetro `orden` con valores
  `fecha_desc|fecha_asc|precio_desc|precio_asc`.
- **Resuelto**: el listado **sí lleva filtro de estado**, con `?estado=disponible|vendido|todos` y
  `disponible` por defecto. Era la decisión que la SPEC dejaba pendiente.
- **Resuelto**: un `?orden=` o un `?estado=` fuera de la lista devuelve **400 `VALIDACION`** con el
  nombre del parámetro en `campo`, en vez de ignorarse en silencio. Es lo mismo que ya hacía
  `helpers/paginacion.js` con `limite=999`, y mantiene la regla de que una entrada mala se dice.
- **Resuelto**: `GET /anuncios/:id` **no** lleva `conversacion`. La SPEC la pedía, pero es un recurso
  de la I5; lo que sí se implementa es `num_favoritos`.
- **Resuelto**: la imagen es **opcional**. Se decidió y se documenta en
  `ARCHITECTURE.md`; si más adelante el enunciado exigiera foto obligatoria, el cambio es una línea en
  `validarNuevoAnuncio`.
- **Límite de la descripción**: `Diseno.md` dice que la `descripcion` es `TEXT` pero no fija longitud.
  La SPEC sí pide "longitudes acotadas", así que se puso un tope de **5000 caracteres** (por debajo de
  los 65 535 bytes que admite la columna) y un título de 150, el de su `VARCHAR`. Es un número
  elegido, no uno que venga del enunciado.
- **La búsqueda no mira el nombre del autor.** El PLAN decía "texto sobre título/descripción" y se
  mantuvo: buscar por vendedor es otra funcionalidad, no un filtro más.

## TEST_PLAN

### Pruebas manuales

Probadas el 30/09/2026 con el servidor arrancado (`npm start`, MySQL 8.0.46) y peticiones `curl`.

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `GET /categorias` sin token | Devuelve 200 con las ocho categorías | Correcto. 200 con los ocho nombres ordenados alfabéticamente |
| Crear anuncio con datos válidos y token | Devuelve 201 con el anuncio creado | Correcto. 201 con `autor`, `categoria` y `num_favoritos: 0` |
| Crear anuncio sin token | Devuelve 401 | Correcto. 401 `SIN_TOKEN` |
| Crear anuncio sin imagen | Devuelve 201 con la imagen a `null` | Correcto. 201 y `"imagen": null` |
| Crear anuncio con precio negativo | Devuelve 400 con el campo señalado | Correcto. 400 `VALIDACION` con `campo: "precio"` |
| Crear anuncio con categoría inexistente | Devuelve 400 | Correcto. 400 `VALIDACION` con `campo: "categoria"`, "La categoría no existe" |
| Crear anuncio con una imagen válida (multipart) | Devuelve 201 y la ruta de la imagen | Correcto. 201 y `"imagen": "18c61f62-8a0a-485e-81e3-0f01ba21ad2c.png"` |
| Crear anuncio con un fichero no permitido (p. ej. `.txt`) | Devuelve 400 | Correcto. 400 `VALIDACION` con `campo: "imagen"`, y no queda fichero en `uploads/` |
| Crear anuncio con imagen mayor de 5 MB | Devuelve 400 | Correcto. 5 MiB + 1 byte → 400 `VALIDACION`, "La imagen no puede superar los 5 MB". Con 5 MiB justos sí entra |
| `GET /clasify_api/uploads/:fichero` | Devuelve la imagen subida | Correcto. 200 con `content-type: image/png` |
| `GET /anuncios?pagina=1&limite=10` | Devuelve 200 con `datos` y `paginacion` | Correcto. 200 con los dos objetos y el total correcto |
| `GET /anuncios` sin filtros | Solo devuelve los disponibles | Correcto. De cinco anuncios en la tabla, uno vendido y cuatro disponibles: salen cuatro |
| `GET /anuncios?estado=vendido` | Solo los vendidos | Correcto. 200 con el anuncio vendido y solo ese |
| `GET /anuncios?estado=todos` | Todos | Correcto. 200 con los cinco |
| `GET /anuncios?estado=todo` | Devuelve 400 | Correcto. 400 `VALIDACION` con `campo: "estado"` |
| `GET /anuncios?texto=...` | Filtra por texto | Correcto. `?texto=mesa` → "Mesa de madera"; `?texto=MESA` también, la comparación no distingue mayúsculas |
| `GET /anuncios?categoria=...` | Filtra por categoría | Correcto. `?categoria=8` → "Bicicleta urbana" y "Bicicleta de montaña" |
| `GET /anuncios?texto=...&categoria=...&estado=...` | Combina los filtros | Correcto. Los tres a la vez devuelven lo esperado |
| `GET /anuncios?orden=precio_asc` | Ordena por precio ascendente | Correcto. `5.00 < 12.50 < 35.90 < 45.00 < 120.50` |
| `GET /anuncios?orden=titulo` | Devuelve 400 (orden no permitido) | Correcto. 400 `VALIDACION` con `campo: "orden"` |
| `GET /anuncios?limite=999` | Devuelve 400 (límite fuera de rango) | Correcto. 400 `VALIDACION` con `campo: "limite"` |
| `GET /anuncios/:id` | Devuelve el anuncio con autor, categoría y `num_favoritos` | Correcto. 200 con los tres; el autor sin `email` ni `password_hash` |
| `GET /anuncios/:id` inexistente | Devuelve 404 | Correcto. 404 `NO_ENCONTRADO`, "No existe el anuncio 999" |
| `GET /anuncios/abc` | Devuelve 400 con el campo señalado | Correcto. 400 `VALIDACION` con `campo: "id"` |
| `PATCH /anuncios/:id` siendo el autor | Devuelve 200 con los cambios | Correcto. 200; el título se guarda ya recortado y `7.5` vuelve como `"7.50"` |
| `PATCH /anuncios/:id` sin ser el autor | Devuelve 403 | Correcto. 403 `SIN_PERMISOS` con `carlos@example.com`, y el anuncio no cambia |
| `PATCH /anuncios/:id` con una imagen nueva | Cambia la imagen y borra la antigua | Correcto. 200 con un nombre nuevo; el fichero antiguo desaparece de `uploads/` |
| `PATCH /anuncios/:id/estado` siendo el autor | Cambia a vendido/disponible | Correcto. 200 `vendido` y luego 200 `disponible`; el estado guardado coincide |
| `PATCH /anuncios/:id/estado` con `VENDIDO` en mayúsculas | Devuelve 400 | Correcto. 400 `VALIDACION` con `campo: "estado"` |
| `PATCH /anuncios/:id/estado` sin ser el autor | Devuelve 403 | Correcto. 403 `SIN_PERMISOS` y el estado sigue siendo `disponible` |
| `DELETE /anuncios/:id` siendo el autor | Devuelve 204 y no queda nada | Correcto. 204 sin cuerpo; el anuncio da 404 después y su imagen desaparece de `uploads/` |
| `DELETE /anuncios/:id` sin ser el autor | Devuelve 403 | Correcto. 403 `SIN_PERMISOS` y el anuncio sigue en la base |

Al terminar se borraron los anuncios de prueba y sus ficheros, así que `backend/uploads/` vuelve a
tener solo el `.gitkeep`. **Los cuatro anuncios que dejó la I2 (ids 5 a 8) se siguen dejando**, tal y
como está escrito en `02-perfil.md`: se limpian en la I6.

### Tests automáticos

Con **Jest + Supertest** contra la API (base de datos de pruebas `clasify_test`):

- `tests/anuncios.test.js`, **84 pruebas**:
  - **Alta**: sin token (401), con datos válidos (201 y anuncio completo), autor sin `email` ni
    `password_hash`, `precio` como texto y como número, y **14 casos de validación** con su `campo`
    (precio negativo, con 3 decimales, no numérico y vacío; categoría inexistente, no numérica y
    ausente; título vacío y demasiado largo; descripción vacía, ausente y demasiado larga). Cada caso
    comprueba además que **no se crea ningún anuncio**.
  - **Imagen**: válida, los tres tipos permitidos (`jpeg`, `png`, `webp`), nombre del cliente
    descartado, `.txt` rechazado sin dejar fichero, más de 5 MB rechazado sin dejar fichero ni
    anuncio, y el fichero servido en `/clasify_api/uploads/:fichero` con su `content-type`.
  - **Listado**: formato y paginación, solo disponibles por defecto, los tres valores de `estado`, un
    `estado` inválido, búsqueda en título, en descripción, sin distinguir mayúsculas ni acentos, con
    los comodines escapados, texto que no aparece, filtro por categoría, los tres filtros a la vez,
    categoría inexistente, las cuatro ordenaciones, `orden` inválido, paginación y `limite` fuera de
    rango, y base sin anuncios.
  - **Detalle**: con autor, categoría y `num_favoritos`; autor sin `email`; `num_favoritos` contando
    dos favoritos reales; anuncio vendido visible; 404 con id inexistente; y 400 con los cuatro ids
    mal formados.
  - **Edición**: título, descripción y precio; cambio de categoría; un campo no enviado no se toca;
    401, 403 y 404; cuatro casos de validación; sustitución de imagen con borrado de la antigua;
    mandar solo una imagen; y no borrar la imagen que ya había cuando no se manda otra.
  - **Estado**: los dos sentidos, un vendido que desaparece del listado por defecto, tres casos de
    `estado` inválido, 401, 403 sin cambio y 404.
  - **Borrado**: 204 y anuncio desaparecido, borrado del fichero de imagen, borrado correcto aunque
    el fichero ya no esté, 401, 403 sin borrado y 404.
  - **`GET /categorias`**: con token y sin él.

  Dos cosas que hacen esta suite más rápida que `usuarios.test.js`, y que conviene tener presentes al
  leerla:
  - Los usuarios se insertan por SQL en el `beforeEach` y los tokens se firman con `firmarToken` en
    vez de registrarse por el endpoint. `bcrypt` con coste 12 tarda unos 300 ms y multiplicado por 84
    pruebas serían casi medio minuto sin ganar nada: el login ya está cubierto en `auth.test.js`.
  - `afterEach`/`afterAll` vacían `backend/uploads/`, porque los tests de imagen escriben ficheros
    de verdad y sin eso se acumularían en el repositorio.

Resultado obtenido el 30/09/2026 con `npm test`: **133 pruebas, 133 correctas, 0 fallidas**, en 66,7 s
(16 de `auth.test.js`, 33 de `usuarios.test.js` y 84 de `anuncios.test.js`).
Cobertura: 95,5 % de sentencias, 82,6 % de ramas, 97,6 % de funciones. Sube desde el 92,5 % de la I2.
Los ficheros nuevos quedan casi tapados: `anuncioService.js` al 98,9 %, `routes/anuncios.js`,
`categoriaService.js` y `subidaImagen.js` al 100 %. La única línea sin cubrir de `anuncioService.js`
es el `throw` que relanza un error inesperado al borrar un fichero, que haría falta simular `fs` para
probarla y no merece el montaje. `middleware/errores.js` sigue siendo el peor con 45,5 %: sus tres
caminos internos (JSON inválido, cuerpo demasiado grande y error no controlado) no los dispara
ningún test, porque hasta ahora ninguna ruta obliga a provocar uno. Quedan para la I6.

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: big-pickle
- Tipo: generación y revisión de código, con las decisiones de diseño y de alcance tomadas por el
  estudiante.

### Uso realizado

La IA se usó por partes, no de una sola vez:

1. **Preguntas antes de escribir código**: la IA leyó `03-anuncios.md`, `ARCHITECTURE.md` y
   `Diseno.md` §8-9, localizó los cuatro puntos que la SPEC dejaba abiertos (el estado en el listado,
   `GET /categorias`, el `conversacion` del detalle y si la imagen era obligatoria) y preguntó por
   ellos en vez de elegir. De ahí salieron las cuatro primeras decisiones de *Ajustes*.
2. **Segunda ronda de preguntas**: ya con el código planeado, preguntó otras cuatro cosas que
   cambiaban la forma de la respuesta y del código: qué devuelve cada fila del listado, si el filtro
   de estado llegaba también al listado por usuario, qué devuelve el `DELETE` y cómo se valida un
   `precio` que llega como texto en multipart y como número en JSON.
3. **Generación del código**: `middleware/subidaImagen.js`, `services/anuncioService.js`,
   `services/categoriaService.js`, `routes/anuncios.js`, `routes/categorias.js`, los validadores de
   anuncios añadidos a `middleware/validar.js` y los 84 tests de `anuncios.test.js`.
4. **Corrección durante la implementación**: la IA detectó al montar los tests que
   `PATCH /anuncios/:id/estado` devolvía 500 porque los tests le mandaban `multipart` y esa ruta no
   lleva `subirImagen` (se decidió que vaya en JSON, que es lo natural para un cuerpo de un campo), y
   que dos expectativas sobre la ordenación por defecto estaban calculadas como si las fechas fueran
   distintas, cuando los cuatro anuncios de prueba nacen en el mismo segundo y desempata el `id`.

Lo que **no** hizo la IA: decidir el comportamiento por defecto del listado, si `GET /categorias` iba
en esta iteración, qué hacer con el `conversacion` del detalle, si la imagen era obligatoria, qué
devolvía el `DELETE`, ni la forma de la respuesta del listado, ni cómo se valida el `precio`.
Esas siete las decidió el estudiante tras ver las opciones.

### Prompt importante 1

> "antes de empezar la iteración 3, comprueba que esta todo correcto en la iteración 2, además luego
> lee todo lo de la iteración 3 y dime si tienes dudas en cuanto a alguna cosa y antes de hacer los
> commits dejame que revise todo antes de hacerlos y dejarla cerrada. Recalco haz preguntas."

El prompt que condicionó toda la iteración. La revisión de la I2 no fue un "sí, funciona": se
contrastó cada afirmación del documento con el código, con la base de datos, con la cobertura
recalculada y con el historial de git, y salieron cinco datos falsos que se corrigieron en el
documento (entre ellos, una cobertura de funciones que estaba 2,1 puntos por encima de la real y una
afirmación de que unos anuncios de prueba se habían borrado cuando seguían en la base). Las ocho
preguntas de diseño se hicieron antes de implementar nada.

### Prompt importante 2

> "Estabas a medias de esta tarea pero se te ha cerrado sin querer, revisa todo para ver donde te
> encontrabas y sigue"

El trabajo estaba en un commit sin terminar de `docs/iterations/02-perfil.md`, en mitad de una pasada
de corrección. La IA lo retomó desde `git status` y el diff, antes de tocar nada de la I3.

### Resultado

- 133 pruebas, 133 correctas, con 84 nuevas de esta iteración.
- `npm test -- --coverage`: 95,5 % de sentencias, 97,6 % de funciones.
- Los 31 casos del `TEST_PLAN` verificados sobre el servidor real con `curl`, no solo con los tests.
- Los cinco datos erróneos de la I2 corregidos y la base de desarrollo dejada como estaba.
- Los cuatro ficheros de imagen que dejaron los tests borrados de `uploads/`.

### Decisión del estudiante

Lo que se aceptó de lo propuesto por la IA:

- **`GET /anuncios` sale solo con los disponibles por defecto**, con `?estado=vendido|todos` para ver
  el resto. Es lo que hacen Wallapop y Milanuncios, y una portada llena de cosas ya vendidas no sirve
  para nada.
- **Meter `GET /categorias` en la I3**, aunque no estaba en el PLAN, porque es donde la necesita el
  filtro y la tabla ya está sembrada.
- **`num_favoritos` en el detalle y `conversacion` en la I5.** Se cumple el requisito de "elemento +
  recurso" sin adelantar una tabla de la I5.
- **La imagen opcional, con multipart siempre.** Da más libertad y el único coste es que un anuncio
  puede no tener foto.
- **Listado ligero sin autor ni categoría dentro**, igual que el listado de anuncios de un usuario que
  ya existía.
- **`DELETE` con 204**, por coherencia con lo que la I4 ya especificaba para quitar favoritos.
- **Validar el precio antes de MySQL**, para que `45.678` dé error en lugar de guardarse como `45.68`.

Lo que se cambió o rechazó de lo generado:

- El manejo de los errores de multer se movió de `middleware/errores.js` al propio middleware de
  subida, para que el manejador central no sepa nada de un recurso concreto. `errores.js` queda como
  estaba y sigue sin tener cobertura de sus caminos internos.
- La lista de órdenes permitidos no se duplicó en el validador: se exporta desde el servicio y la
  importa el validador, así que no pueden dejar de coincidir.
- En el detalle no se hace una consulta aparte para el autor y otra para la categoría: un solo `JOIN`
  con los dos, y el número de favoritos como subconsulta en la misma frase `SELECT`.

### Correcciones manuales

1. Los primeros tests de `PATCH /anuncios/:id/estado` fallaban con **500 en vez de 400**. La causa no
   era del código de la ruta sino de los tests, que mandaban `multipart/form-data` a una ruta que no
   lleva `subirImagen` y por tanto no tenía `req.body`. Se corrigió: esa ruta va en JSON, que es
   lo natural para un cuerpo de un solo campo, y los tests se pasaron a `.send()`. Merece la pena
   dejarlo escrito porque el 500 no era un fallo del `try`/`catch` del manejador central, sino una
   ruta a la que se le pedía algo que no había.
2. Dos expectativas de ordenación estaban mal calculadas. Los cuatro anuncios del `beforeEach` se
   insertan en el mismo segundo, así que `fecha_creacion` es idéntica para los cuatro y el orden real
   lo decide el `id DESC` del desempate. Las expectativas se corrigieron, y el comentario que lo
   explica se dejó en el test porque es justo el caso que hace visible para qué sirve el segundo
   criterio de ordenación.
3. Un caso de la tabla de validación ("categoría ausente") no probaba nada: se escribía como un
   objeto vacío que se extendía sobre los campos válidos, así que la categoría seguía estando y la
   petición se creaba bien. Se rehizo como un `test.each` sobre `descripcion` y `categoria` que borra
   la clave de verdad.

4. **Encontrado en la revisión previa a la I4, y arreglado allí.** `subirImagen` (multer) escribe el
   fichero antes de que se compruebe el cuerpo de la petición y antes de que se compruebe quién es el
   autor, así que una imagen aceptada por el filtro que luego recibía un 400 o un 403 se quedaba en
   `uploads/` sin que nada la referenciara. Ninguno de los 84 tests de esta iteración lo veía, porque
   no había ningún caso que combinara una imagen válida con una petición rechazada después. El
   arreglo y sus cuatro pruebas de regresión están en
   [04-favoritos.md](04-favoritos.md#correcciones-manuales). Se deja anotado aquí para que el
   apartado de la subida de esta iteración no dé por hecho un comportamiento que todavía no tenía.

## COMMITS RELACIONADOS

- `2bea538` - `añadir(anuncios): endpoint de categorías para el filtro del listado`
- `f9a1088` - `añadir(anuncios): CRUD con búsqueda, filtros, estado e imagen`
- `20e8115` - `probar(anuncios): 84 tests del CRUD, la imagen y los filtros`
- `637c041` - `corregir(docs): corrige cinco datos falsos del documento de I2`
- `f7301df` - `documentar(docs): actualiza los resultados de I3`
