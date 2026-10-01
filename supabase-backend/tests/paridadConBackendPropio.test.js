'use strict';

const { anuncioService } = require('../src');
const { ErrorDeServicio } = require('../src/errors/ErrorDeServicio');
const { usuario } = require('./ayudaSupabase');

/**
 * Comprueba que el comportamiento observable coincide con el del backend propio,
 * que va sobre MySQL.
 *
 * La I7 deliveryó el listado sin filtro de estado y con `ilike` a pelo. Las dos
 * cosas se notaron al usar los dos backends uno detrás de otro, así que aquí se
 * fijan por escrito: si alguien cambia el listado de Supabase, que sea a
 * propósito y no por descuido.
 *
 * Con esto las diferencias que quedan son solo las de alcance, que el enunciado
 * deja fuera de esta iteración: favoritos, mensajería, valoraciones, subida de
 * imágenes y frontend.
 */

describe('la búsqueda ignora acentos y mayúsculas', () => {
  test.each([
    ['como se escribe', 'Electrónica y niños'],
    ['sin tildes', 'electronica y ninos'],
    ['en mayúsculas', 'ELECTRONICA Y NINOS'],
    ['con la eñe del término', 'nino'],
    ['con la eñe del anuncio', 'niño']
  ])('encuentra el anuncio %s', async (_caso, texto) => {
    const u = await usuario();
    const anuncio = await crearConTitulo(u, 'Electrónica y niños');

    const resultado = await anuncioService.listar({ texto });

    expect(resultado.datos.map((x) => x.id)).toContain(anuncio.id);
  });

  test('busca también en la descripción', async () => {
    const u = await usuario();
    const anuncio = await crearConTitulo(u, 'Cosa sin acento', {
      descripcion: 'La descripción sí lleva tildes: práctica'
    });

    const resultado = await anuncioService.listar({ texto: 'practica' });

    expect(resultado.datos.map((x) => x.id)).toContain(anuncio.id);
  });

  test('sigue sin encontrar lo que no está', async () => {
    const u = await usuario();
    await crearConTitulo(u, 'Electrónica y niños');

    const resultado = await anuncioService.listar({ texto: 'zzzzz-no-existe' });

    expect(resultado.datos).toHaveLength(0);
  });

  test('las columnas normalizadas se mantienen al editar el anuncio', async () => {
    const u = await usuario();
    const anuncio = await crearConTitulo(u, 'Texto provisional');

    await anuncioService.actualizar(anuncio.id, { titulo: 'Electrónica definitiva' }, u.contexto);

    const porNuevo = await anuncioService.listar({ texto: 'electronica definitiva' });
    const porViejo = await anuncioService.listar({ texto: 'provisional' });

    expect(porNuevo.datos.map((x) => x.id)).toContain(anuncio.id);
    expect(porViejo.datos.map((x) => x.id)).not.toContain(anuncio.id);
  });
});

describe('el listado filtra por estado', () => {
  test('por defecto solo enseña los disponibles', async () => {
    const u = await usuario();
    const anuncio = await crearConTitulo(u, 'Se vende en cuanto sea');
    await anuncioService.cambiarEstado(anuncio.id, 'vendido', u.contexto);

    const porDefecto = await anuncioService.listar({ texto: 'Se vende en cuanto sea' });

    expect(porDefecto.datos.map((x) => x.id)).not.toContain(anuncio.id);
  });

  test('con todos salen también los vendidos', async () => {
    const u = await usuario();
    const anuncio = await crearConTitulo(u, 'Ya no esta disponible');
    await anuncioService.cambiarEstado(anuncio.id, 'vendido', u.contexto);

    const todos = await anuncioService.listar({ texto: 'Ya no esta disponible', estado: 'todos' });

    expect(todos.datos.map((x) => x.id)).toContain(anuncio.id);
  });

  test('se puede pedir solo los vendidos', async () => {
    const u = await usuario();
    const anuncio = await crearConTitulo(u, 'Vendido para la prueba');
    await anuncioService.cambiarEstado(anuncio.id, 'vendido', u.contexto);

    const vendidos = await anuncioService.listar({ texto: 'Vendido para la prueba', estado: 'vendido' });

    expect(vendidos.datos.map((x) => x.id)).toContain(anuncio.id);
  });

  test('el estado se combina con los demás filtros', async () => {
    const u = await usuario();
    const anuncio = await crearConTitulo(u, 'Filtro combinado', { id_categoria: 8 });
    await anuncioService.cambiarEstado(anuncio.id, 'vendido', u.contexto);

    const vendido = await anuncioService.listar({ estado: 'vendido', categoria: 8 });
    const otraCategoria = await anuncioService.listar({ estado: 'vendido', categoria: 1 });

    expect(vendido.datos.map((x) => x.id)).toContain(anuncio.id);
    expect(otraCategoria.datos.map((x) => x.id)).not.toContain(anuncio.id);
  });

  test('rechaza un estado inventado', async () => {
    await expect(anuncioService.listar({ estado: 'apartado' })).rejects.toThrow(ErrorDeServicio);
  });
});

/** Crea un anuncio del usuario compartido, que es lo que la mayoría de estos tests necesitan. */
async function crearConTitulo(u, titulo, extra = {}) {
  return anuncioService.crear(
    { titulo, descripcion: extra.descripcion ?? 'Descripción de prueba', precio: 10, id_categoria: extra.id_categoria ?? 1 },
    u.contexto
  );
}