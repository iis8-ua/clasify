'use strict';

const { cliente } = require('../supabase/cliente');
const { desdeError } = require('../errors/ErrorDeServicio');
const { leerPaginacion, respuestaPaginada, contar } = require('../helpers/listado');

/**
 * Categorías para los filtros del listado, paginadas.
 *
 * Van ordenadas por nombre, y no por id como en el backend propio: aquí el id es
 * un `SERIAL` que depende del orden en que se insertaron, así que ordenar por él
 * no significa nada para quien ve la lista.
 *
 * Se pagina aunque la tabla no crezca. En el enunciado la exigencia de paginar
 * está escrita dentro del bloque del recurso principal, así que se podría dejar
 * fuera, pero el backend propio sí pagina este listado y los dos proyectos
 * comparten la misma API: si aquí devolviera solo `datos`, quien usara los dos
 * tendría que aprender dos formatos. El mismo argumento, la misma respuesta.
 *
 * @param {{ pagina?: string|number, limite?: string|number }} opciones
 */
async function listarCategorias({ pagina, limite } = {}) {
  const pag = leerPaginacion({ pagina, limite });
  const { desde, hasta } = pag;

  const [total, { data, error }] = await Promise.all([
    contar(cliente.from('categorias').select('id', { count: 'exact', head: true })),
    cliente
      .from('categorias')
      .select('id, nombre')
      .order('nombre', { ascending: true })
      .range(desde, hasta)
  ]);

  if (error) {
    throw desdeError(error, { tabla: 'categorias' });
  }

  return respuestaPaginada(
    data.map((categoria) => ({ id: categoria.id, nombre: categoria.nombre })),
    pag,
    total
  );
}

module.exports = { listarCategorias };