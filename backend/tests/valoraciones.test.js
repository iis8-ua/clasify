'use strict';

const request = require('supertest');
const app = require('../src/app');
const { pool, ejecutar, consultar } = require('../src/db/pool');
const { prepararBaseDePruebas, limpiarTablas } = require('./ayudaBaseDeDatos');
const { firmarToken } = require('../src/services/authService');

/**
 * Hash del seed. Como en el resto de la suite, no se usa para hacer login: los
 * tokens se firman directamente porque `bcrypt` con coste 12 serían unos 300 ms
 * por llamada.
 */
const HASH = '$2b$12$zvGU1QCN7FVLhEl5ViOEd.QN907DrZYboJGWNDQmfWt9eCZ3sak/G';

const EMAIL_ANA = 'ana@example.com';
const EMAIL_CARLOS = 'carlos@example.com';
const EMAIL_LUCIA = 'lucia@example.com';

// Ana es la 1, Carlos la 2 y Lucía la 3.
const ANA = 1;
const CARLOS = 2;
const LUCIA = 3;

let tokenAna;
let tokenCarlos;
let tokenLucia;

function como(token) {
  return { Authorization: `Bearer ${token}` };
}

function poner(puntuacion, idValorador, idValorado, comentario = null) {
  return ejecutar(
    'INSERT INTO valoraciones (puntuacion, comentario, id_valorador, id_valorado) VALUES (?, ?, ?, ?)',
    [puntuacion, comentario, idValorador, idValorado]
  );
}

beforeAll(async () => {
  await prepararBaseDePruebas();
});

beforeEach(async () => {
  await limpiarTablas();
  // `limpiarTablas` deja ya la categoría 1 ('Electrónica').
  for (const [email, nombre] of [
    [EMAIL_ANA, 'Ana Ruiz'],
    [EMAIL_CARLOS, 'Carlos Díaz'],
    [EMAIL_LUCIA, 'Lucía Paz']
  ]) {
    await ejecutar('INSERT INTO usuarios (email, nombre, password_hash) VALUES (?, ?, ?)', [
      email,
      nombre,
      HASH
    ]);
  }

  tokenAna = firmarToken({ id: ANA, email: EMAIL_ANA });
  tokenCarlos = firmarToken({ id: CARLOS, email: EMAIL_CARLOS });
  tokenLucia = firmarToken({ id: LUCIA, email: EMAIL_LUCIA });
});

afterAll(async () => {
  await pool.end();
});

