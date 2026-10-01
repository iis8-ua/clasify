# Clasify

Marketplace de anuncios clasificados al estilo de Wallapop o Milanuncios. Los usuarios publican
anuncios de artículos para venderlos a otros usuarios del sitio: se listan los anuncios más
recientes, se pueden buscar y filtrar por texto y categoría, y cualquier visitante ve el detalle
completo de un anuncio.

Un usuario autenticado puede publicar, editar, marcar como vendidos o eliminar sus anuncios, guardar
anuncios ajenos en favoritos y contactar con el vendedor mediante un sistema de mensajería interno
ligado a cada anuncio.

## Funcionalidades

- Registro y login con **tokens JWT** (el logout se hace en el cliente descartando el token)
- Perfil de usuario público y edición del perfil propio
- Anuncios: alta, listado paginado con búsqueda, filtro y ordenación, detalle, edición, cambio de
  estado y borrado, con autorización por propietario
- Subida de imágenes (`multipart/form-data`) servidas de forma estática
- Favoritos sin duplicados (recurso secundario)
- Mensajería privada comprador–vendedor mediante la entidad `Conversacion` (recurso secundario)
- Códigos de error uniformes y validación de entradas en el backend

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express 5 (API REST bajo `/clasify_api/`) |
| Base de datos | MySQL, con el cliente `mysql2` |
| Autenticación | JWT (HS256) + `bcrypt` |
| Ficheros | `multer` |
| Pruebas | Jest + Supertest |

Como **requerimiento adicional** se desarrolla un segundo backend con **Supabase**, en un subproyecto
independiente (`supabase-backend/`), que expone una capa de servicios aislando al cliente del API de
Supabase. No es necesario para usar el backend propio, y no comparte base de datos con `backend/`.

La diferencia de fondo es dónde se aplican las reglas: aquí no hay servidor propio, así que buena
parte de la lógica vive en la base de datos con RLS y no en código. La capa se implementó en la
iteración 7; su puesta en marcha está en `supabase-backend/README.md`.

## Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 20.6 o superior (probado con 26.8) |
| MySQL | 8.0 o superior (probado con 8.0.46) |

Hace falta un usuario de MySQL con permiso para crear bases de datos, porque los scripts de
instalación crean tanto la base de la aplicación como la de las pruebas.

## Puesta en marcha

```bash
cd backend
npm install
cp .env.example .env        # y ajustar las credenciales de MySQL y el secreto JWT
npm run db:create-databases # crea clasify y clasify_test
npm run db:schema           # tablas e índices
npm run db:seed             # categorías y usuarios de prueba (Clasify123!)
npm start                   # http://localhost:3000/clasify_api
```

El esquema es idempotente (`CREATE TABLE IF NOT EXISTS`), así que `db:schema` y `db:seed` se
pueden volver a ejecutar sin romper nada.

### Variables de entorno

Todas están en `backend/.env`, que no se versiona. `backend/.env.example` las documenta con
valores de ejemplo. Las que hay:

| Variable | Para qué |
|---|---|
| `PORT` | Puerto del servidor |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión a MySQL |
| `DB_POOL_SIZE` | Conexiones máximas del pool |
| `DB_TEST_NAME` | Base de datos que usan los tests (`clasify_test`) |
| `JWT_SECRET` | Secreto de firma HS256, **hay que cambiarlo** |
| `JWT_EXPIRES_IN` | Vigencia del token (`7d`) |
| `SEED_PASSWORD` | Contraseña de los usuarios que crea el seed |

El detalle de cada una está en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Pruebas

```bash
cd backend
npm test
```

Son 297 pruebas de Jest + Supertest que hacen peticiones HTTP reales contra la API. Antes de
cada prueba se ejecuta el esquema sobre `DB_TEST_NAME` y se vacían las tablas, así que la base
de desarrollo no se toca y no hace falta limpiarla a mano. La configuración del JWT de las
pruebas está aparte en `backend/tests/prepararEntorno.js`.

Para ver la cobertura: `npm test -- --coverage`.

## Estructura

```
.
├── CONTRIBUTING.md          Convención de commits y proceso de trabajo
├── Diseno.md                Documento de diseño (v0.2)
├── backend/                 Backend propio (Node/Express + MySQL)
│   ├── src/
│   │   ├── routes/          Rutas HTTP
│   │   ├── services/        Lógica de negocio
│   │   ├── middleware/      Autenticación, validación, errores, imágenes
│   │   ├── db/              Pool, esquema y seed
│   │   └── helpers/
│   ├── tests/
│   ├── uploads/             Imágenes subidas por los usuarios
│   └── .env.example
├── docs/                    Documentación SDD del backend propio
│   ├── PROJECT_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── AI_SUMMARY.md
│   └── iterations/          SPEC, PLAN y TEST_PLAN de cada iteración
└── supabase-backend/        Segundo backend (Supabase) con su propio SDD
    ├── migrations/          SQL de esquema, RLS, trigger y RPC
    ├── src/services/        Capa de servicios (auth, perfil, anuncios, categorías)
    ├── tests/               Jest contra el proyecto real de Supabase
    └── docs/                PROJECT_SPEC, ARCHITECTURE e iteraciones propias
```

## Metodología

El proyecto se desarrolla con **SDD (Spec-Driven Development)**: cada iteración tiene una SPEC con
sus requisitos y alcance, un PLAN de trabajo y un TEST_PLAN cuyos resultados se documentan. El
historial de git refleja el proceso, con un commit de cierre por iteración y una rama
`iteracion-NN-<nombre>` por iteración.

## Fuera de alcance

Pagos reales, envío/logística, moderación automática de contenido y moderación de las
valoraciones (reportar, ocultar o borrar una valoración). Las valoraciones entre usuarios **sí**
entran en el alcance: puntuación del 1 al 5 y comentario opcional, con la media resumida en el
perfil público y junto al autor de cada anuncio.

---
