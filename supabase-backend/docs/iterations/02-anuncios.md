# Iteración 02 - Anuncios (Supabase)

## SPEC

### Objetivo

Implementar las operaciones sobre el recurso principal (anuncios) en la capa de servicios Supabase.

### Requisitos

Funcionales:

- `crearAnuncio(datos)` crea un anuncio del usuario autenticado.
- `listarAnuncios({ texto, categoria, pagina, limite })` devuelve los anuncios paginados y permite
  buscar por texto y filtrar por categoría.
- `obtenerAnuncio(id)` devuelve un anuncio.
- `actualizarAnuncio(id, datos)` y `eliminarAnuncio(id)` solo sobre anuncios propios.
- `listarCategorias()` devuelve las categorías para los filtros.

Técnicos:

- Políticas RLS en `anuncios`: lectura pública y escritura solo del autor (`auth.uid() = id_autor`).
- Paginación con `.range()`.
- Validación de campos (título, descripción, precio `>= 0`, categoría existente).
- Los servicios encapsulan las consultas; el cliente no usa `supabase.from` directamente.

### Fuera de alcance

- Favoritos y mensajería.
- Subida real de imágenes (la imagen se guarda como URL/nombre).

### Ajustes durante la iteración

1. **`cliente.from('anuncios')` sin `select()` no tiene filtros.** El objeto que devuelve `from()`
   solo expone `select`, `insert`, `update`, `upsert` y `delete`; `eq`, `order`, `or` y `range` viven
   en el objeto que devuelve `select()`. La primera versión encadenaba los filtros sobre `from()` y
   fallaba con `consulta.order is not a function`. El orden correcto es `from().select()` y luego
   filtrar, así que el helper de filtros recibe la consulta ya con su `select`.
2. **`anuncios.id` es un UUID, no un entero.** `obtenerAnuncio(999)` llegaba a Postgres y devolvía
   `invalid input syntax for type uuid`, que es un error interno de la base de datos y no un 404 ni
   un fallo de validación. Ahora se comprueba el formato antes de consultar.
3. **El total sale de una segunda petición.** El `count` que viene en la respuesta de una página es
   el número de filas de esa página, no el total de la tabla. Con el valor de la página, el bloque de
   paginación habría dicho siempre que hay una sola página. El total se pide aparte con
   `select('id', { count: 'exact', head: true })`, en paralelo a los datos.
4. **Orden por precio.** `precio` es `NUMERIC`, así que PostgREST ordena por valor y no por texto. No
   aparece el problema de "100" antes que "20" que daría ordenar por texto. Se aceptan los cuatro
   órdenes del backend propio: `fecha_desc` (por defecto), `fecha_asc`, `precio_desc` y `precio_asc`.
5. **RLS no da error al bloquear, y eso obliga a comprobar.** Un `update` o un `delete` sobre una
   fila que RLS filtra no falla: no toca nada y no devuelve error. Para poder decir 403 en vez de
   fingir que se escribió algo, después de un `update` sin filas se mira si la fila existe con el
   cliente público: si existe es que era de otro usuario, y si no es que no existía.
6. **`%` y `_` en la búsqueda.** Sin escapar, un `like` los trata como comodines y buscar "100%"
   trae todo. Se escapan antes de añadir los `%` de surround.

### PLAN

1. Crear la tabla `anuncios` con las claves foráneas a `perfiles` y `categorias`.
2. Configurar RLS en `anuncios`.
3. Implementar `src/services/anuncioService.js` y `src/services/categoriaService.js`.
4. Implementar la paginación con `.range()`.
5. Validar las entradas y devolver errores coherentes.
6. Escribir las pruebas con Jest sobre la capa de servicios.

### Revisión del estudiante

Lo importante de esta iteración es que **las políticas RLS son la única cosa que protege los
anuncios de su autor**, porque no hay servidor propio entremedo. Se revisó que hubiera cuatro
políticas distintas (insert, select, update y delete) y que cada una comprobara `auth.uid()`, en vez
de una sola con `FOR ALL`: con `FOR ALL` una escritura se comprobaría con la misma condición que una
lectura, y eso no encaja.

Se revisó también que el `id_autor` no venga del cuerpo de la petición. El servicio lo pone siempre
con el id del token, sobreescribiendo lo que venga, y la política lo vuelve a comprobar. Las dos
capas hacen falta: la del servicio evita el error antes de gastar una escritura, y la de la base de
datos es la que de verdad protege, porque a la base de datos se puede llegar saltándose el servicio.

El precio se convierte a número en la capa. `NUMERIC` no es un número de JavaScript y PostgREST lo
devuelve como cadena para no perder precisión; aquí se convierte porque es un importe pequeño y quien
lo consume lo va a comparar y ordenar. Es la misma decisión que con `valoracion_media` en el backend
propio.

