# PROJECT_SPEC

## Descripción

Queremos desarrollar una aplicación web para alojar y apoyar económicamente proyectos de *crowdfunding* (al estilo de Kickstarter o Verkami). En el sitio aparecerán los últimos proyectos o más populares, se podrán buscar por contenido del proyecto y el usuario podrá ver información sobre ellos, apoyarlos económicamente si se ha dado de alta, estar al tanto de las novedades de los proyectos que ya apoya, etc. 

## Recurso principal

Proyectos. Además habrá Usuarios de la aplicación

## Recursos secundarios

Apoyos (un usuario aporta económicamente a un proyecto), modalidades de apoyo (niveles de apoyo, cada uno con una cantidad aportada y una recompensa obtenida a cambio), actualizaciones (novedades sobre los proyectos), comentarios a las actualizaciones

## Relaciones

usuario->apoyo 1:N, 
proyecto->apoyo 1:N, 
usuario->proyecto 1:N (usuario es gestor de proyecto), 
proyecto->actualización 1:N 
actualización->comentario 1:N
usuario->comentario 1:N
proyecto->modalidad de apoyo 1:N

## Funcionalidades principales

* Un usuario sin estar autentificado debe poder ver los datos más importantes de la lista de proyectos más populares en el sitio
* Un usuario debe poder buscar proyectos por palabras clave en título o descripción
* Un usuario sin estar autentificado debe poder ver todos los datos de un proyecto
* Un usuario autentificado debe poder elegir una modalidad de apoyo y apoyar un proyecto con esa cantidad
* Un usuario autentificado debe poder comentar las actualizaciones de los proyectos que apoya
* Un usuario debe poder darse de alta con un email y una contraseña
* Un usuario dado de alta debe poder hacer login en la aplicación
* Un usuario logueado debe poder crear un nuevo proyecto con datos básicos: título, texto, objetivo financiero, ...
* Un usuario logueado y que ha creado un proyecto debe poder añadir modalidades de apoyo a un proyecto (cantidad aportada y recompensa obtenida a cambio)
* Un usuario logueado y que ha creado un proyecto debe poder enviar actualizaciones (==noticias) sobre el estado del mismo
* Un usuario debe poder cerrar la sesión (logout)

## Fuera de alcance

La implementación real de los pagos queda fuera del ámbito de la aplicación por su complejidad, usaremos pagos simulados.

