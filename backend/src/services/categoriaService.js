'use strict';

const { consultar } = require('../db/pool');

/**
 * Listado de categorías para el filtro del frontend.
 * No va paginado a propósito: son ocho filas fijas que no crecen con el uso, y
 * un desplegable de filtros no necesita paginación.
 */
async function listar() {
  return consultar('SELECT id, nombre FROM categorias ORDER BY nombre');
}

module.exports = { listar };
