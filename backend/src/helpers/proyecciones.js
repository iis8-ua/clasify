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
 * Las mismas columnas, escritas con el prefijo de su tabla y, si hace falta, con
 * un alias para el resultado.
 *
 * - `tabla` (`'a.'`) es para las consultas que escriben `FROM anuncios a`
 *   porque hacen `JOIN` con otras tablas.
 * - `alias` (`'anuncio_'`) es para las consultas donde el anuncio va envuelto en
 *   un objeto y sus columnas pueden chocar con las de otras tablas de la misma
 *   fila: `a.id AS anuncio_id`, `u.id AS autor_id`...
 */
function camposListadoAnuncio(tabla = '', alias = '') {
  return CAMPOS_LISTADO_ANUNCIO.split(', ')
    .map((campo) => {
      const columna = `${tabla}${campo}`;
      return alias === '' ? columna : `${columna} AS ${alias}${campo}`;
    })
    .join(', ');
}

/** Las columnas de un anuncio con el alias `a.` de la tabla. */
const CAMPOS_LISTADO_ANUNCIO_ALIAS = camposListadoAnuncio('a.');

module.exports = { CAMPOS_LISTADO_ANUNCIO, CAMPOS_LISTADO_ANUNCIO_ALIAS, camposListadoAnuncio };