describe('PUT /clasify_api/usuarios/:id/valoracion', () => {
  test('crea la valoración y devuelve 201', async () => {
    const respuesta = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion: 5, comentario: 'Vendedor perfecto' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos).toEqual({
      nuevo: true,
      valoracion: {
        id: expect.any(Number),
        puntuacion: 5,
        comentario: 'Vendedor perfecto',
        fecha: expect.any(String),
        id_valorador: ANA,
        id_valorado: CARLOS
      }
    });
  });

  test('sin comentario guarda null y no una cadena vacía', async () => {
    const respuesta = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion: 4 });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.valoracion.comentario).toBeNull();
  });

  test('un comentario en blanco se guarda como null, no como vacío', async () => {
    const respuesta = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion: 4, comentario: '   ' });

    expect(respuesta.body.datos.valoracion.comentario).toBeNull();
  });

  test('volver a valorar cambia la existente y devuelve 200', async () => {
    await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion: 5, comentario: 'Perfecto' });

    const respuesta = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion: 2, comentario: 'Cambio de opinión' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.nuevo).toBe(false);
    expect(respuesta.body.datos.valoracion.puntuacion).toBe(2);
    expect(respuesta.body.datos.valoracion.comentario).toBe('Cambio de opinión');
  });

  test('repetir el mismo PUT no crea una segunda fila', async () => {
    const cuerpo = { puntuacion: 3, comentario: 'Ni fu ni fa' };

    const primera = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send(cuerpo);
    const segunda = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send(cuerpo);

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(200);
    // Misma fila: si el id cambia, el UNIQUE no está haciendo su trabajo.
    expect(segunda.body.datos.valoracion.id).toBe(primera.body.datos.valoracion.id);

    const filas = await consultar('SELECT id FROM valoraciones');
    expect(filas).toHaveLength(1);
  });

  test('quitar el comentario en una segunda llamada deja null', async () => {
    await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion: 4, comentario: 'Con comentario' });

    const respuesta = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion: 4 });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.valoracion.comentario).toBeNull();
  });

  test('cada usuario valora una sola vez al mismo', async () => {
    await request(app).put(`/clasify_api/usuarios/${CARLOS}/valoracion`).set(como(tokenAna)).send({ puntuacion: 5 });
    await request(app).put(`/clasify_api/usuarios/${CARLOS}/valoracion`).set(como(tokenLucia)).send({ puntuacion: 3 });

    const filas = await consultar('SELECT id_valorador, puntuacion FROM valoraciones ORDER BY id_valorador');
    expect(filas).toEqual([
      { id_valorador: ANA, puntuacion: 5 },
      { id_valorador: LUCIA, puntuacion: 3 }
    ]);
  });

  test('no se puede valorar a uno mismo', async () => {
    const respuesta = await request(app)
      .put(`/clasify_api/usuarios/${ANA}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion: 5 });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'usuario' });
    expect(await consultar('SELECT id FROM valoraciones')).toHaveLength(0);
  });

  test.each([
    ['cero', 0],
    ['seis', 6],
    ['un decimal', 3.5],
    ['texto', '3'],
    ['true', true],
    ['null', null],
    ['undefined', undefined]
  ])('rechaza la puntuación %s con 400', async (_caso, puntuacion) => {
    const respuesta = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'puntuacion' });
  });

  test('sin cuerpo da 400 y no un 500', async () => {
    const respuesta = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'puntuacion' });
  });

  test('un comentario de 500 caracteres pasa y uno de 501 no', async () => {
    const largo = 'a'.repeat(500);

    const ok = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion: 5, comentario: largo });
    expect(ok.status).toBe(201);
    expect(ok.body.datos.valoracion.comentario).toHaveLength(500);

    const demasiado = await request(app)
      .put(`/clasify_api/usuarios/${LUCIA}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion: 5, comentario: 'a'.repeat(501) });
    expect(demasiado.status).toBe(400);
    expect(demasiado.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'comentario' });
  });

  test('un comentario que no es texto da 400', async () => {
    const respuesta = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna))
      .send({ puntuacion: 5, comentario: 42 });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'comentario' });
  });

  test('sin token devuelve 401', async () => {
    const respuesta = await request(app)
      .put(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .send({ puntuacion: 5 });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SIN_TOKEN');
  });

  test('un id que no es un entero da 400', async () => {
    const respuesta = await request(app)
      .put('/clasify_api/usuarios/ana/valoracion')
      .set(como(tokenAna))
      .send({ puntuacion: 5 });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'id' });
  });

  test('valorar a un usuario inexistente devuelve 404 y no guarda nada', async () => {
    const respuesta = await request(app)
      .put('/clasify_api/usuarios/999/valoracion')
      .set(como(tokenAna))
      .send({ puntuacion: 5 });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
    expect(await consultar('SELECT id FROM valoraciones')).toHaveLength(0);
  });
});

describe('DELETE /clasify_api/usuarios/:id/valoracion', () => {
  test('borra la valoración propia y devuelve 204', async () => {
    await request(app).put(`/clasify_api/usuarios/${CARLOS}/valoracion`).set(como(tokenAna)).send({ puntuacion: 5 });

    const respuesta = await request(app)
      .delete(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna));

    expect(respuesta.status).toBe(204);
    expect(respuesta.body).toEqual({});
    expect(await consultar('SELECT id FROM valoraciones')).toHaveLength(0);
  });

  test('borrar dos veces: la segunda da 404', async () => {
    await request(app).put(`/clasify_api/usuarios/${CARLOS}/valoracion`).set(como(tokenAna)).send({ puntuacion: 5 });

    const primera = await request(app)
      .delete(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna));
    const segunda = await request(app)
      .delete(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenAna));

    expect(primera.status).toBe(204);
    expect(segunda.status).toBe(404);
    expect(segunda.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  test('no borra la valoración de otro', async () => {
    await request(app).put(`/clasify_api/usuarios/${CARLOS}/valoracion`).set(como(tokenAna)).send({ puntuacion: 5 });

    // Lucía intenta borrar lo que Ana le puso a Carlos.
    const respuesta = await request(app)
      .delete(`/clasify_api/usuarios/${CARLOS}/valoracion`)
      .set(como(tokenLucia));

    expect(respuesta.status).toBe(404);
    expect(await consultar('SELECT id FROM valoraciones')).toHaveLength(1);
  });

  test('sin token devuelve 401', async () => {
    const respuesta = await request(app).delete(`/clasify_api/usuarios/${CARLOS}/valoracion`);

    expect(respuesta.status).toBe(401);
  });

  test('un usuario inexistente da 404', async () => {
    const respuesta = await request(app)
      .delete('/clasify_api/usuarios/999/valoracion')
      .set(como(tokenAna));

    expect(respuesta.status).toBe(404);
  });
});

