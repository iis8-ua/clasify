'use strict';

const { anuncioService } = require('../src');
const { ErrorDeServicio } = require('../src/errors/ErrorDeServicio');
const { usuario, dosUsuarios, crearAnuncio } = require('./ayudaSupabase');

/**
 * Tests de escritura de anuncios contra Supabase real.
 *
 * Los usuarios son cinco y cacheados por el límite de registros del plan gratis;
 * ver `ayudaSupabase.js`. Los ids de los anuncios se comparan con los que devuelve
 * la propia creación, nunca con valores fijos, porque el proyecto acumula anuncios
 * de ejecuciones anteriores al no borrar nada.
 */

describe('crear un anuncio', () => {
  test('crea el anuncio con el autor siendo el usuario del token', async () => {
    const u = await usuario();

    const anuncio = await crearAnuncio(u.contexto, { titulo: 'Bici de montana' });

    expect(anuncio.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(anuncio.titulo).toBe('Bici de montana');
    expect(anuncio.precio).toBe(250);
    expect(anuncio.estado).toBe('disponible');
    expect(anuncio.autor.id).toBe(u.id);
    expect(anuncio.categoria).toEqual({ id: 8, nombre: expect.any(String) });
  });

  test('el precio llega como número, no como cadena', async () => {
    const u = await usuario();

    // NUMERIC viene como texto desde PostgREST y el servicio lo convierte.
    const anuncio = await crearAnuncio(u.contexto, { precio: '19.95' });

    expect(typeof anuncio.precio).toBe('number');
    expect(anuncio.precio).toBe(19.95);
  });

  test('el autor no trae el email, porque es una proyección pública', async () => {
    const u = await usuario();

    const anuncio = await crearAnuncio(u.contexto);

    expect(anuncio.autor).not.toHaveProperty('email');
    expect(typeof anuncio.autor.nombre).toBe('string');
  });

  test('no deja crear sin token', async () => {
    const u = await usuario();

    await expect(
      anuncioService.crear(
        { titulo: 'Sin permiso', descripcion: 'x', precio: 1, id_categoria: 1 },
        { token: undefined, usuarioId: u.id }
      )
    ).rejects.toThrow(ErrorDeServicio);
  });

  test('no deja crear con un token inválido', async () => {
    const u = await usuario();

    await expect(
      anuncioService.crear(
        { titulo: 'Token falso', descripcion: 'x', precio: 1, id_categoria: 1 },
        { token: 'no.es.un.jwt', usuarioId: u.id }
      )
    ).rejects.toThrow(ErrorDeServicio);
  });

  test('no deja colarse un id_autor ajeno en el cuerpo', async () => {
    const [a, b] = await dosUsuarios();
    const titulo = 'Inyeccion de autor ajeno rotulada';

    // Se pasa el contexto de `a` pero un id_autor de `b` en los datos. El servicio
    // lo sobrescribe con el del token, así que `b` no recibe nada.
    const anuncio = await anuncioService.crear(
      { titulo, descripcion: 'x', precio: 1, id_categoria: 1, id_autor: b.id },
      a.contexto
    );

    expect(anuncio.autor.id).toBe(a.id);

    const encontrado = await anuncioService.listar({ texto: 'Inyeccion de autor ajeno rotulada' });
    expect(encontrado.datos.every((x) => x.autor.id !== b.id)).toBe(true);
  });
});

describe('editar un anuncio', () => {
  test('cambia los campos y devuelve el anuncio actualizado', async () => {
    const u = await usuario();
    const anuncio = await crearAnuncio(u.contexto, { titulo: 'Antes de editar' });

    const actualizado = await anuncioService.actualizar(
      anuncio.id,
      { titulo: 'Despues de editar', precio: 99.5 },
      u.contexto
    );

    expect(actualizado.titulo).toBe('Despues de editar');
    expect(actualizado.precio).toBe(99.5);
    expect(actualizado.descripcion).toBe(anuncio.descripcion);
  });

  test('cambiar el estado a vendido se hace con el mismo servicio', async () => {
    const u = await usuario();
    const anuncio = await crearAnuncio(u.contexto);

    const vendido = await anuncioService.cambiarEstado(anuncio.id, 'vendido', u.contexto);

    expect(vendido.estado).toBe('vendido');
  });

  test('no deja editar el anuncio de otro usuario', async () => {
    const [a, b] = await dosUsuarios();
    const anuncio = await crearAnuncio(a.contexto, { titulo: 'Anuncio propiedad de A' });

    await expect(
      anuncioService.actualizar(anuncio.id, { titulo: 'Tocado por B' }, b.contexto)
    ).rejects.toThrow(ErrorDeServicio);

    // Y sigue como estaba, que es lo importante.
    const actual = await anuncioService.obtener(anuncio.id);
    expect(actual.titulo).toBe('Anuncio propiedad de A');
  });

  test('dar a editar un anuncio inexistente da error', async () => {
    const u = await usuario();

    await expect(
      anuncioService.actualizar(
        '00000000-0000-4000-8000-000000000000',
        { titulo: 'Fantasma' },
        u.contexto
      )
    ).rejects.toThrow(ErrorDeServicio);
  });
});

describe('borrar un anuncio', () => {
  test('borra el anuncio del propio autor y ya no se puede leer', async () => {
    const u = await usuario();
    const anuncio = await crearAnuncio(u.contexto);

    await expect(anuncioService.eliminar(anuncio.id, u.contexto)).resolves.toEqual({
      eliminado: true
    });

    await expect(anuncioService.obtener(anuncio.id)).resolves.toBeNull();
  });

  test('no deja borrar el anuncio de otro usuario, y el anuncio sigue ahí', async () => {
    const [a, b] = await dosUsuarios();
    const anuncio = await crearAnuncio(a.contexto);

    await expect(anuncioService.eliminar(anuncio.id, b.contexto)).rejects.toThrow(ErrorDeServicio);

    await expect(anuncioService.obtener(anuncio.id)).resolves.toBeTruthy();
  });
});

describe('RLS visto desde la API', () => {
  test('cualquiera puede listar anuncios sin token', async () => {
    const u = await usuario();
    const titulo = 'Anuncio publico de lectura sin sesion';
    const anuncio = await crearAnuncio(u.contexto, { titulo });

    const listado = await anuncioService.listar({ texto: titulo });

    expect(listado.datos.some((x) => x.id === anuncio.id)).toBe(true);
  });

  test('el listado filtra por categoría', async () => {
    const u = await usuario();
    const titulo = 'Coche de prueba con categoria unica';
    const anuncio = await crearAnuncio(u.contexto, { titulo, id_categoria: 6 });

    const enMotor = await anuncioService.listar({ texto: titulo, categoria: 6 });
    expect(enMotor.datos.some((x) => x.id === anuncio.id)).toBe(true);

    const enBici = await anuncioService.listar({ texto: titulo, categoria: 8 });
    expect(enBici.datos.some((x) => x.id === anuncio.id)).toBe(false);
  });

  test('la búsqueda encuentra por título y por descripción', async () => {
    const u = await usuario();
    const anuncio = await crearAnuncio(u.contexto, {
      titulo: 'TituloBuscableXYZ con marca unica',
      descripcion: 'Una descripcion con otra palabra RaraABC mas unica'
    });

    const porTitulo = await anuncioService.listar({ texto: 'TituloBuscableXYZ' });
    expect(porTitulo.datos.some((x) => x.id === anuncio.id)).toBe(true);

    const porDescripcion = await anuncioService.listar({ texto: 'RaraABC' });
    expect(porDescripcion.datos.some((x) => x.id === anuncio.id)).toBe(true);
  });

  test('el % de la búsqueda va escapado y no hace de comodín', async () => {
    const u = await usuario();
    const anuncio = await crearAnuncio(u.contexto, {
      titulo: 'Rebajado un cincuenta por ciento ahora',
      descripcion: 'precio especial de prueba'
    });

    // Si el % no se escapara, esto traería el anuncio entero.
    const resultado = await anuncioService.listar({ texto: 'cincuenta%' });
    expect(resultado.datos.some((x) => x.id === anuncio.id)).toBe(false);
  });
});