### Riesgos o dudas

- **Comprobar que RLS impide de verdad editar y eliminar anuncios ajenos.** Es un riesgo resuelto,
  con dos tests que lo intentan de verdad y comprueban que la fila no ha cambiado: uno edita con el
  token de B un anuncio de A y lee que el título sigue siendo el de A, y otro borra y comprueba que
  el anuncio sigue ahí. Si RLS no estuviera bien, ambos fallarían.
- **Los ids de los tests.** No se puede usar un id fijo porque el proyecto no se limpia entre
  ejecuciones. Todos los tests comparan con el id que devuelve la propia creación o con un texto
  único en el título.

### Verificación en base de datos

- RLS activo en `anuncios`, con las cuatro políticas creadas.
- Lectura pública confirmada: un listado sin sesión devuelve anuncios.
- Escritura sin sesión rechazada con `SIN_PERMISOS`.

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `crearAnuncio` autenticado | Crea el anuncio | Anuncio `d608e94e…` con autor y categoría embebidos |
| `crearAnuncio` sin sesión | Falla (RLS / error de auth) | `SIN_PERMISOS` |
| `listarAnuncios` con `pagina`/`limite` | Devuelve la página correcta | 5 filas por página, 89 en total, 18 páginas |
| `listarAnuncios` con `texto` y `categoria` | Filtra correctamente | Coincide con categoría 1, no con la 8 |
| `actualizarAnuncio` de otro usuario | Falla (RLS) | `SIN_PERMISOS` y el título sigue intacto |
| `eliminarAnuncio` propio | Elimina el anuncio | `obtenerAnuncio` devuelve `null` después |
| `listarCategorias` | Devuelve las categorías | 8 categorías, ordenadas por nombre |

### Tests automáticos

- `tests/anuncios.test.js`: crear, editar, cambiar estado, borrar, y los permisos cruzados.
- `tests/validacionAnuncio.test.js`: validación pura de título, descripción, precio, categoría y
  estado, sin tocar la red, para poder distinguir un fallo de validación de un fallo de Supabase.
- `tests/listado.test.js`: paginación, cálculo de páginas y escapado de comodines.
- `tests/lecturaPublica.test.js`: listado y categorías sin sesión.

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: big-pickle
- Tipo: IA asistente de programación

### Uso realizado

La IA propuso la tabla, las políticas, los servicios, el helper de paginación y los tests. El
estudiante revisó y corrigió. Los cinco primeros puntos de "Ajustes durante la iteración" los
encontró la propia IA al probar, no el estudiante, y son la razón de que la iteración tenga
comprobaciones manuales: los tests automáticos, tal como estaban escritos, pasaban mientras el
listado de anuncios no funcionaba en absoluto.

El más importante es el 1. Los tests de listado fallaron con `consulta.order is not a function`, que
no es un error de RLS ni de validación sino de que se estaba usando mal la API del cliente, y eso no
lo caza un test de permisos. Por eso hay una comprobación manual de que el listado trae filas y trae
el total.

### Prompt importante 1

> Implementa la iteración de anuncios siguiendo el SPEC de
> `supabase-backend/docs/iterations/02-anuncios.md`. Antes de escribir código, decide y pregunta
> cualquier punto que sea dudoso: en concreto de dónde sale el total de la paginación, cómo se
> distingue en el servicio entre "no existe" y "no tienes permiso" cuando RLS bloquea sin dar error,
> y qué tipo tiene el id del anuncio. Avisa antes de commitear y enséñame el reparto de commits.

### Resultado

- 105 tests en verde contra el proyecto real, de los cuales 47 son de esta iteración.
- Las siete comprobaciones manuales de la tabla, hechas con un script contra el proyecto real.
- El listado público se comprobó sin sesión: 89 anuncios en total y 18 páginas de 5.

### Decisión del estudiante

- **El orden por precio se acepta en `NUMERIC` y no en texto**, porque ordenar por texto daría
  "100" antes que "20". Se documenta la excepción, igual que la del precio en el backend propio.

### Correcciones manuales

- Se comprobó con `pg` que las cuatro políticas de RLS existen y que `anon` puede leer pero no
  escribir, en lugar de fiarse de que el código las crea.

## COMMITS RELACIONADOS

- `2e7f05e` - `tarea(supabase)`: migración inicial, proyecto Node y `.env.example`
- `71d8e40` - `añadir(supabase)`: capa de servicios de auth, perfil, anuncios y categorías
- `672b401` - `probar(supabase)`: 105 pruebas contra el proyecto real de Supabase
- `cfa45ec` - `documentar(supabase)`: arquitectura, iteraciones y puesta en marcha
- `1fb7ac3` - `documentar(docs)`: sitúa I7 en el README raíz y en el diseño

> La convención de commits y el proceso de la iteración están en `CONTRIBUTING.md`.