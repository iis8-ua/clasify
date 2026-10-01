'use strict';

const { desdeError, deServicio } = require('../errors/ErrorDeServicio');

const LIMITES = { minimo: 1, maximo: 100, porDefecto: 20 };

/**
 * Lee `pagina` y `limite` de unas opciones de listado.
 *
 * Es el mismo contrato de paginación que el backend propio (`pagina` desde 1 y
 * `limite` entre 1 y 100), para que quien use los dos projectos aprenda una sola
 * vez cómo paginar.
 *
 * Devuelve además `desde` y `hasta` ya calculados para `.range()`, que en
 * PostgREST es inclusivo en los dos extremos: la primera página de 20 es
 * `.range(0, 19)`.
 */
function leerPaginacion(opciones = {}) {
  const pagina = opciones.pagina === undefined ? 1 : Number(opciones.pagina);
  const limite = opciones.limite === undefined ? LIMITES.porDefecto : Number(opciones.limite);

  if (!Number.isInteger(pagina) || pagina < 1) {
    throw deServicio('VALIDACION', 'La página tiene que ser un entero mayor o igual que 1', 400);
  }
  if (!Number.isInteger(limite) || limite < LIMITES.minimo || limite > LIMITES.maximo) {
    throw deServicio(
      'VALIDACION',
      `El límite tiene que ser un entero entre ${LIMITES.minimo} y ${LIMITES.maximo}`,
      400
    );
  }

  return { pagina, limite, desde: (pagina - 1) * limite, hasta: pagina * limite - 1 };
}

/** Envuelve un listado con el bloque de paginación que usa el backend propio. */
function respuestaPaginada(datos, { pagina, limite }, total) {
  return {
    datos,
    paginacion: {
      pagina,
      limite,
      total,
      paginas: total === 0 ? 0 : Math.ceil(total / limite)
    }
  };
}

/**
 * Lee el total de filas de una consulta ya construida.
 *
 * Recibe la consulta **con su `select` puesto**, no una fábrica: en Supabase los
 * filtros (`eq`, `or`, `order`) solo existen en el objeto que devuelve `select()`,
 * así que el orden correcto es `from().select()` y luego filtrar.
 *
 * El `count: 'exact'` con `head: true` devuelve solo la cabecera y el total real de
 * la tabla, no el número de filas de la página. Ese otro dato viene en la
 * respuesta de la consulta de datos, y usarlo para el bloque de paginación
 * haría que siempre saliera una sola página.
 */
async function contar(consulta) {
  const { count, error } = await consulta;

  if (error) {
    throw desdeError(error);
  }

  return count ?? 0;
}

/**
 * Escapa `%` y `_` para que un `like` los trate como texto.
 *
 * Sin esto, buscar "100%" traería cualquier cosa, porque `%` es el comodín de
 * "cualquier secuencia".
 */
function escaparParaLike(texto) {
  return texto.replace(/([\\%_])/g, '\\$1');
}

/** `ilike` con el comodín alrededor, ya escapado el texto. */
function patronBusqueda(texto) {
  return `%${escaparParaLike(texto)}%`;
}

module.exports = {
  LIMITES,
  leerPaginacion,
  respuestaPaginada,
  contar,
  escaparParaLike,
  patronBusqueda
};