describe('GET /clasify_api/usuarios/:id/valoraciones', () => {
  test('lista sin token y sale el nombre de quien valoraciones, sin email', async () => {
    await poner(5, ANA, CARLOS, 'Buen vendedor');
    await poner(3, LUCIA, CARLOS, 'Tardó en responder');

    const respuesta = await request(app).get(`/clasify_api/usuarios/${CARLOS}/valoraciones`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toHaveLength(2);
    // La de Lucía es la más reciente, así que va la primera.
    expect(respuesta.body.datos[0]).toMatchObject({
      puntuacion: 3,
      comentario: 'Tardó en responder',
      autor: { id: LUCIA, nombre: 'Lucía Paz' }
    });
    expect(respuesta.body.datos[1]).toMatchObject({
      puntuacion: 5,
      comentario: 'Buen vendedor',
      autor: { id: ANA, nombre: 'Ana Ruiz' }
    });
    expect(respuesta.body.datos[0].autor).not.toHaveProperty('email');
    expect(respuesta.body.datos[0].autor).not.toHaveProperty('password_hash');
    expect(respuesta.body.paginacion).toEqual({ pagina: 1, limite: 20, total: 2, paginas: 1 });
  });

  test('sale de la más reciente a la más antigua', async () => {
    await poner(1, ANA, CARLOS);
    await poner(5, LUCIA, CARLOS);

    const respuesta = await request(app).get(`/clasify_api/usuarios/${CARLOS}/valoraciones`);

    expect(respuesta.body.datos.map((v) => v.autor.id)).toEqual([LUCIA, ANA]);
  });

  test('pagina', async () => {
    for (const valorador of [ANA, CARLOS, LUCIA]) {
      await poner(4, valorador, 1);
    }

    const respuesta = await request(app).get(`/clasify_api/usuarios/${ANA}/valoraciones?pagina=2&limite=2`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.paginacion).toEqual({ pagina: 2, limite: 2, total: 3, paginas: 2 });
  });

  test('un usuario sin valoraciones devuelve la lista vacía, no un 404', async () => {
    const respuesta = await request(app).get(`/clasify_api/usuarios/${CARLOS}/valoraciones`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([]);
    expect(respuesta.body.paginacion.total).toBe(0);
  });

  test('un usuario inexistente da 404', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/999/valoraciones');

    expect(respuesta.status).toBe(404);
  });
});

describe('GET /clasify_api/usuarios/me/valoraciones', () => {
test('devuelve las que he puesto yo, con la media de quien las ha recibido', async () => {
    await poner(5, ANA, CARLOS, 'Me ha encantado');
    await poner(2, ANA, LUCIA);

    const respuesta = await request(app).get('/clasify_api/usuarios/me/valoraciones').set(como(tokenAna));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toHaveLength(2);
    // La más reciente es la de Lucía.
    expect(respuesta.body.datos[0]).toMatchObject({
      puntuacion: 2,
      para: { id: LUCIA, nombre: 'Lucía Paz', valoracion_media: 2, num_valoraciones: 1 }
    });
    expect(respuesta.body.datos[1]).toMatchObject({
      puntuacion: 5,
      para: { id: CARLOS, nombre: 'Carlos Díaz', valoracion_media: 5, num_valoraciones: 1 }
    });
  });

  test('no devuelve lo que otros le han puesto a otro', async () => {
    await poner(5, ANA, CARLOS);
    await poner(1, LUCIA, CARLOS);

    const respuesta = await request(app).get('/clasify_api/usuarios/me/valoraciones').set(como(tokenAna));

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0].para.id).toBe(CARLOS);
  });

  test('sin token devuelve 401', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/me/valoraciones');

    expect(respuesta.status).toBe(401);
  });
});

