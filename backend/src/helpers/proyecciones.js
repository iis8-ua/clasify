'use strict';

/**
 * Columnas de un anuncio en los listados.
 *
 * Vive aquí y no en el servicio porque la usan dos servicios distintos
 * (`anuncioService` y `usuarioService`) y, desde la I4, también el listado de
 * favoritos. Si cada uno guardara su propia copia, un cambio en una acabaría
 * haciendo que los tres listados devolvieran filas distintas.
 */
const CAMPOS_LISTADO_ANUNCIO = 'id, titulo, precio, estado, imagen, fecha_creacion, id_categoria';

/**
 * Las mismas columnas con el alias `a.` de la tabla `anuncios`, para las
 * consultas que la escriben como `anuncios a` porque hacen `JOIN` con otras.
 */
const CAMPOS_LISTADO_ANUNCIO_ALIAS = CAMPOS_LISTADO_ANUNCIO.split(', ')
  .map((campo) => `a.${campo}`)
  .join(', ');

module.exports = { CAMPOS_LISTADO_ANUNCIO, CAMPOS_LISTADO_ANUNCIO_ALIAS };
