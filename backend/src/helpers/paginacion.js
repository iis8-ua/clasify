'use strict';

const { ApiError } = require('../errors/ApiError');

const PAGINA_POR_DEFECTO = 1;
const LIMITE_POR_DEFECTO = 20;
const LIMITE_MAXIMO = 100;

/**
 * Convierte un parámetro de la query en un entero dentro de un rango.
 * Si no se envía, devuelve el valor por defecto. Un valor que no sea un entero
 * o esté fuera del rango es un error de validación, con el nombre del campo.
 */
function enteroEnRango(valor, porDefecto, minimo, maximo, campo) {
  if (valor === undefined || valor === '') {
    return porDefecto;
  }

  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw ApiError.validacion(
      `${campo} debe ser un entero entre ${minimo} y ${maximo}`,
      campo
    );
  }

  return numero;
}

/**
 * Lee `pagina` y `limite` de la query de un listado.
 * @returns {{ pagina: number, limite: number, offset: number }}
 */
function leerPaginacion(query = {}) {
  const pagina = enteroEnRango(query.pagina, PAGINA_POR_DEFECTO, 1, 1000000, 'pagina');
  const limite = enteroEnRango(query.limite, LIMITE_POR_DEFECTO, 1, LIMITE_MAXIMO, 'limite');

  return { pagina, limite, offset: (pagina - 1) * limite };
}

/**
 * Envuelve un listado en el formato paginado de docs/ARCHITECTURE.md.
 * @param {Array<object>} datos
 * @param {{ pagina: number, limite: number }} paginacion
 * @param {number} total Número total de elementos, sin paginar.
 */
function respuestaPaginada(datos, { pagina, limite }, total) {
  return {
    datos,
    paginacion: {
      pagina,
      limite,
      total,
      paginas: limite > 0 ? Math.ceil(total / limite) : 0
    }
  };
}

/**
 * Lee el total de una consulta `SELECT COUNT(*) AS total`.
 * @param {Array<object>} filas
 */
function totalDe(filas) {
  return Number(filas[0]?.total ?? 0);
}

module.exports = {
  PAGINA_POR_DEFECTO,
  LIMITE_POR_DEFECTO,
  LIMITE_MAXIMO,
  leerPaginacion,
  respuestaPaginada,
  totalDe
};
