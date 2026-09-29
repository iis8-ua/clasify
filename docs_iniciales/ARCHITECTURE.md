# ARCHITECTURE

## Backend

- API REST con Node/Express
- La autenticación se hará con tokens JWT
- Base de datos todavía no decidida

## Frontend

- Todavía no decidido

## Colecciones

### Usuarios

Campos:

- id
- created_at
- email
- nombre
- password_hash

### Proyectos

Campos:

- id 
- titulo
- descripcion
- objetivo #cantidad a recaudar para que el proyecto se pueda llevar a cabo
- fecha_limite
- recaudado #cantidad recaudada hasta el momento
- id_gestor #usuario que lo ha creado y lo gestiona

### Apoyos

Campos:

- id
- id_usuario
- created_at
- id_proyecto
- id_tier

### Tiers (modalidades de apoyo)

Campos:

- id
- id_proyecto
- cantidad
- titulo
- descripcion_recompensa

### Actualizaciones

- id
- id_proyecto
- created_at
- titulo
- texto

### Comentarios

- id
- id_actualizacion
- created_at
- id_usuario
- texto

## API REST

El backend ofrecerá un API REST.

Todas las rutas comenzarán por  /crowdfunding_api/

De momento ponemos solo las rutas sin métodos HTTP, conforme vayamos implementando las funcionalidades, los iremos añadiendo

- /usuarios
- /usuarios/:id
- /proyectos
- /proyectos/:id
- /proyectos/:id/apoyos
- /proyectos/:id/tiers
- /proyectos/:id/actualizaciones
- /proyectos/:id/actualizaciones/:id_actualizacion
- /proyectos/:id/actualizaciones/:id_actualizacion/comentarios
- /proyectos/:id/actualizaciones/:id_actualizacion/comentarios/:id_comentario
- /usuarios/me/feed #"me" representa al usuario autenticado. feed son las actualizaciones de todos los proyectos que apoya
- /usuarios/me/apoyos #todos los proyectos apoyados por el usuario autenticado

