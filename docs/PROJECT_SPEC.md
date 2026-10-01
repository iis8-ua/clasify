# PROJECT_SPEC

## Descripción

Queremos desarrollar una aplicación web de **anuncios clasificados** (al estilo de Wallapop o Milanuncios) llamada *Clasify*: los usuarios publican anuncios de artículos para venderlos a otros usuarios del sitio. En la página principal se muestra el listado de anuncios más recientes, se pueden buscar y filtrar por texto y por categoría, y cualquier visitante puede ver el detalle completo de un anuncio.

Un usuario autenticado puede publicar anuncios, editarlos, marcarlos como vendidos o eliminarlos cuando ya no desee ofrecerlos. También puede guardar como favoritos los anuncios de otros usuarios y contactar con el vendedor a través de un sistema de mensajería interno ligado a cada anuncio, de forma que la conversación queda asociada al producto y es privada entre comprador y vendedor.

Los usuarios pueden valorarse entre sí con una puntuación del 1 al 5 y un comentario opcional. Esa valoración se resume en el perfil público y junto al autor de cada anuncio, que es justo donde un comprador decide si escribe o no.

## Recurso principal

Anuncios. Además habrá Usuarios de la aplicación y Categorías que sirvan para filtrar el listado.

## Recursos secundarios

Conversaciones y mensajes (hilo privado entre comprador y vendedor asociado a un anuncio), favoritos de cada usuario sobre anuncios ajenos, valoraciones entre usuarios, y el perfil de usuario (público y propio).

## Relaciones

```
Usuario -> Anuncio        1:N   (el usuario es autor del anuncio)
Categoria -> Anuncio      1:N   (el anuncio pertenece a una categoría)
Usuario <-> Anuncio      N:M    (materializada en Favorito, sin duplicados usuario+anuncio)
Anuncio -> Conversacion   1:N   (un anuncio puede tener una conversación por comprador)
Usuario -> Conversacion   1:N   (el usuario es el comprador que inicia la conversación)
Conversacion -> Mensaje   1:N   (los mensajes pertenecen a una conversación)
Usuario -> Mensaje        1:N   (el usuario es emisor del mensaje)
Anuncio -> Favorito       1:N
Usuario -> Favorito       1:N
Usuario -> Valoracion     1:N   (como valorador y como valorado)
```

Las valoraciones van de un usuario a otro y **no** cuelgan del anuncio: la idea es puntuar a la
persona, no la operación, así que sobrevive a que el anuncio se venda o se borre. La restricción
`UNIQUE (id_valorador, id_valorado)` impide puntuar dos veces a la misma persona y hace que volver a
valorar edite la fila en lugar de crear otra.

La pareja (comprador, vendedor) se modela de forma **explícita** con la entidad `Conversacion`:

- El **vendedor** es el autor del anuncio.
- El **comprador** es el usuario que inicia la conversación (`Conversacion.id_comprador`).
- Restricción `UNIQUE (id_anuncio, id_comprador)`: un comprador tiene como máximo una conversación por anuncio.
- Solo pueden ver y escribir en esa conversación el vendedor y el comprador. El resto de usuarios no tiene acceso.

## Funcionalidades principales

- Un usuario sin estar autentificado debe poder ver el listado de anuncios más recientes en la página principal
- Un usuario debe poder buscar anuncios por palabras clave y filtrarlos por categoría
- Todos los listados (anuncios, favoritos, conversaciones, valoraciones) deben estar paginados
- Un usuario sin estar autentificado debe poder ver todos los datos de un anuncio
- Al consultar un anuncio se devuelven también datos relacionados: autor, categoría, número de favoritos y, si el usuario participa, la conversación con sus tres últimos mensajes y el total de mensajes del hilo
- Un usuario sin estar autentificado debe poder ver el perfil público de un usuario (nombre, fecha de alta, valoración media, número de valoraciones y sus anuncios)
- Un usuario debe poder darse de alta con un email y una contraseña
- Un usuario dado de alta debe poder hacer login en la aplicación
- Un usuario debe poder cerrar la sesión (logout)
- Un usuario autentificado debe poder ver y editar su propio perfil (cada usuario solo el suyo)
- Un usuario autentificado debe poder crear un nuevo anuncio con título, descripción, precio, categoría y fotografía (subida real del fichero de imagen)
- Un usuario autentificado y propietario del anuncio debe poder editarlo
- Un usuario autentificado y propietario del anuncio debe poder marcarlo como vendido o eliminarlo
- Un usuario autentificado debe poder añadir o quitar anuncios ajenos de sus favoritos
- Un usuario autentificado debe poder iniciar una conversación con el vendedor de un anuncio y responder dentro de esa conversación
- Un usuario autentificado debe poder consultar sus conversaciones activas (solo las suyas)
- Un usuario autentificado debe poder valorar a cualquier otro usuario (no a sí mismo) con una puntuación del 1 al 5 y un comentario opcional, y editar o borrar esa valoración
- Un usuario sin estar autentificado debe poder ver la lista de valoraciones que ha recibido un usuario
- Un usuario autentificado debe poder ver qué valoración ha puesto cada usuario

## Fuera de alcance

- El sistema real de pagos: si las dos partes quieren cerrar la venta, quedan fuera de la aplicación
- El sistema de envío / logística
- La moderación automática de contenido
- La lista negra de tokens JWT (el logout se hace descartando el token en el cliente)
- Moderar las valoraciones: reportarlas, ocultarlas o borrarlas
- Ponderar las valoraciones por antigüedad: una cuenta lo mismo el primer día que al año
