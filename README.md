# Clasify

Marketplace de anuncios clasificados al estilo de Wallapop o Milanuncios. Los usuarios publican
anuncios de artículos para venderlos a otros usuarios del sitio: se listan los anuncios más
recientes, se pueden buscar y filtrar por texto y categoría, y cualquier visitante ve el detalle
completo de un anuncio.

Un usuario autenticado puede publicar, editar, marcar como vendidos o eliminar sus anuncios, guardar
anuncios ajenos en favoritos y contactar con el vendedor mediante un sistema de mensajería interno
ligado a cada anuncio.

## Funcionalidades

- Registro, login y logout con **tokens JWT**
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
| Backend | Node.js + Express (API REST bajo `/clasify_api/`) |
| Base de datos | MySQL, con el cliente `mysql2` |
| Autenticación | JWT (HS256) + `bcrypt` |
| Ficheros | `multer` |
| Pruebas | Jest + Supertest |

Como **requerimiento adicional** se incluye un segundo backend con **Supabase**, en un subproyecto
independiente (`supabase-backend/`), que expone una capa de servicios aislando al cliente del API de
Supabase. No es necesario para usar el backend propio.

## Estructura

```
.
├── CONTRIBUTING.md          Convención de commits y proceso de trabajo
├── Diseno.md                Documento de diseño (v0.2)
├── backend/                 Backend propio (Node/Express + MySQL)
│   ├── src/{routes,services,middleware,db}/
│   ├── tests/
│   ├── uploads/
│   └── schema.sql
├── docs/                    Documentación SDD del backend propio
│   ├── PROJECT_SPEC.md
│   ├── ARCHITECTURE.md
│   └── iterations/          SPEC, PLAN y TEST_PLAN de cada iteración
└── supabase-backend/        Segundo backend (Supabase) con su propio SDD
```

## Metodología

El proyecto se desarrolla con **SDD (Spec-Driven Development)**: cada iteración tiene una SPEC con
sus requisitos y alcance, un PLAN de trabajo y un TEST_PLAN cuyos resultados se documentan. El
historial de git refleja el proceso, con un commit de cierre por iteración y una rama
`iteracion-NN-<nombre>` por iteración.

## Fuera de alcance

Pagos reales, valoración de vendedores, envío/logística y moderación automática de contenido.

---
