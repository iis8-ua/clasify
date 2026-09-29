# Iteración 01 - Setup y autenticación

## SPEC

### Objetivo

Poner en marcha el proyecto desde cero: repositorio git y `.gitignore`, estructura de carpetas,
configuración del backend, conexión con la base de datos, modelo de datos y autenticación de
usuarios.

### Requisitos

Funcionales:

- Registrar un usuario con email, nombre y contraseña.
- Hacer login y recibir un token JWT.
- Cerrar sesión en el cliente (el token se descarta).
- Una petición protegida rechaza peticiones sin token o con token inválido.
- No se pueden registrar dos usuarios con el mismo email.

Técnicos:

- Repositorio **git** inicializado en la raíz `P1/`, con un `.gitignore` que excluye `node_modules/`,
  `.env`, `backend/uploads/` (salvo `.gitkeep`) y `coverage/`.
- Estructura de carpetas del backend: `backend/src/{routes,services,middleware,db}`, `backend/tests`
  y `backend/uploads` (con `.gitkeep` para que la carpeta exista en el repo).
- Backend Node/Express con API REST bajo el prefijo `/clasify_api/`.
- Dependencias instaladas: `express`, `mysql2`, `jsonwebtoken`, `bcrypt`, `multer` y, para pruebas,
  `jest` y `supertest`.
- MySQL como base de datos, accesible con `mysql2`.
- Esquema creado con las tablas `usuarios`, `categorias`, `anuncios`, `favoritos`, `conversaciones` y `mensajes` según `ARCHITECTURE.md`.
- Contraseñas almacenadas como hash, nunca en claro.
- Validación de entradas en el backend (campos obligatorios, formato de email, contraseña).
- El script de creación del esquema debe poder ejecutarse más de una vez sin fallar.

### Fuera de alcance

- Perfil de usuario (ver/editar perfil propio y perfil público).
- Anuncios (CRUD completo, búsqueda, filtros y paginación).
- Favoritos.
- Conversaciones y mensajería.
- Frontend (solo se deja la base de la API).

### Ajustes durante la iteración

- (Vacío si no ha habido cambios)

## PLAN

1. Inicializar el repositorio git en la raíz `P1/`.
2. Crear el `.gitignore` (`node_modules/`, `.env`, `backend/uploads/` salvo `.gitkeep`, `coverage/`, `*.log`, `.DS_Store`).
3. Crear la estructura de carpetas del backend: `backend/src/{routes,services,middleware,db}`, `backend/tests` y `backend/uploads` con `.gitkeep`.
4. Inicializar el proyecto Node (`package.json`) e instalar las dependencias (`express`, `mysql2`, `jsonwebtoken`, `bcrypt`, `multer`, `jest`, `supertest`).
5. Configurar las variables de entorno (`.env` y `.env.example`) y el pool de conexión con `mysql2`.
6. Crear el script de esquema (`schema.sql`) a partir del modelo de datos de `ARCHITECTURE.md`, con las convenciones de MySQL definidas allí.
7. Cargar datos iniciales: categorías y usuarios de prueba.
8. Crear `src/services/authService.js` para el hash y la verificación de contraseñas.
9. Crear `src/routes/auth.js` con `/auth/register` y `/auth/login`.
10. Crear `src/middleware/auth.js` con la verificación del token JWT.
11. Añadir un endpoint protegido de prueba para comprobar que el middleware bloquea peticiones sin token válido.
12. Validar entradas en los endpoints de autenticación.
13. Hacer el primer commit de la iteración (setup + autenticación).

### Revisión del estudiante

Pendiente de completar tras implementar.

### Riesgos o dudas

- Confirmar la versión de MySQL disponible en el entorno de desarrollo.
- Decidir si el seed de usuarios de prueba se ejecuta desde el script de esquema o desde un script aparte.

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| El servidor arranca con la base de datos disponible | Arranca sin errores y responde | |
| El repositorio git está inicializado en `P1/` | `git status` funciona y hay historial de commits | |
| `.gitignore` excluye `node_modules/`, `.env` y subidas | No aparecen en `git status` | |
| La carpeta `backend/uploads/` se conserva en el repo | El `.gitkeep` está versionado | |
| El script de esquema se ejecuta dos veces | La segunda ejecución no falla | |
| Registro con email, nombre y contraseña válidos | Devuelve 201 y el usuario creado | |
| Registro con email ya existente | Devuelve 409 con mensaje de error | |
| Registro con email inválido o contraseña corta | Devuelve 400 con el campo señalado | |
| Login con credenciales correctas | Devuelve 200 y un token JWT | |
| Login con contraseña incorrecta | Devuelve 401 con mensaje de error | |
| Petición protegida con token válido | Devuelve 200 | |
| Petición protegida sin token | Devuelve 401 | |
| Petición protegida con token inválido o caducado | Devuelve 401 | |

### Tests automáticos

Con **Jest + Supertest** contra la API (base de datos de pruebas `clasify_test`):

- `auth.test.js`: registro válido (201 + token), email duplicado (409), validaciones (400),
  login correcto (200 + token), login incorrecto (401) y petición protegida sin token o con token
  inválido (401).

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

- Pendiente. Se rellenará con los hashes después de crear los commits de la iteración (los hashes se añaden en un commit posterior de documentación; no es necesario registrar el hash de ese último commit).
