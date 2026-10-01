'use strict';

const request = require('supertest');
const app = require('../src/app');
const { pool, ejecutar } = require('../src/db/pool');
const { prepararBaseDePruebas, limpiarTablas } = require('./ayudaBaseDeDatos');
const { firmarToken } = require('../src/services/authService');

const EMAIL_ANA = 'ana@example.com';
const EMAIL_CARLOS = 'carlos@example.com';
const EMAIL_LUCIA = 'lucia@example.com';

/**
 * Hash del seed. No se usa para hacer login en ningún test (los tokens se firman
 * directamente), pero la columna es `NOT NULL` sin valor por defecto.
 */
const HASH = '$2b$12$zvGU1QCN7FVLhEl5ViOEd.QN907DrZYboJGWNDQmfWt9eCZ3sak/G';

// `TRUNCATE` reinicia el `AUTO_INCREMENT`, así que los ids son siempre los mismos:
// Ana vende los anuncios 1 y 2, Carlos el 3, y Lucía no publica ninguno.
let tokenAna;
let tokenCarlos;
let tokenLucia;

function como(token) {
  return { Authorization: `Bearer ${token}` };
}

function crearAnuncio(extra = {}) {
  const campos = {
    titulo: 'Anuncio',
    descripcion: 'Descripción de prueba',
    precio: 10,
    id_autor: 1,
    estado: 'disponible',
    ...extra
  };
  return ejecutar(
    `INSERT INTO anuncios (titulo, descripcion, precio, id_autor, id_categoria, estado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      campos.titulo,
      campos.descripcion,
      campos.precio,
      campos.id_autor,
      1,
      campos.estado
    ]
  ).then((r) => r.insertId);
}

/** Varios mensajes del comprador sobre el anuncio 1, para tener un hilo. */
async function crearConversacion(extra = {}) {
  const { idAnuncio = 1, idComprador = 2, mensajes = [] } = extra;
  const idConversacion = await ejecutar(
    'INSERT INTO conversaciones (id_anuncio, id_comprador) VALUES (?, ?)',
    [idAnuncio, idComprador]
  ).then((r) => r.insertId);

  for (const texto of mensajes) {
    await ejecutar('INSERT INTO mensajes (texto, id_conversacion, id_emisor) VALUES (?, ?, ?)', [
      texto,
      idConversacion,
      idComprador
    ]);
  }

  return idConversacion;
}

/** Texto de los mensajes devueltos, en el orden en que los devuelve la API. */
function textos(respuesta) {
  return respuesta.body.datos.map((m) => m.texto);
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

  await crearAnuncio({ titulo: 'Mesa de madera' });
  await crearAnuncio({ titulo: 'Sofá de secondhand', estado: 'vendido' });
  await crearAnuncio({ titulo: 'Bicicleta', id_autor: 2 });
  await crearAnuncio({ titulo: 'Estantería' });
  await crearAnuncio({ titulo: 'Lámpara' });

  tokenAna = firmarToken({ id: 1, email: EMAIL_ANA });
  tokenCarlos = firmarToken({ id: 2, email: EMAIL_CARLOS });
  tokenLucia = firmarToken({ id: 3, email: EMAIL_LUCIA });
});

afterAll(async () => {
  await pool.end();
});

describe('POST /clasify_api/anuncios/:id/mensajes', () => {
  test('sin token devuelve 401', async () => {
    const respuesta = await request(app).post('/clasify_api/anuncios/1/mensajes').send({ texto: 'Hola' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SIN_TOKEN');
  });

  test('con datos válidos devuelve 201 con la conversación y el mensaje', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/anuncios/1/mensajes')
      .set(como(tokenCarlos))
      .send({ texto: 'Hola, ¿sigue disponible la mesa?' });

    expect(respuesta.status).toBe(201);
    const { conversacion, mensaje } = respuesta.body.datos;
    expect(conversacion).toMatchObject({ id: 1, id_anuncio: 1, id_comprador: 2 });
    expect(conversacion.fecha_creacion).toEqual(expect.any(String));
    expect(mensaje).toMatchObject({
      id: 1,
      texto: 'Hola, ¿sigue disponible la mesa?',
      leido: false,
      id_conversacion: 1,
      id_emisor: 2
    });
    expect(mensaje.fecha).toEqual(expect.any(String));
  });

  test('sobre un anuncio con conversación previa devuelve 200 y reutiliza el hilo', async () => {
    const idConversacion = await crearConversacion();

    const respuesta = await request(app)
      .post('/clasify_api/anuncios/1/mensajes')
      .set(como(tokenCarlos))
      .send({ texto: 'Segundo mensaje' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.conversacion.id).toBe(idConversacion);
    expect(respuesta.body.datos.mensaje.texto).toBe('Segundo mensaje');
  });

  test('el texto se guarda recortado', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/anuncios/1/mensajes')
      .set(como(tokenCarlos))
      .send({ texto: '  Hola  ' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.mensaje.texto).toBe('Hola');
  });

  test('sobre el propio anuncio devuelve 400 en el campo anuncio', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/anuncios/1/mensajes')
      .set(como(tokenAna))
      .send({ texto: 'Hola' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'anuncio' });
  });

  test('sobre un anuncio vendido devuelve 400 en el campo estado', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/anuncios/2/mensajes')
      .set(como(tokenCarlos))
      .send({ texto: 'Hola' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'estado' });
  });

  // El hilo se abrió cuando el anuncio todavía estaba disponible, así que tiene
  // que poder seguir: se vuelve a escribir por `/conversaciones/:id/mensajes` y
  // ahí no hay ninguna comprobación de estado. Si también se cerrara aquí, las
  // dos rutas darían respuestas distintas para lo mismo.
  test('en un hilo ya abierto de un anuncio vendido devuelve 200 y sigue escribiendo', async () => {
    await crearConversacion({ idAnuncio: 2, idComprador: 2, mensajes: ['Cuando lo vendiste?'] });

    const respuesta = await request(app)
      .post('/clasify_api/anuncios/2/mensajes')
      .set(como(tokenCarlos))
      .send({ texto: 'Podemos quedar el sábado?' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.conversacion.id).toBe(1);
    expect(respuesta.body.datos.mensaje).toMatchObject({ texto: 'Podemos quedar el sábado?', leido: false });

    const porConversacion = await request(app)
      .post('/clasify_api/conversaciones/1/mensajes')
      .set(como(tokenCarlos))
      .send({ texto: 'Sinceramente, el sábado' });
    expect(porConversacion.status).toBe(201);
  });

  test('sobre un anuncio inexistente devuelve 404', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/anuncios/99/mensajes')
      .set(como(tokenCarlos))
      .send({ texto: 'Hola' });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  test('sin cuerpo devuelve 400 en el campo texto, no un 500', async () => {
    const respuesta = await request(app).post('/clasify_api/anuncios/1/mensajes').set(como(tokenCarlos));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.campo).toBe('texto');
  });

  test('con el texto vacío devuelve 400 y no crea conversación', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/anuncios/1/mensajes')
      .set(como(tokenCarlos))
      .send({ texto: '   ' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'texto' });

    const filas = await ejecutar('SELECT COUNT(*) AS total FROM conversaciones');
    expect(filas[0].total).toBe(0);
  });

  test('sin el campo texto devuelve 400', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/anuncios/1/mensajes')
      .set(como(tokenCarlos))
      .send({});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.campo).toBe('texto');
  });

  test('con un texto de 1001 caracteres devuelve 400 y de 1000 lo acepta', async () => {
    const largo = await request(app)
      .post('/clasify_api/anuncios/1/mensajes')
      .set(como(tokenCarlos))
      .send({ texto: 'a'.repeat(1001) });
    const limite = await request(app)
      .post('/clasify_api/anuncios/1/mensajes')
      .set(como(tokenCarlos))
      .send({ texto: 'a'.repeat(1000) });

    expect(largo.status).toBe(400);
    expect(limite.status).toBe(201);
  });
});

describe('GET /clasify_api/anuncios/:id/mensajes', () => {
  test('sin token devuelve 401', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios/1/mensajes');

    expect(respuesta.status).toBe(401);
  });

  test('sin conversación previa devuelve 200 con la lista vacía', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios/1/mensajes').set(como(tokenCarlos));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([]);
    expect(respuesta.body.paginacion).toMatchObject({ pagina: 1, limite: 20, total: 0, paginas: 0 });
  });

  test('devuelve el hilo del más antiguo al más nuevo', async () => {
    await crearConversacion({ mensajes: ['Hola'] });
    await ejecutar('INSERT INTO mensajes (texto, id_conversacion, id_emisor) VALUES (?, ?, ?)', [
      'Hola a ti',
      1,
      1
    ]);

    const respuesta = await request(app).get('/clasify_api/anuncios/1/mensajes').set(como(tokenCarlos));

    expect(respuesta.status).toBe(200);
    expect(textos(respuesta)).toEqual(['Hola', 'Hola a ti']);
    expect(respuesta.body.paginacion.total).toBe(2);
    expect(respuesta.body.datos).toEqual([
      expect.objectContaining({ id: 1, leido: false, id_emisor: 2, id_conversacion: 1, no_leidos: 1 }),
      expect.objectContaining({ id: 2, leido: true, id_emisor: 1, no_leidos: 1 })
    ]);
  });

  test('marca como leídos los mensajes del vendedor y no los propios', async () => {
    await crearConversacion({ mensajes: ['Hola', '¿Sigue disponible?'] });
    await ejecutar('INSERT INTO mensajes (texto, id_conversacion, id_emisor) VALUES (?, ?, ?)', [
      'Hola a ti',
      1,
      1
    ]);

    const respuesta = await request(app).get('/clasify_api/anuncios/1/mensajes').set(como(tokenCarlos));

    // Lo único pendiente era el mensaje del vendedor, y es el que se marca.
    expect(respuesta.body.datos).toEqual([
      expect.objectContaining({ texto: 'Hola', leido: false, no_leidos: 1 }),
      expect.objectContaining({ texto: '¿Sigue disponible?', leido: false, no_leidos: 1 }),
      expect.objectContaining({ texto: 'Hola a ti', leido: true, no_leidos: 1 })
    ]);
  });

  test('los mensajes ya leídos no cuentan como pendientes', async () => {
    await crearConversacion({ mensajes: ['Hola', 'Otra vez'] });
    await ejecutar('INSERT INTO mensajes (texto, id_conversacion, id_emisor) VALUES (?, ?, ?)', [
      'Hola a ti',
      1,
      1
    ]);
    await ejecutar('UPDATE mensajes SET leido = 1 WHERE id = 2');

    const respuesta = await request(app).get('/clasify_api/anuncios/1/mensajes').set(como(tokenCarlos));

    expect(respuesta.body.datos[0].no_leidos).toBe(1);
    expect(respuesta.body.datos[1].leido).toBe(true);
    expect(respuesta.body.datos[2].leido).toBe(true);
  });

  test('cada comprador tiene su propia conversación con el mismo anuncio', async () => {
    await crearConversacion({ idComprador: 2, mensajes: ['De Carlos'] });
    await crearConversacion({ idComprador: 3, mensajes: ['De Lucía'] });

    const carlos = await request(app).get('/clasify_api/anuncios/1/mensajes').set(como(tokenCarlos));
    const lucia = await request(app).get('/clasify_api/anuncios/1/mensajes').set(como(tokenLucia));

    expect(textos(carlos)).toEqual(['De Carlos']);
    expect(textos(lucia)).toEqual(['De Lucía']);
  });

  test('el vendedor recibe 400 con la ruta donde están sus conversaciones', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios/1/mensajes').set(como(tokenAna));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('VALIDACION');
  });

  test('sobre un anuncio inexistente devuelve 404', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios/99/mensajes').set(como(tokenCarlos));

    expect(respuesta.status).toBe(404);
  });

  // No es lo mismo que el 403 de `/conversaciones/:id/mensajes`: aquí la ruta es
  // la del anuncio y lo que se pregunta es si *este usuario* tiene un hilo con
  // *este vendedor*. Que no lo tenga es lo normal, no un intento de acceso.
  test('un usuario sin ninguna conversación con ese anuncio ve el hilo vacío', async () => {
    await crearConversacion({ idComprador: 2, mensajes: ['De Carlos'] });

    const respuesta = await request(app).get('/clasify_api/anuncios/1/mensajes').set(como(tokenLucia));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([]);
    expect(respuesta.body.paginacion.total).toBe(0);
  });

  test('página sin mensajes devuelve 200 con la lista vacía y el total real', async () => {
    await crearConversacion({ mensajes: ['Hola'] });

    const respuesta = await request(app)
      .get('/clasify_api/anuncios/1/mensajes?pagina=5')
      .set(como(tokenCarlos));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([]);
    expect(respuesta.body.paginacion).toMatchObject({ pagina: 5, total: 1, paginas: 1 });
  });

  test('un límite fuera de rango devuelve 400', async () => {
    const respuesta = await request(app)
      .get('/clasify_api/anuncios/1/mensajes?limite=101')
      .set(como(tokenCarlos));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.campo).toBe('limite');
  });
});

describe('POST /clasify_api/conversaciones/:id/mensajes', () => {
  test('sin token devuelve 401', async () => {
    const idConversacion = await crearConversacion();

    const respuesta = await request(app)
      .post(`/clasify_api/conversaciones/${idConversacion}/mensajes`)
      .send({ texto: 'Hola' });

    expect(respuesta.status).toBe(401);
  });

  test('el vendedor responde con 201 y solo el mensaje', async () => {
    const idConversacion = await crearConversacion();

    const respuesta = await request(app)
      .post(`/clasify_api/conversaciones/${idConversacion}/mensajes`)
      .set(como(tokenAna))
      .send({ texto: 'Hola, sí está disponible' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.conversacion).toBeUndefined();
    expect(respuesta.body.datos.mensaje).toMatchObject({
      id: 1,
      texto: 'Hola, sí está disponible',
      leido: false,
      id_conversacion: idConversacion,
      id_emisor: 1
    });
  });

  test('quien no participa devuelve 403 y no escribe nada', async () => {
    const idConversacion = await crearConversacion();

    const respuesta = await request(app)
      .post(`/clasify_api/conversaciones/${idConversacion}/mensajes`)
      .set(como(tokenLucia))
      .send({ texto: 'Me colé' });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('SIN_PERMISOS');

    const filas = await ejecutar('SELECT COUNT(*) AS total FROM mensajes');
    expect(filas[0].total).toBe(0);
  });

  // El comprador usa la misma ruta que el vendedor: es la que usan los dos
  // participantes una vez que existe el hilo, así que los dos casos tienen que
  // salir igual salvo en quién es `id_emisor`.
  test('el comprador responde con 201 en su propio hilo', async () => {
    const idConversacion = await crearConversacion({ mensajes: ['Hola'] });

    const respuesta = await request(app)
      .post(`/clasify_api/conversaciones/${idConversacion}/mensajes`)
      .set(como(tokenCarlos))
      .send({ texto: 'Sigo interesado' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.mensaje).toMatchObject({
      id: 2,
      texto: 'Sigo interesado',
      leido: false,
      id_conversacion: idConversacion,
      id_emisor: 2
    });
  });

  test('con una conversación inexistente devuelve 404', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/conversaciones/99/mensajes')
      .set(como(tokenAna))
      .send({ texto: 'Hola' });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  test('con un id no numérico devuelve 400', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/conversaciones/abc/mensajes')
      .set(como(tokenAna))
      .send({ texto: 'Hola' });

    expect(respuesta.status).toBe(400);
  });

  test('un texto vacío devuelve 400 y no escribe nada', async () => {
    const idConversacion = await crearConversacion();

    const respuesta = await request(app)
      .post(`/clasify_api/conversaciones/${idConversacion}/mensajes`)
      .set(como(tokenAna))
      .send({ texto: '' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.campo).toBe('texto');
  });
});

describe('GET /clasify_api/conversaciones/:id/mensajes', () => {
  test('sin token devuelve 401', async () => {
    const idConversacion = await crearConversacion();

    const respuesta = await request(app).get(`/clasify_api/conversaciones/${idConversacion}/mensajes`);

    expect(respuesta.status).toBe(401);
  });

  test('el comprador lee su hilo y marca lo del vendedor como leído', async () => {
    await crearConversacion({ mensajes: ['Hola', 'Otra vez'] });
    await ejecutar('INSERT INTO mensajes (texto, id_conversacion, id_emisor) VALUES (?, ?, ?)', [
      'Hola a ti',
      1,
      1
    ]);

    const respuesta = await request(app).get('/clasify_api/conversaciones/1/mensajes').set(como(tokenCarlos));

    expect(respuesta.status).toBe(200);
    expect(textos(respuesta)).toEqual(['Hola', 'Otra vez', 'Hola a ti']);
    expect(respuesta.body.datos[2]).toMatchObject({ leido: true, no_leidos: 1 });
  });

  test('quien no participa devuelve 403 y no ve el contenido', async () => {
    await crearConversacion({ mensajes: ['Secreto'] });

    const respuesta = await request(app)
      .get('/clasify_api/conversaciones/1/mensajes')
      .set(como(tokenLucia));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.datos).toBeUndefined();
  });

  test('con una conversación inexistente devuelve 404', async () => {
    const respuesta = await request(app).get('/clasify_api/conversaciones/99/mensajes').set(como(tokenAna));

    expect(respuesta.status).toBe(404);
  });
});

describe('?desde=inicio|final en los listados de mensajes', () => {
  beforeEach(async () => {
    await crearConversacion({ mensajes: ['M1', 'M2', 'M3', 'M4', 'M5'] });
  });

  test('sin ?desde se empieza por el principio del hilo', async () => {
    const respuesta = await request(app)
      .get('/clasify_api/anuncios/1/mensajes?limite=2')
      .set(como(tokenCarlos));

    expect(respuesta.body.paginacion).toMatchObject({ pagina: 1, limite: 2, total: 5, paginas: 3 });
    expect(textos(respuesta)).toEqual(['M1', 'M2']);
  });

  test('con ?desde=inicio se avanza hacia el final', async () => {
    const respuesta = await request(app)
      .get('/clasify_api/anuncios/1/mensajes?desde=inicio&limite=2&pagina=2')
      .set(como(tokenCarlos));

    expect(textos(respuesta)).toEqual(['M3', 'M4']);
  });

  test('con ?desde=final la primera página trae los últimos, y en orden ascendente', async () => {
    const respuesta = await request(app)
      .get('/clasify_api/anuncios/1/mensajes?desde=final&limite=2')
      .set(como(tokenCarlos));

    expect(textos(respuesta)).toEqual(['M4', 'M5']);
  });

  test('con ?desde=final se retrocede página a página', async () => {
    const segunda = await request(app)
      .get('/clasify_api/anuncios/1/mensajes?desde=final&limite=2&pagina=2')
      .set(como(tokenCarlos));
    const tercera = await request(app)
      .get('/clasify_api/anuncios/1/mensajes?desde=final&limite=2&pagina=3')
      .set(como(tokenCarlos));

    expect(textos(segunda)).toEqual(['M2', 'M3']);
    expect(textos(tercera)).toEqual(['M1']);
  });

  test('con ?desde=final una página que se sale del hilo devuelve la lista vacía', async () => {
    const respuesta = await request(app)
      .get('/clasify_api/anuncios/1/mensajes?desde=final&limite=2&pagina=9')
      .set(como(tokenCarlos));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([]);
    expect(respuesta.body.paginacion.total).toBe(5);
  });

  test('con un ?desde no válido devuelve 400', async () => {
    const respuesta = await request(app)
      .get('/clasify_api/anuncios/1/mensajes?desde=medio')
      .set(como(tokenCarlos));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.campo).toBe('desde');
  });

  test('también funciona en la ruta de la conversación', async () => {
    const respuesta = await request(app)
      .get('/clasify_api/conversaciones/1/mensajes?desde=final&limite=3')
      .set(como(tokenAna));

    expect(textos(respuesta)).toEqual(['M3', 'M4', 'M5']);
  });

  test('las dos rutas rechazan igual un ?desde no válido, sin marcar nada como leído', async () => {
    // Un mensaje del vendedor, para que el comprador tenga algo pendiente que un
    // 400 no pueda marcar por error.
    await ejecutar('INSERT INTO mensajes (texto, id_conversacion, id_emisor) VALUES (?, ?, ?)', [
      'Hola a ti',
      1,
      1
    ]);

    const porAnuncio = await request(app)
      .get('/clasify_api/anuncios/1/mensajes?desde=medio')
      .set(como(tokenCarlos));
    const porConversacion = await request(app)
      .get('/clasify_api/conversaciones/1/mensajes?desde=medio')
      .set(como(tokenCarlos));

    for (const respuesta of [porAnuncio, porConversacion]) {
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'desde' });
    }

    // Validar va antes de tocar la base de datos, así que el mensaje del
    // vendedor sigue pendiente.
    const filas = await ejecutar('SELECT leido FROM mensajes WHERE id_emisor = 1');
    expect(filas).toEqual([{ leido: 0 }]);
  });
});

describe('GET /clasify_api/usuarios/me/conversaciones', () => {
  test('sin token devuelve 401', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/me/conversaciones');

    expect(respuesta.status).toBe(401);
  });

  test('devuelve anuncio, contraparte, último mensaje y pendientes', async () => {
    await crearConversacion({ mensajes: ['Hola'] });
    await ejecutar('INSERT INTO mensajes (texto, id_conversacion, id_emisor) VALUES (?, ?, ?)', [
      'Hola a ti',
      1,
      1
    ]);

    const respuesta = await request(app)
      .get('/clasify_api/usuarios/me/conversaciones')
      .set(como(tokenAna));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.paginacion.total).toBe(1);
    expect(respuesta.body.datos[0]).toEqual({
      id: 1,
      fecha_creacion: expect.any(String),
      anuncio: {
        id: 1,
        titulo: 'Mesa de madera',
        precio: '10.00',
        estado: 'disponible',
        imagen: null,
        fecha_creacion: expect.any(String),
        id_categoria: 1
      },
      contraparte: {
        id: 2,
        nombre: 'Carlos Díaz',
        biografia: null,
        fecha_alta: expect.any(String)
      },
      ultimo_mensaje: { id: 2, texto: 'Hola a ti', fecha: expect.any(String) },
      no_leidos: 1
    });
  });

  test('la contraparte es el vendedor para el comprador y al revés', async () => {
    await crearConversacion({ idComprador: 2, mensajes: ['Hola'] });

    const delComprador = await request(app)
      .get('/clasify_api/usuarios/me/conversaciones')
      .set(como(tokenCarlos));
    const delVendedor = await request(app)
      .get('/clasify_api/usuarios/me/conversaciones')
      .set(como(tokenAna));

    expect(delComprador.body.datos[0].contraparte).toMatchObject({ id: 1, nombre: 'Ana Ruiz' });
    expect(delVendedor.body.datos[0].contraparte).toMatchObject({ id: 2, nombre: 'Carlos Díaz' });
  });

  test('el usuario ve lo que compra y lo que vende, sin duplicar ni mezclar', async () => {
    await crearConversacion({ idAnuncio: 1, idComprador: 2, mensajes: ['Compra'] });
    await crearConversacion({ idAnuncio: 3, idComprador: 1, mensajes: ['Venta'] });

    const deAna = await request(app)
      .get('/clasify_api/usuarios/me/conversaciones')
      .set(como(tokenAna));
    const deLucia = await request(app)
      .get('/clasify_api/usuarios/me/conversaciones')
      .set(como(tokenLucia));

    expect(deAna.body.paginacion.total).toBe(2);
    expect(deAna.body.datos.map((c) => c.id).sort()).toEqual([1, 2]);
    expect(deLucia.body.datos).toEqual([]);
  });

  test('cuenta los mensajes del otro sin leer y no los marca al listar', async () => {
    await crearConversacion({ mensajes: ['Uno', 'Dos', 'Tres'] });

    const primera = await request(app)
      .get('/clasify_api/usuarios/me/conversaciones')
      .set(como(tokenAna));
    const segunda = await request(app)
      .get('/clasify_api/usuarios/me/conversaciones')
      .set(como(tokenAna));

    expect(primera.body.datos[0].no_leidos).toBe(3);
    expect(segunda.body.datos[0].no_leidos).toBe(3);

    const filas = await ejecutar('SELECT leido FROM mensajes WHERE id = 1');
    expect(filas[0].leido).toBe(0);
  });

  test('ordena por última actividad, de la más reciente a la más antigua', async () => {
    await crearConversacion({ idAnuncio: 1, idComprador: 2, mensajes: ['Inicial de la antigua'] });
    await crearConversacion({ idAnuncio: 4, idComprador: 2, mensajes: ['Inicial de la reciente'] });
    await ejecutar('UPDATE mensajes SET fecha = DATE_SUB(NOW(), INTERVAL 2 DAY) WHERE id_conversacion = 1');
    await ejecutar('UPDATE mensajes SET fecha = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id_conversacion = 2');

    const respuesta = await request(app)
      .get('/clasify_api/usuarios/me/conversaciones')
      .set(como(tokenAna));

    expect(respuesta.body.datos.map((c) => c.id)).toEqual([2, 1]);
  });

  test('una conversación sin mensajes aparece al final y con el último mensaje a null', async () => {
    await crearConversacion({ idAnuncio: 1, idComprador: 2, mensajes: ['Con mensajes'] });
    await crearConversacion({ idAnuncio: 4, idComprador: 2 });

    const respuesta = await request(app)
      .get('/clasify_api/usuarios/me/conversaciones')
      .set(como(tokenAna));

    expect(respuesta.body.datos.map((c) => c.ultimo_mensaje)).toEqual([
      { id: 1, texto: 'Con mensajes', fecha: expect.any(String) },
      null
    ]);
  });

  test('pagina la bandeja', async () => {
    for (const idAnuncio of [1, 4, 5]) {
      await crearConversacion({ idAnuncio, idComprador: 2, mensajes: [`Hilo del ${idAnuncio}`] });
    }

    const respuesta = await request(app)
      .get('/clasify_api/usuarios/me/conversaciones?limite=2&pagina=2')
      .set(como(tokenAna));

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.paginacion).toMatchObject({ pagina: 2, limite: 2, total: 3, paginas: 2 });
  });
});

describe('Conversación en el detalle del anuncio', () => {
  test('sin token el anuncio se sirve sin conversación', async () => {
    await crearConversacion();

    const respuesta = await request(app).get('/clasify_api/anuncios/1');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.anuncio.conversacion).toBeUndefined();
  });

  test('con el token del comprador devuelve solo el id de su conversación', async () => {
    const idConversacion = await crearConversacion({ idComprador: 2 });

    const respuesta = await request(app).get('/clasify_api/anuncios/1').set(como(tokenCarlos));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.anuncio.conversacion).toEqual({ id: idConversacion });
  });

  test('con el token del vendedor también, si es el comprador de ese anuncio', async () => {
    await crearConversacion({ idAnuncio: 3, idComprador: 1 });

    const respuesta = await request(app).get('/clasify_api/anuncios/3').set(como(tokenAna));

    expect(respuesta.body.datos.anuncio.conversacion).toEqual({ id: 1 });
  });

  test('con el token del vendedor sin conversación en ese anuncio no se añade el campo', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios/1').set(como(tokenAna));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.anuncio.conversacion).toBeUndefined();
  });

  test('con el token de alguien que no participa no se añade el campo', async () => {
    await crearConversacion({ idComprador: 2 });

    const respuesta = await request(app).get('/clasify_api/anuncios/1').set(como(tokenLucia));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.anuncio.conversacion).toBeUndefined();
  });

  test('con un token inválido se sirve el anuncio como anónimo', async () => {
    await crearConversacion({ idComprador: 2 });

    const respuesta = await request(app)
      .get('/clasify_api/anuncios/1')
      .set('Authorization', 'Bearer no-es-un-jwt');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.anuncio.id).toBe(1);
    expect(respuesta.body.datos.anuncio.conversacion).toBeUndefined();
  });

  test('con un token de un usuario que ya no existe se sirve el anuncio como anónimo', async () => {
    await crearConversacion({ idComprador: 2 });
    await ejecutar('DELETE FROM usuarios WHERE id = 2');

    const respuesta = await request(app).get('/clasify_api/anuncios/1').set(como(tokenCarlos));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.anuncio.conversacion).toBeUndefined();
  });

  test('el resto del detalle del anuncio no cambia', async () => {
    await crearConversacion({ idComprador: 2 });

    const respuesta = await request(app).get('/clasify_api/anuncios/1').set(como(tokenCarlos));

    expect(respuesta.body.datos.anuncio).toMatchObject({
      id: 1,
      titulo: 'Mesa de madera',
      estado: 'disponible',
      imagen: null,
      categoria: { id: 1, nombre: 'Electrónica' }
    });
    expect(respuesta.body.datos.anuncio.autor).toMatchObject({ id: 1, nombre: 'Ana Ruiz' });
  });
});
