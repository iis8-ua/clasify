'use strict';

const { anuncioService } = require('../src');
const { ErrorDeServicio } = require('../src/errors/ErrorDeServicio');
const {
  usuario,
  usuarioEditable,
  dosUsuarios,
  crearAnuncio
} = require('./ayudaSupabase');

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

// Estas tres rutas también reciben un uuid, y antes lo mandaban a Postgres sin
// comprobarlo. La respuesta era un 500 con "invalid input syntax for type uuid",
// que es un error interno de la base de datos y no un 400 de la capa. Además, el
// mismo id inválido contestaba de una manera en `obtener` y de otra aquí.
describe('ids que no son uuid en las rutas de escritura', () => {
  const ID_INVALIDO = 'no-es-un-uuid';

  test('editar con un id inválido es un 400 de la capa, no un error de Postgres', async () => {
    const u = await usuario();
    const anuncio = await crearAnuncio(u.contexto);

    await expect(
      anuncioService.actualizar(ID_INVALIDO, { titulo: 'Otro titulo' }, u.contexto)
    ).rejects.toThrow(/uuid/);

    await expect(anuncioService.cambiarEstado(ID_INVALIDO, 'vendido', u.contexto)).rejects.toThrow(
      /uuid/
    );

    // El anuncio bueno sigue intacto: el id inválido no llegó a tocar nada.
    const despues = await anuncioService.obtener(anuncio.id);
    expect(despues.titulo).toBe(anuncio.titulo);
    expect(despues.estado).toBe('disponible');
  });

  test('borrar con un id inválido da 400 y no borra nada', async () => {
    const u = await usuario();
    const anuncio = await crearAnuncio(u.contexto);

    await expect(anuncioService.eliminar(ID_INVALIDO, u.contexto)).rejects.toThrow(/uuid/);

    await expect(anuncioService.obtener(anuncio.id)).resolves.toBeTruthy();
  });

  test('listar por un autor que no es uuid da 400', async () => {
    await expect(anuncioService.listarPorAutor({ idAutor: 1 })).rejects.toThrow(/uuid/);
    await expect(anuncioService.listarPorAutor({ idAutor: 'ana' })).rejects.toThrow(/uuid/);
  });

  test('el error de un id inválido es siempre de la misma forma', async () => {
    const u = await usuario();
    const anuncio = await crearAnuncio(u.contexto);

    const casos = [
      () => anuncioService.obtener(ID_INVALIDO),
      () => anuncioService.actualizar(ID_INVALIDO, { titulo: 'X' }, u.contexto),
      () => anuncioService.eliminar(ID_INVALIDO, u.contexto),
      () => anuncioService.listarPorAutor({ idAutor: ID_INVALIDO })
    ];

    for (const caso of casos) {
      const error = await caso().catch((e) => e);
      expect(error).toBeInstanceOf(ErrorDeServicio);
      expect(error.codigo).toBe('VALIDACION');
      expect(error.estado).toBe(400);
    }
    expect(anuncio.id).toBeTruthy();
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
describe('listar los anuncios de un autor', () => {
  test('devuelve solo los anuncios de ese autor', async () => {
    const [a, b] = await dosUsuarios();
    const mio = await crearAnuncio(a.contexto, { titulo: 'Anuncio solo de A' });
    await crearAnuncio(b.contexto, { titulo: 'Anuncio solo de B' });

    const resultado = await anuncioService.listarPorAutor({ idAutor: a.id, estado: 'todos' });

    expect(resultado.datos.map((x) => x.id)).toContain(mio.id);
    expect(resultado.datos.map((x) => x.titulo)).not.toContain('Anuncio solo de B');
  });

  test('filtra por estado, texto y categoría como el listado general', async () => {
    const u = await usuario();
    const anuncio = await crearAnuncio(u.contexto, { titulo: 'Silla de madera' });

    const porTexto = await anuncioService.listarPorAutor({
      idAutor: u.id,
      estado: 'todos',
      texto: 'madera'
    });
    const porCategoria = await anuncioService.listarPorAutor({
      idAutor: u.id,
      estado: 'todos',
      categoria: 8
    });
    const porOtro = await anuncioService.listarPorAutor({
      idAutor: u.id,
      estado: 'todos',
      texto: 'texto que no aparece en ningun anuncio'
    });

    expect(porTexto.datos.map((x) => x.id)).toContain(anuncio.id);
    expect(porCategoria.datos.map((x) => x.id)).toContain(anuncio.id);
    expect(porOtro.datos).toHaveLength(0);
  });

  test('omite los vendidos salvo que se pidan todos', async () => {
    const u = await usuario();
    const anuncio = await crearAnuncio(u.contexto, { titulo: 'Vendido de A' });
    await anuncioService.cambiarEstado(anuncio.id, 'vendido', u.contexto);

    const porDefecto = await anuncioService.listarPorAutor({ idAutor: u.id });
    const todos = await anuncioService.listarPorAutor({ idAutor: u.id, estado: 'todos' });
    const vendidos = await anuncioService.listarPorAutor({ idAutor: u.id, estado: 'vendido' });

    expect(porDefecto.datos.map((x) => x.id)).not.toContain(anuncio.id);
    expect(todos.datos.map((x) => x.id)).toContain(anuncio.id);
    expect(vendidos.datos.map((x) => x.id)).toContain(anuncio.id);
  });

  test('devuelve el total y las páginas, no solo los datos', async () => {
    const u = await usuario();
    await crearAnuncio(u.contexto, { titulo: 'Para contar' });

    const resultado = await anuncioService.listarPorAutor({
      idAutor: u.id,
      estado: 'todos'
    });

    expect(typeof resultado.paginacion.total).toBe('number');
    expect(resultado.paginacion.total).toBeGreaterThanOrEqual(1);
    expect(resultado.paginacion.paginas).toBe(
      Math.ceil(resultado.paginacion.total / resultado.paginacion.limite)
    );
  });

  test('pagina de verdad, sin repetir ni perder anuncios', async () => {
    const u = await usuarioEditable();
    // El usuario es compartido y el proyecto no se limpia, así que no se puede
    // asumir que el anuncio recién creado cae en la primera página: lo que se
    // comprueba es que dos páginas seguidas no se solapen.
    const creado = await crearAnuncio(u.contexto, { titulo: 'Para paginar por autor' });

    const uno = await anuncioService.listarPorAutor({
      idAutor: u.id,
      estado: 'todos',
      pagina: 1,
      limite: 1
    });
    const otro = await anuncioService.listarPorAutor({
      idAutor: u.id,
      estado: 'todos',
      pagina: 2,
      limite: 1
    });

    expect(uno.datos).toHaveLength(1);
    expect(otro.datos.map((x) => x.id)).not.toContain(uno.datos[0].id);

    // Y el anuncio nuevo tiene que salir en alguna de las dos primeras páginas.
    const entreLasDos = [...uno.datos, ...otro.datos].map((x) => x.id);
    expect(entreLasDos).toContain(creado.id);
  });

  test('un autor que no tiene anuncios da una página vacía, no un error', async () => {
    // No se usa uno de los usuarios compartidos porque a estas alturas ya tienen
    // anuncios de las ejecuciones anteriores; se usa un id que no existe.
    const resultado = await anuncioService.listarPorAutor({
      idAutor: '00000000-0000-0000-0000-000000000000',
      estado: 'todos'
    });

    expect(resultado.datos).toHaveLength(0);
    expect(resultado.paginacion.total).toBe(0);
  });

  test('respeta el límite pedido, no el de por defecto', async () => {
    const u = await usuario();
    await crearAnuncio(u.contexto, { titulo: 'Uno' });
    await crearAnuncio(u.contexto, { titulo: 'Dos' });

    const resultado = await anuncioService.listarPorAutor({
      idAutor: u.id,
      estado: 'todos',
      limite: 1
    });

    expect(resultado.datos).toHaveLength(1);
    expect(resultado.paginacion.limite).toBe(1);
  });

  test('rechaza que no le digan de quién son los anuncios', async () => {
    await expect(anuncioService.listarPorAutor({})).rejects.toThrow(ErrorDeServicio);
  });
});