describe('Resumen de valoraciones en los perfiles', () => {
  test('el perfil público lleva media y recuento', async () => {
    await poner(5, ANA, CARLOS);
    await poner(4, LUCIA, CARLOS);

    const respuesta = await request(app).get(`/clasify_api/usuarios/${CARLOS}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario).toMatchObject({
      id: CARLOS,
      valoracion_media: 4.5,
      num_valoraciones: 2
    });
  });

  test('la media se redondea a dos decimales', async () => {
    // Un cuarto usuario, para poder tener tres valoraciones sobre Ana y que la
    // media dé un decimal repetido (13/3 = 4,333...).
    await ejecutar('INSERT INTO usuarios (email, nombre, password_hash) VALUES (?, ?, ?)', [
      'marta@example.com',
      'Marta Ruiz',
      HASH
    ]);

    await poner(5, CARLOS, ANA);
    await poner(4, LUCIA, ANA);
    await poner(4, 4, ANA);

    const respuesta = await request(app).get(`/clasify_api/usuarios/${ANA}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario).toMatchObject({
      valoracion_media: 4.33,
      num_valoraciones: 3
    });
    // Es un número de JSON, no el texto "4.33" que devuelve el driver.
    expect(typeof respuesta.body.datos.usuario.valoracion_media).toBe('number');
  });

  test('sin valoraciones la media es null y el recuento 0', async () => {
    const respuesta = await request(app).get(`/clasify_api/usuarios/${CARLOS}`);

    expect(respuesta.body.datos.usuario.valoracion_media).toBeNull();
    expect(respuesta.body.datos.usuario.num_valoraciones).toBe(0);
  });

  test('el perfil propio también lleva el resumen', async () => {
    await poner(4, ANA, CARLOS);
    await poner(5, CARLOS, ANA);

    const respuesta = await request(app).get('/clasify_api/usuarios/me').set(como(tokenAna));

    expect(respuesta.body.datos.usuario).toMatchObject({
      valoracion_media: 5,
      num_valoraciones: 1
    });
  });

  test('/auth/yo también lleva el resumen', async () => {
    await poner(4, ANA, CARLOS);

    const respuesta = await request(app).get('/clasify_api/auth/yo').set(como(tokenCarlos));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario).toMatchObject({
      valoracion_media: 4,
      num_valoraciones: 1
    });
  });

  test('la media es siempre la del perfil visto, no la de quien mira', async () => {
    // Ana tiene una valoración de 5; Carlos le pone un 1 y una valoración de 1 a Lucía.
    await poner(5, ANA, CARLOS);
    await poner(1, CARLOS, ANA);
    await poner(1, LUCIA, ANA);

    const vistoPorLucia = await request(app).get(`/clasify_api/usuarios/${ANA}`).set(como(tokenLucia));
    expect(vistoPorLucia.body.datos.usuario.valoracion_media).toBe(1);

    const vistoPorCarlos = await request(app).get(`/clasify_api/usuarios/${ANA}`).set(como(tokenCarlos));
    expect(vistoPorCarlos.body.datos.usuario.valoracion_media).toBe(1);
  });
});

