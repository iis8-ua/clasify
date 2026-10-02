'use strict';

const request = require('supertest');
const app = require('../src/app');
const { pool, ejecutar, consultar } = require('../src/db/pool');
const { prepararBaseDePruebas, limpiarTablas } = require('./ayudaBaseDeDatos');
const { firmarToken } = require('../src/services/authService');

/**
 * Hash del seed. Igual que en `anuncios.test.js`, no se usa para hacer login:
 * los tokens se firman directamente porque `bcrypt` con coste 12 son unos 300 ms
 * por llamada, y multiplicado por todas las pruebas de la suite serían medio
 * minuto de espera sin ganar nada.
 */
const HASH = '$2b$12$zvGU1QCN7FVLhEl5ViOEd.QN907DrZYboJGWDDQmfWt9eCZ3sak/G';

const EMAIL_ANA = 'ana@example.com';
const EMAIL_CARLOS = 'carlos@example.com';

let tokenAna;
let tokenCarlos;

/** Id del anuncio de Ana, que es el que Carlos puede guardar. */
const ID_PROPIO_DE_ANA = 5;
const ID_DE_ANA_PARA_CARLOS = 6;

async function sembrarBase() {
  await limpiarTablas();

  // `limpiarTablas` ya deja la categoría 1 ('Electrónica'), así que aquí solo
  // se añade la segunda.
  await ejecutar('INSERT INTO categorias (nombre) VALUES (?)', ['Hogar y jardín']);
  await ejecutar('INSERT INTO usuarios (email, nombre, password_hash) VALUES (?, ?, ?)', [
    EMAIL_ANA,
    'Ana Ruiz',
    HASH
  ]);
  await ejecutar('INSERT INTO usuarios (email, nombre, password_hash) VALUES (?, ?, ?)', [
    EMAIL_CARLOS,
    'Carlos Díaz',
    HASH
  ]);

  // Los anuncios de la I3: 5 y 6 son de Ana (id 1) y 7 es de Carlos (id 2),
  // que sirve para comprobar que nadie puede ver los favoritos de otro.
  await ejecutar(
    `INSERT INTO anuncios (id, titulo, descripcion, precio, estado, id_autor, id_categoria)
     VALUES (5, 'Bicicleta de montaña', 'En buen estado', 120.50, 'disponible', 1, 1),
            (6, 'Mesa de madera', 'Roble', 45.00, 'disponible', 1, 1),
            (7, 'Cámara digital', '24 megapíxeles', 310.00, 'disponible', 2, 2)`
  );
}

/** Anuncio de Ana con el estado que haga falta. */
async function crearAnuncioDeAna(extra = {}) {
  const resultado = await ejecutar(
    `INSERT INTO anuncios (titulo, descripcion, precio, id_autor, id_categoria, estado)
     VALUES (?, ?, ?, 1, 1, ?)`,
    [extra.titulo ?? 'Anuncio de Ana', 'Descripción', extra.precio ?? 10, extra.estado ?? 'disponible']
  );
  return resultado.insertId;
}

async function contarFavoritos(idUsuario, idAnuncio) {
  const filas = await consultar(
    'SELECT COUNT(*) AS total FROM favoritos WHERE id_usuario = ? AND id_anuncio = ?',
    [idUsuario, idAnuncio]
  );
  return Number(filas[0].total);
}

function marcar(token, id) {
  return request(app)
    .post(`/clasify_api/anuncios/${id}/favorito`)
    .set('Authorization', `Bearer ${token}`);
}

function desmarcar(token, id) {
  return request(app)
    .delete(`/clasify_api/anuncios/${id}/favorito`)
    .set('Authorization', `Bearer ${token}`);
}

function listar(token = tokenCarlos) {
  return request(app)
    .get('/clasify_api/usuarios/me/favoritos')
    .set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  await prepararBaseDePruebas();
});

beforeEach(async () => {
  await sembrarBase();
  tokenAna = firmarToken({ id: 1, email: EMAIL_ANA });
  tokenCarlos = firmarToken({ id: 2, email: EMAIL_CARLOS });
});

afterAll(async () => {
  await pool.end();
});

