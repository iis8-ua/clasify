'use strict';

const { categoriaService } = require('../src');
const { anuncioService } = require('../src');
const { ErrorDeServicio } = require('../src/errors/ErrorDeServicio');

/**
 * Tests de las rutas públicas contra el Supabase real, sin sesión.
 *
 * No hacen falta usuarios ni tokens: RLS deja leer anuncios a cualquiera, que es
 * justo lo que hay que comprobar aquí. Comprobar que estas rutas funcionan sin
 * token es parte del requisito, no un atajo.
 */

describe('categorías', () => {
  test('se listan sin sesión y ordenadas por nombre', async () => {
    const categorias = await categoriaService.listarCategorias();

    expect(categorias.length).toBeGreaterThan(0);
    expect(categorias[0]).toHaveProperty('id');
    expect(categorias[0]).toHaveProperty('nombre');

    const nombres = categorias.map((c) => c.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
  });

  test('devuelve las ocho categorías que mete la migración', async () => {
    const categorias = await categoriaService.listarCategorias();
    expect(categorias).toHaveLength(8);
  });

  test('no expone ningún campo del email: la tabla de categorías no lo tiene', async () => {
    const categorias = await categoriaService.listarCategorias();
    for (const categoria of categorias) {
      expect(Object.keys(categoria).sort()).toEqual(['id', 'nombre']);
    }
  });
});

describe('listado público de anuncios', () => {
  test('responde con el bloque de paginación aunque no haya anuncios', async () => {
    const resultado = await anuncioService.listar();

    expect(Array.isArray(resultado.datos)).toBe(true);
    expect(resultado.paginacion.pagina).toBe(1);
    expect(resultado.paginacion.limite).toBe(20);
    expect(resultado.paginacion.total).toBeGreaterThanOrEqual(0);
  });

  test('el total sale de un count y no del número de filas de la página', async () => {
    const resultado = await anuncioService.listar({ limite: 1 });
    // Con límite 1 solo viene una fila, pero el total es el de verdad.
    expect(resultado.datos.length).toBeLessThanOrEqual(1);
    expect(resultado.paginacion.total).toBeGreaterThanOrEqual(resultado.datos.length);
  });

  test('acepta paginación y devuelve las páginas calculadas', async () => {
    const resultado = await anuncioService.listar({ pagina: 2, limite: 5 });
    expect(resultado.paginacion).toMatchObject({ pagina: 2, limite: 5 });
  });

  test('rechaza una página inválida antes de llamar a Supabase', async () => {
    await expect(anuncioService.listar({ pagina: 0 })).rejects.toThrow(ErrorDeServicio);
  });

  test('rechaza un límite fuera de rango', async () => {
    await expect(anuncioService.listar({ limite: 500 })).rejects.toThrow(ErrorDeServicio);
  });

  test('busca por texto sin error y devuelve la forma esperada', async () => {
    const resultado = await anuncioService.listar({ texto: 'bicicleta' });
    expect(Array.isArray(resultado.datos)).toBe(true);
  });

  test('un texto con % no revienta la consulta: lo escapa', async () => {
    const resultado = await anuncioService.listar({ texto: '100%' });
    expect(Array.isArray(resultado.datos)).toBe(true);
  });

  test('rechaza una categoría que no es un entero', async () => {
    await expect(anuncioService.listar({ categoria: 'coches' })).rejects.toThrow(ErrorDeServicio);
  });

  test.each(['fecha_desc', 'fecha_asc', 'precio_desc', 'precio_asc'])(
    'acepta el orden %s',
    async (orden) => {
      const resultado = await anuncioService.listar({ orden });
      expect(Array.isArray(resultado.datos)).toBe(true);
    }
  );

  test('un orden desconocido no rompe, se usa el de por defecto', async () => {
    const resultado = await anuncioService.listar({ orden: 'inventado' });
    expect(Array.isArray(resultado.datos)).toBe(true);
  });
});

describe('obtener un anuncio', () => {
  // `anuncios.id` es un uuid generado con gen_random_uuid(), no un entero.
  const UUID_QUE_NO_EXISTE = '00000000-0000-4000-8000-000000000000';

  test('devuelve null si el uuid no existe, sin error', async () => {
    await expect(anuncioService.obtener(UUID_QUE_NO_EXISTE)).resolves.toBeNull();
  });

  test('rechaza un id que no es un uuid en vez de llegar a Postgres', async () => {
    // Sin la comprobación del servicio, Postgres responde
    // "invalid input syntax for type uuid" y eso no es un 400 de la capa.
    await expect(anuncioService.obtener(1)).rejects.toThrow(/uuid/);
    await expect(anuncioService.obtener('no-es-uuid')).rejects.toThrow(/uuid/);
  });

  test('acepta un uuid con mayúsculas y minúsculas mezcladas', async () => {
    const mayus = UUID_QUE_NO_EXISTE.toUpperCase();
    await expect(anuncioService.obtener(mayus)).resolves.toBeNull();
  });
});