describe('mi_valoracion en el perfil público', () => {
  test('sin token no sale mi_valoracion pero sí el resumen', async () => {
    await poner(5, ANA, CARLOS);

    const respuesta = await request(app).get(`/clasify_api/usuarios/${CARLOS}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario).not.toHaveProperty('mi_valoracion');
    expect(respuesta.body.datos.usuario.num_valoraciones).toBe(1);
  });

  test('con token, si ya se le puso, sale lo que puso', async () => {
    await poner(5, ANA, CARLOS, 'Encantada');

    const respuesta = await request(app).get(`/clasify_api/usuarios/${CARLOS}`).set(como(tokenAna));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario.mi_valoracion).toEqual({
      puntuacion: 5,
      comentario: 'Encantada',
      fecha: expect.any(String)
    });
  });

  test('con token de alguien que no ha valorado no sale mi_valoracion', async () => {
    await poner(5, ANA, CARLOS);

    const respuesta = await request(app).get(`/clasify_api/usuarios/${CARLOS}`).set(como(tokenLucia));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario).not.toHaveProperty('mi_valoracion');
  });

  test('un token inválido deja la petición como anónima y no da 401', async () => {
    await poner(5, ANA, CARLOS);

    const respuesta = await request(app)
      .get(`/clasify_api/usuarios/${CARLOS}`)
      .set({ Authorization: 'Bearer no-es-un-token' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario).not.toHaveProperty('mi_valoracion');
    expect(respuesta.body.datos.usuario.num_valoraciones).toBe(1);
  });

  test('mi_valoracion solo sale sobre el perfil del otro, no sobre el propio', async () => {
    await poner(5, ANA, CARLOS);

    const propia = await request(app).get('/clasify_api/usuarios/me').set(como(tokenAna));
    expect(propia.body.datos.usuario).not.toHaveProperty('mi_valoracion');
  });
});

describe('El resumen en el autor del detalle de un anuncio', () => {
  beforeEach(async () => {
    await ejecutar(
      `INSERT INTO anuncios (titulo, descripcion, precio, id_autor, id_categoria, estado)
       VALUES ('Mesa de madera', 'De roble', 45, ?, 1, 'disponible')`,
      [CARLOS]
    );
  });

  test('el autor del detalle lleva media y recuento', async () => {
    await poner(5, ANA, CARLOS);
    await poner(3, LUCIA, CARLOS);

    const respuesta = await request(app).get('/clasify_api/anuncios/1');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.anuncio.autor).toMatchObject({
      id: CARLOS,
      valoracion_media: 4,
      num_valoraciones: 2
    });
  });

  test('sin valoraciones sale null y 0, y el anuncio no lleva email del autor', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios/1');

    expect(respuesta.body.datos.anuncio.autor.valoracion_media).toBeNull();
    expect(respuesta.body.datos.anuncio.autor.num_valoraciones).toBe(0);
    expect(respuesta.body.datos.anuncio.autor).not.toHaveProperty('email');
  });
});

describe('Cascada al borrar un usuario', () => {
  test('se borran las valoraciones que dio y las que recibió', async () => {
    await poner(5, ANA, CARLOS);
    await poner(2, CARLOS, ANA);
    await poner(4, LUCIA, ANA);

    await ejecutar('DELETE FROM usuarios WHERE id = ?', [CARLOS]);

    const filas = await consultar('SELECT id_valorador, id_valorado FROM valoraciones');
    // La de Ana sobre Carlos y la de Carlos sobre Ana se van con el borrado.
    // La de Lucía sobre Ana se queda, y la media de Ana baja a 4.
    expect(filas).toEqual([{ id_valorador: LUCIA, id_valorado: ANA }]);

    const perfil = await request(app).get(`/clasify_api/usuarios/${ANA}`);
    expect(perfil.body.datos.usuario.valoracion_media).toBe(4);
    expect(perfil.body.datos.usuario.num_valoraciones).toBe(1);
  });

  test('borrar al autor borra las valoraciones que tenía y sus anuncios se van en cascada', async () => {
    await poner(5, ANA, CARLOS);
    await poner(1, ANA, LUCIA);

    await ejecutar('DELETE FROM usuarios WHERE id = ?', [ANA]);

    expect(await consultar('SELECT id FROM valoraciones')).toHaveLength(0);
  });
});

describe('El CHECK de la puntuación es la red de seguridad, no la validación', () => {
  test('MySQL rechaza un 7 aunque se salta la capa de validación', async () => {
    await poner(5, ANA, CARLOS);

    // Se escribe directo contra la base de datos, saltándose la API, que es
    // justamente el caso que el CHECK tiene que cubrir.
    await expect(poner(7, LUCIA, CARLOS)).rejects.toThrow(/Check constraint/i);
  });
});