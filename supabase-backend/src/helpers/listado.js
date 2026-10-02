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
 * Escapa los caracteres que tienen significado dentro del filtro de PostgREST.
 *
 * Las dos gramáticas que se cruzan aquí no se escapan igual, y es lo más
 * fácil de liar de todo este archivo:
 *
 *   * El `ILIKE` de Postgres usa `\` como carácter de escape, así que un `\%` es
 *     un porcentaje de texto y no un comodín.
 *   * El parser del filtro de PostgREST, dentro de las comillas del valor,
 *     reduce cada `\\` a un solo `\` antes de mandarlo a Postgres. De ahí que
 *     para el comodín hagan falta **dos** barras: tiene que llegar una.
 *   * Pero para las comillas, dentro de las comillas, una sola barra sí alcanza:
 *     el `\"` lo entiende el propio parser de PostgREST y no cierra el valor.
 *
 * Comprobado uno a uno contra el proyecto, porque con una barra de menos el `%`
 * volvía a ser comodín y con una de más el filtro no parseaba:
 *
 *   valor buscado         patrón que se manda        resultado
 *   cincuenta%            "%cincuenta\\%%"            0 filas (bien)
 *   "x",estado.eq.vendido "%\\",estado...\\"%"        0 filas (bien, sin inyección)
 *   una barra de menos    "%cincuenta\%%"             encuentra el anuncio (mal)
 *   una barra de más      "%cincuenta\\\\%%"           error de parseo (mal)
 */
const ESCAPES = {
  '\\': '\\\\\\\\',
  '%': '\\\\%',
  _: '\\\\_',
  '"': '\\"'
};

function escaparParaLike(texto) {
  return texto.replace(/[\\%_"]/g, (caracter) => ESCAPES[caracter]);
}

/**
 * `ilike` con el comodín alrededor, ya escapado y normalizado el texto.
 *
 * El valor va **entre comillas dobles** y no es opcional. El filtro se monta como
 * una cadena donde la coma separa las condiciones de un `.or()`, así que un término
 * con una coma se colaba como una condición más. Comprobado contra el proyecto:
 * buscando `",estado.eq.vendido,descripcion_buscable.ilike."x` sin comillas
 * devolvía 24 anuncios, los 24 vendidos, y sin dar ningún error.
 *
 * Con las comillas, ese mismo término devuelve 0 filas.
 */
function patronBusqueda(texto) {
  return `"%${escaparParaLike(normalizarParaBusqueda(texto))}%"`;
}

/**
 * Letras que `unaccent` de Postgres pasa a otra, y que la descomposición
 * Unicode no toca porque no son un acento sino una letra propia. Sin esta tabla
 * la columna queda con "ene" y el término con "eñe", y no coinciden.
 */
const LETRAS_FOLDED = {
  ñ: 'n',
  Ñ: 'n',
  æ: 'ae',
  Æ: 'ae',
  œ: 'oe',
  Œ: 'oe',
  ø: 'o',
  Ø: 'o',
  ß: 'ss',
  đ: 'd',
  Đ: 'd',
  ł: 'l',
  Ł: 'l',
  þ: 'th',
  Þ: 'th',
  ð: 'd',
  Ð: 'd'
};

/**
 * Quita acentos y baja a minúsculas, igual que hace la función
 * `normalizar_para_busqueda` de la migración 0002 sobre las columnas.
 *
 * Hace falta en los dos lados: la columna se guarda normalizada, así que si el
 * término que escribe la persona no se normaliza igual, buscar "electronica"
 * encuentra "Electrónica" pero buscar "Electrónica" no encuentra nada. Y lo
 * segundo es justo lo que escribe la gente.
 */
function normalizarParaBusqueda(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00C0-\u024F]/g, (letra) => LETRAS_FOLDED[letra] ?? letra)
    .toLowerCase();
}


module.exports = {
  LIMITES,
  leerPaginacion,
  respuestaPaginada,
  contar,
  escaparParaLike,
  normalizarParaBusqueda,
  patronBusqueda
};