# Iteración 02 - Perfil de usuario

## SPEC

### Objetivo

Permitir consultar el perfil público de cualquier usuario y que cada usuario autenticado vea y
edite su propio perfil.

### Requisitos

Funcionales:

- `GET /usuarios/me` (JWT) devuelve el perfil propio, incluyendo el email.
- `PATCH /usuarios/me` (JWT) permite editar nombre, biografía y contraseña del propio usuario.
- `GET /usuarios/:id` devuelve el perfil público (id, nombre, biografía, fecha de alta) **sin email**.
- `GET /usuarios/:id/anuncios` devuelve los anuncios del usuario de forma paginada.
- Un usuario solo puede editar su propio perfil; no existe forma de editar el de otro.

Técnicos:

- Las rutas de `/usuarios/me` usan el middleware de JWT; `/usuarios/:id` es pública.
- Al cambiar la contraseña se vuelve a aplicar el hash (nunca se guarda en claro).
- El email no se puede cambiar en esta versión.
- Validación de entradas: nombre obligatorio, longitudes acotadas, contraseña con longitud mínima.

### Fuera de alcance

- Foto de perfil / avatar.
- Cambio de email.
- Borrado de la propia cuenta.

### Ajustes durante la iteración

- (Vacío si no ha habido cambios)

## PLAN

1. Crear `src/services/usuarioService.js` con las consultas de perfil (público y propio) y la
   actualización del perfil (incluido el re-hash de la contraseña).
2. Crear `src/routes/usuarios.js` con `GET /usuarios/:id`, `GET /usuarios/me`, `PATCH /usuarios/me`
   y `GET /usuarios/:id/anuncios`.
3. Reutilizar el helper de paginación para `GET /usuarios/:id/anuncios`.
4. Definir la proyección del perfil público para no exponer `email` ni `password_hash`.
5. Validar las entradas del `PATCH` y devolver el error uniforme.
6. Escribir las pruebas automáticas de la iteración.

### Revisión del estudiante

Pendiente de completar tras implementar.

### Riesgos o dudas

- Decidir si se permite que `PATCH /usuarios/me` acepte el email vacío sin modificarlo.
- Confirmar si el perfil público debe incluir el número de anuncios publicados.

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `GET /usuarios/me` con token válido | Devuelve 200 con el perfil y el email | |
| `GET /usuarios/me` sin token | Devuelve 401 | |
| `GET /usuarios/:id` de otro usuario | Devuelve 200 y **no** incluye el email | |
| `GET /usuarios/:id` con id inexistente | Devuelve 404 | |
| `PATCH /usuarios/me` cambiando el nombre | Devuelve 200 con el perfil actualizado | |
| `PATCH /usuarios/me` con nombre vacío | Devuelve 400 con el campo señalado | |
| `PATCH /usuarios/me` cambiando la contraseña | Se puede hacer login con la nueva contraseña | |
| `GET /usuarios/:id/anuncios` | Devuelve 200 con el formato paginado | |

### Tests automáticos

- `usuarios.test.js`: perfil propio, perfil público (sin email), edición del perfil, 401 sin token,
  404 con id inexistente y validación de entradas.

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
