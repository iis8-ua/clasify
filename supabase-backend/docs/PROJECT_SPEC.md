# PROJECT_SPEC

## Descripción

Segundo backend de *Clasify*, implementado con **Supabase** como BaaS, desarrollado en un proyecto
totalmente aparte (`supabase-backend/`). Corresponde al **requerimiento adicional** de la Práctica 1.

El objetivo es exponer una **capa de servicios** en JavaScript que implemente los casos de uso del
backend sin que el cliente conozca que por debajo se usa el API de Supabase.

## Alcance (reducido, según el enunciado)

El enunciado indica que el backend adicional solo necesita autenticación y registro de usuarios y
operaciones sobre el recurso principal:

- Registro, login y logout de usuarios (Supabase Auth, email + contraseña).
- Perfil básico del usuario autenticado.
- Operaciones sobre el recurso principal (**anuncios**): crear, listar (con búsqueda y paginación),
  obtener por id, modificar y eliminar.
- Listado de **categorías** para los filtros.

## Recurso principal

Anuncios (mismos campos que en el backend propio).

## Fuera de alcance

- Favoritos (recurso secundario).
- Conversaciones y mensajería (recurso secundario).
- Subida real de imágenes (la imagen se guarda como URL/nombre).
- Frontend.
- Lista negra de tokens (el logout se hace descartando la sesión en el cliente).

## Relación con el backend propio

Los dos backends son proyectos independientes y no comparten código. Este proyecto tiene su propio
proceso SDD en `docs/`.
