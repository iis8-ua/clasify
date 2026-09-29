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

- (Vacío si no ha habido cambios)

## PLAN

1. Crear la tabla `anuncios` con las claves foráneas a `perfiles` y `categorias`.
2. Configurar RLS en `anuncios`.
3. Implementar `src/services/anuncioService.js` y `src/services/categoriaService.js`.
4. Implementar la paginación con `.range()`.
5. Validar las entradas y devolver errores coherentes.
6. Escribir las pruebas con Jest sobre la capa de servicios.

### Revisión del estudiante

Pendiente de completar tras implementar.

### Riesgos o dudas

- Comprobar que RLS impide de verdad editar/eliminar anuncios ajenos en las pruebas.

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `crearAnuncio` autenticado | Crea el anuncio | |
| `crearAnuncio` sin sesión | Falla (RLS / error de auth) | |
| `listarAnuncios` con `pagina`/`limite` | Devuelve la página correcta | |
| `listarAnuncios` con `texto` y `categoria` | Filtra correctamente | |
| `actualizarAnuncio` de otro usuario | Falla (RLS) | |
| `eliminarAnuncio` propio | Elimina el anuncio | |
| `listarCategorias` | Devuelve las categorías | |

### Tests automáticos

- `anuncios.test.js`: crear, listar (paginación y filtros), obtener, actualizar, eliminar y
  comprobación de que no se pueden modificar anuncios ajenos.

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

Pendiente de completar.

### Correcciones manuales

Pendiente de completar.

## COMMITS RELACIONADOS

- Pendiente. Se rellenará con los hashes después de crear los commits de la iteración.
