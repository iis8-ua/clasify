'use strict';

const { consultar } = require('../db/pool');
const { leerPaginacion, respuestaPaginada, totalDe } = require('../helpers/paginacion');

/**
 * Listado de categorías para el filtro del frontend.
 *
 * Va paginado como todos los demás listados, con `pagina` y `limite` y el mismo
 * sobre `datos` + `paginacion`. La tabla no crece con el uso (son filas fijas), pero
 * el enunciado pide los listados paginados sin excluir este, y sobre todo así el
 * cliente no necesita conocer un segundo formato de respuesta: todos los listados
 * de la API devuelven lo mismo.
 *
 * Se ordena por nombre y no por id, porque es lo que se lee en el desplegable.
 *
 * @param {{ pagina?: string|number, limite?: string|number }} query
 */
async function listar({ pagina, limite } = {}) {
  const pag = leerPaginacion({ pagina, limite });

  const [filas, conteo] = await Promise.all([
    consultar(
      'SELECT id, nombre FROM categorias ORDER BY nombre LIMIT ? OFFSET ?',
      [pag.limite, pag.offset]
    ),
    consultar('SELECT COUNT(*) AS total FROM categorias')
  ]);

  return respuestaPaginada(filas, pag, totalDe(conteo));
}

module.exports = { listar };