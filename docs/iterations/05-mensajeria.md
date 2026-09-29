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

- (Vacío si no ha habido cambios)

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

Pendiente de completar tras implementar.

### Riesgos o dudas

- Decidir si un anuncio vendido sigue permitiendo iniciar conversaciones.
- Resuelto: si `GET /anuncios/:id/mensajes` lo pide el vendedor devuelve 400 (debe usar
  `/usuarios/me/conversaciones`).

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| Iniciar conversación en un anuncio ajeno | Devuelve 201 con el mensaje creado | |
| Escribir dos veces en el mismo anuncio | Se reutiliza la misma conversación | |
| Iniciar conversación sin token | Devuelve 401 | |
| El vendedor intenta iniciar su propia conversación | Devuelve 400 | |
| El vendedor pide `GET /anuncios/:id/mensajes` | Devuelve 400 (debe usar `/usuarios/me/conversaciones`) | |
| Comprador lista los mensajes de su conversación | Devuelve 200 y marca como leído | |
| Un tercer usuario intenta leer la conversación | Devuelve 403 | |
| Vendedor lista `GET /usuarios/me/conversaciones` | Incluye la conversación del comprador | |
| Enviar mensaje en una conversación ajena | Devuelve 403 | |
| Conversación inexistente | Devuelve 404 | |

### Tests automáticos

- `mensajeria.test.js`: iniciar/reutilizar conversación, envío, listado paginado, marcado de leído
  y autorización por participante (401, 403, 404, 400).

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
