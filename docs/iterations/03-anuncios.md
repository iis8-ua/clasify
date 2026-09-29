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

- (Vacío si no ha habido cambios)

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

Pendiente de completar tras implementar.

### Riesgos o dudas

- Resuelto: la ordenación se pasa en un único parámetro `orden` con valores
  `fecha_desc|fecha_asc|precio_desc|precio_asc`.
- Decidir si el listado incluye anuncios vendidos por defecto o permite filtrarlos (decisión
  pendiente durante la iteración).

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| Crear anuncio con datos válidos y token | Devuelve 201 con el anuncio creado | |
| Crear anuncio sin token | Devuelve 401 | |
| Crear anuncio con precio negativo | Devuelve 400 con el campo señalado | |
| Crear anuncio con categoría inexistente | Devuelve 400 | |
| Crear anuncio con una imagen válida (multipart) | Devuelve 201 y la ruta de la imagen | |
| Crear anuncio con un fichero no permitido (p. ej. `.txt`) | Devuelve 400 | |
| Crear anuncio con imagen mayor de 5 MB | Devuelve 400 | |
| `GET /clasify_api/uploads/:fichero` | Devuelve la imagen subida | |
| `GET /anuncios?pagina=1&limite=10` | Devuelve 200 con `datos` y `paginacion` | |
| `GET /anuncios?texto=...&categoria=...` | Filtra correctamente | |
| `GET /anuncios?orden=precio_asc` | Ordena por precio ascendente | |
| `GET /anuncios?limite=999` | Devuelve 400 (límite fuera de rango) | |
| `GET /anuncios/:id` | Devuelve el anuncio con autor, categoría y `num_favoritos` | |
| `GET /anuncios/:id` inexistente | Devuelve 404 | |
| `PATCH /anuncios/:id` siendo el autor | Devuelve 200 con los cambios | |
| `PATCH /anuncios/:id` sin ser el autor | Devuelve 403 | |
| `PATCH /anuncios/:id/estado` siendo el autor | Cambia a vendido/disponible | |
| `DELETE /anuncios/:id` sin ser el autor | Devuelve 403 | |

### Tests automáticos

- `anuncios.test.js`: creación (incluida la subida de imagen y sus validaciones), listado con
  filtros y paginación, detalle, edición, cambio de estado y borrado, comprobando 401/403/404.

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: (por completar)
- Tipo: (por completar)

### Uso realizado

Pendiente de completar durante la iteración.

### Prompt importante 1

Pendiente de completar.

### Resultado

Pendiente de completar.

### Decisión del estudiante

Pendiente de completar: qué se aceptó y qué se rechazó de lo propuesto por la IA.

### Correcciones manuales

Pendiente de completar.

## COMMITS RELACIONADOS

- Pendiente. Se rellenará con los hashes después de crear los commits de la iteración.
