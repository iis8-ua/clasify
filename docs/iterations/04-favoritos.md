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

- (Vacío si no ha habido cambios)

## PLAN

1. Crear `src/services/favoritoService.js` con alta, baja y listado paginado de favoritos.
2. Crear `src/routes/favoritos.js` con las rutas de alta, baja y listado.
3. Implementar la idempotencia del alta (`INSERT ... ON DUPLICATE KEY` o comprobación previa).
4. Añadir la comprobación del anuncio (404) y del propio anuncio (400).
5. Validar que el listado respeta la paginación común.
6. Escribir las pruebas automáticas de la iteración.

### Revisión del estudiante

Pendiente de completar tras implementar.

### Riesgos o dudas

- Resuelto: el alta devuelve 201 la primera vez y 200 si ya estaba.

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| Añadir a favoritos un anuncio ajeno | Devuelve 201 | |
| Añadir dos veces el mismo anuncio | La segunda devuelve 200 y no duplica | |
| Añadir a favoritos sin token | Devuelve 401 | |
| Añadir a favoritos un anuncio inexistente | Devuelve 404 | |
| Añadir a favoritos tu propio anuncio | Devuelve 400 | |
| `GET /usuarios/me/favoritos` | Devuelve 200 con el formato paginado | |
| Quitar un favorito existente | Devuelve 204 | |
| Quitar un favorito que no existía | Devuelve 404 | |
| Consultar los favoritos de otro usuario | No es posible (solo `/usuarios/me`) | |

### Tests automáticos

- `favoritos.test.js`: alta idempotente, sin duplicados, baja, listado paginado y reglas de acceso
  (401, 400 propio, 404 inexistente).

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
