'use strict';

const { cliente } = require('../supabase/cliente');
const { desdeError } = require('../errors/ErrorDeServicio');

/**
 * Categorías para los filtros del listado.
 *
 * Van ordenadas por nombre, y no por id como en el backend propio: aquí el id es
 * un `SERIAL` que depende del orden en que se insertaron, así que ordenar por él
 * no significa nada para quien ve la lista.
 */
async function listarCategorias() {
  const { data, error } = await cliente
    .from('categorias')
    .select('id, nombre')
    .order('nombre', { ascending: true });

  if (error) {
    throw desdeError(error, { tabla: 'categorias' });
  }

  return data.map((categoria) => ({ id: categoria.id, nombre: categoria.nombre }));
}

module.exports = { listarCategorias };