describe('POST /clasify_api/anuncios/:id/favorito', () => {
  test('un anuncio ajeno se marca y devuelve 201 con el favorito', async () => {
    const respuesta = await marcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.favorito).toEqual({
      id: expect.any(Number),
      fecha: expect.any(String),
      id_anuncio: ID_DE_ANA_PARA_CARLOS,
      id_usuario: 2
    });
    expect(await contarFavoritos(2, ID_DE_ANA_PARA_CARLOS)).toBe(1);
  });

  test('marcarlo dos veces devuelve 200 la segunda y no duplica', async () => {
    const primera = await marcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);
    const segunda = await marcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(200);
    expect(await contarFavoritos(2, ID_DE_ANA_PARA_CARLOS)).toBe(1);
  });

  test('al repetirlo no cambia la fecha en que se guardó', async () => {
    const primera = await marcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);
    const segunda = await marcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);

    expect(segunda.body.datos.favorito.id).toBe(primera.body.datos.favorito.id);
    expect(segunda.body.datos.favorito.fecha).toBe(primera.body.datos.favorito.fecha);
  });

  test('sin token devuelve 401', async () => {
    const respuesta = await request(app).post(`/clasify_api/anuncios/${ID_DE_ANA_PARA_CARLOS}/favorito`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SIN_TOKEN');
  });

  test('con un esquema que no es Bearer devuelve 401', async () => {
    const respuesta = await request(app)
      .post(`/clasify_api/anuncios/${ID_DE_ANA_PARA_CARLOS}/favorito`)
      .set('Authorization', `Basic ${tokenCarlos}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('ESQUEMA_INVALIDO');
  });

  test('un anuncio inexistente devuelve 404', async () => {
    const respuesta = await marcar(tokenCarlos, 999);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error).toMatchObject({
      codigo: 'NO_ENCONTRADO',
      mensaje: 'No existe el anuncio 999'
    });
  });

  test('marcar tu propio anuncio devuelve 400 y no lo guarda', async () => {
    const respuesta = await marcar(tokenAna, ID_PROPIO_DE_ANA);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({
      codigo: 'VALIDACION',
      campo: 'anuncio'
    });
    expect(await contarFavoritos(1, ID_PROPIO_DE_ANA)).toBe(0);
  });

  test('un id no numérico devuelve 400 señalando el campo', async () => {
    const respuesta = await marcar(tokenCarlos, 'abc');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'id' });
  });

  test('cada usuario tiene su propia lista sobre el mismo anuncio', async () => {
    await marcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);
    const deCarlos = await marcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);

    // El 7 es de Carlos, así que Ana sí puede guardárselo. Cada lista es
    // independiente: la fila de Carlos no se mueve al guardar Ana la suya.
    await marcar(tokenAna, 7);
    const deAna = await listar(tokenAna);

    expect(deCarlos.body.datos.favorito.id_usuario).toBe(2);
    expect(deAna.body.datos).toHaveLength(1);
    expect(deAna.body.datos[0].id).toBe(7);
    expect(await contarFavoritos(2, ID_DE_ANA_PARA_CARLOS)).toBe(1);
    expect(await contarFavoritos(1, 7)).toBe(1);
  });
});

describe('DELETE /clasify_api/anuncios/:id/favorito', () => {
  test('quita un favorito existente y devuelve 204 sin cuerpo', async () => {
    await marcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);

    const respuesta = await desmarcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);

    expect(respuesta.status).toBe(204);
    expect(respuesta.text).toBe('');
    expect(await contarFavoritos(2, ID_DE_ANA_PARA_CARLOS)).toBe(0);
  });

  test('quitar un favorito que no estaba devuelve 404', async () => {
    const respuesta = await desmarcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error).toMatchObject({
      codigo: 'NO_ENCONTRADO',
      mensaje: `El anuncio ${ID_DE_ANA_PARA_CARLOS} no está en tus favoritos`
    });
  });

  test('sin token devuelve 401', async () => {
    const respuesta = await request(app).delete(
      `/clasify_api/anuncios/${ID_DE_ANA_PARA_CARLOS}/favorito`
    );

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SIN_TOKEN');
  });

  test('un anuncio inexistente devuelve 404', async () => {
    const respuesta = await desmarcar(tokenCarlos, 999);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.mensaje).toBe('No existe el anuncio 999');
  });

  test('no toca los favoritos de otro usuario sobre el mismo anuncio', async () => {
    // El 6 es de Ana y lo guarda Carlos. Ana no puede quitárselo: el DELETE va
    // filtrado por id_usuario, así que no toca la fila de Carlos.
    await marcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);

    const respuesta = await desmarcar(tokenAna, ID_DE_ANA_PARA_CARLOS);

    expect(respuesta.status).toBe(404);
    expect(await contarFavoritos(2, ID_DE_ANA_PARA_CARLOS)).toBe(1);
  });

  test('borrar un anuncio borra también sus favoritos por cascada', async () => {
    const id = await crearAnuncioDeAna();
    await marcar(tokenCarlos, id);

    await ejecutar('DELETE FROM anuncios WHERE id = ?', [id]);

    expect(await contarFavoritos(2, id)).toBe(0);
  });
});

describe('GET /clasify_api/usuarios/me/favoritos', () => {
  test('devuelve el formato paginado común', async () => {
    const respuesta = await listar();

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      datos: [],
      paginacion: { pagina: 1, limite: 20, total: 0, paginas: 0 }
    });
  });

  test('lista los anuncios guardados con las columnas del listado de anuncios', async () => {
    await marcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);

    const respuesta = await listar();

    expect(respuesta.body.datos).toEqual([
      {
        id: ID_DE_ANA_PARA_CARLOS,
        titulo: 'Mesa de madera',
        precio: '45.00',
        estado: 'disponible',
        imagen: null,
        fecha_creacion: expect.any(String),
        id_categoria: 1
      }
    ]);
    expect(respuesta.body.paginacion.total).toBe(1);
  });

  test('ordena del más reciente al más antiguo por la fecha de guardado', async () => {
    await crearAnuncioDeAna({ titulo: 'Con fecha antigua' });
    // El 7 es de Carlos, así que se inserta la fila directamente para poder
    // darle una fecha anterior a la de las demás.
    const resultado = await ejecutar(
      `INSERT INTO favoritos (id_usuario, id_anuncio, fecha)
       VALUES (2, 7, DATE_SUB(NOW(), INTERVAL 1 HOUR))`
    );

    expect(resultado.affectedRows).toBe(1);
    await marcar(tokenCarlos, 6);
    await marcar(tokenCarlos, 5);

    const respuesta = await listar();

    expect(respuesta.body.datos.map((fila) => fila.id)).toEqual([5, 6, 7]);
  });

  test('incluye los anuncios vendidos', async () => {
    await ejecutar('UPDATE anuncios SET estado = ? WHERE id = ?', ['vendido', 6]);
    await marcar(tokenCarlos, 6);

    const respuesta = await listar();

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0].estado).toBe('vendido');
  });

  test('pagina con pagina y limite', async () => {
    // El 7 es de Carlos, así que para tener tres favoritos hacen falta tres
    // anuncios de Ana: los dos de `sembrarBase` y uno más.
    const tercero = await crearAnuncioDeAna({ titulo: 'Lámpara de mesa' });
    for (const id of [5, 6, tercero]) {
      await marcar(tokenCarlos, id);
    }

    const respuesta = await listar(tokenCarlos).query({ pagina: 2, limite: 2 });

    expect(respuesta.body.paginacion).toEqual({ pagina: 2, limite: 2, total: 3, paginas: 2 });
    expect(respuesta.body.datos).toHaveLength(1);
  });

  test.each([
    ['limite=0', { limite: 0 }],
    ['limite=101', { limite: 101 }],
    ['limite=abc', { limite: 'abc' }],
    ['pagina=0', { pagina: 0 }]
  ])('devuelve 400 con %s', async (_caso, query) => {
    const respuesta = await listar().query(query);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('VALIDACION');
  });

  test('sin token devuelve 401', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/me/favoritos');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SIN_TOKEN');
  });

  test('no deja ver los favoritos de otro usuario', async () => {
    await marcar(tokenCarlos, ID_DE_ANA_PARA_CARLOS);

    const respuesta = await listar(tokenAna);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([]);
    expect(respuesta.body.paginacion.total).toBe(0);
  });

  test('no existe una ruta de favoritos de otro usuario', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/2/favoritos');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });
});

describe('num_favoritos del detalle', () => {
  test('cuenta los favoritos reales del anuncio', async () => {
    const id = await crearAnuncioDeAna();
    await marcar(tokenCarlos, id);

    const respuesta = await request(app).get(`/clasify_api/anuncios/${id}`);

    expect(respuesta.body.datos.anuncio.num_favoritos).toBe(1);
  });

  test('bajar el contador al quitar el favorito', async () => {
    const id = await crearAnuncioDeAna();
    await marcar(tokenCarlos, id);
    await desmarcar(tokenCarlos, id);

    const respuesta = await request(app).get(`/clasify_api/anuncios/${id}`);

    expect(respuesta.body.datos.anuncio.num_favoritos).toBe(0);
  });
});
