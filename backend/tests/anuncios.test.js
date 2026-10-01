'use strict';

const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../src/app');
const { pool, ejecutar } = require('../src/db/pool');
const { prepararBaseDePruebas, limpiarTablas } = require('./ayudaBaseDeDatos');
const { firmarToken } = require('../src/services/authService');

/**
 * Hash del seed. No se usa para hacer login en ningún test (los tokens se firman
 * directamente), pero deja la tabla con datos que parecen reales.
 */
const HASH = '$2b$12$zvGU1QCN7FVLhEl5ViOEd.QN907DrZYboJGWNDQmfWt9eCZ3sak/G';

const EMAIL_ANA = 'ana@example.com';
const EMAIL_CARLOS = 'carlos@example.com';

const CARPETA_UPLOADS = path.join(__dirname, '..', 'uploads');

/** PNG de 1x1, suficiente: multer valida el tipo declarado, no el contenido. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

const CAMPOS = {
  titulo: 'Mesa de madera',
  descripcion: 'Mesa de comedor de roble, poco uso.',
  precio: '45.00',
  categoria: '2'
};

let tokenAna;
let tokenCarlos;

function ficherosEnUploads() {
  return fs.readdirSync(CARPETA_UPLOADS).filter((nombre) => nombre !== '.gitkeep');
}

function limpiarUploads() {
  for (const nombre of ficherosEnUploads()) {
    fs.unlinkSync(path.join(CARPETA_UPLOADS, nombre));
  }
}

/**
 * Deja la base en un estado conocido. `TRUNCATE` reinicia el `AUTO_INCREMENT`, así
 * que los ids de usuarios (1 y 2) y de categorías (1, 2 y 3) son siempre los mismos.
 *
 * Los tokens se firman en lugar de registrarse en cada prueba: `bcrypt` con coste
 * 12 tarda unos 300 ms y multiplicado por los ~50 tests de este fichero sería medio
 * minuto de espera sin ganar nada. El login ya está cubierto en `auth.test.js`.
 */
async function sembrarBase() {
  await limpiarTablas();

  await ejecutar('INSERT INTO categorias (nombre) VALUES (?)', ['Hogar y jardín']);
  await ejecutar('INSERT INTO categorias (nombre) VALUES (?)', ['Deportes']);
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
}

/** Anuncio por SQL, para los tests de listado donde la subida no importa. */
async function crearAnuncio(extra = {}) {
  const campos = {
    titulo: 'Anuncio',
    descripcion: 'Descripción de prueba',
    precio: 10,
    id_autor: 1,
    id_categoria: 1,
    estado: 'disponible',
    ...extra
  };
  const resultado = await ejecutar(
    `INSERT INTO anuncios (titulo, descripcion, precio, id_autor, id_categoria, estado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [campos.titulo, campos.descripcion, campos.precio, campos.id_autor, campos.id_categoria, campos.estado]
  );
  return resultado.insertId;
}

function crearPorApi(token = tokenAna) {
  return request(app).post('/clasify_api/anuncios').set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  await prepararBaseDePruebas();
});

beforeEach(async () => {
  await sembrarBase();
  limpiarUploads();
  tokenAna = firmarToken({ id: 1, email: EMAIL_ANA });
  tokenCarlos = firmarToken({ id: 2, email: EMAIL_CARLOS });
});

afterAll(async () => {
  limpiarUploads();
  await pool.end();
});

describe('POST /clasify_api/anuncios', () => {
  test('sin token devuelve 401', async () => {
    const respuesta = await request(app).post('/clasify_api/anuncios').field(CAMPOS);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SIN_TOKEN');
  });

  test('con datos válidos devuelve 201 y el anuncio completo', async () => {
    const respuesta = await crearPorApi().field(CAMPOS);

    expect(respuesta.status).toBe(201);
    const { anuncio } = respuesta.body.datos;
    expect(anuncio).toMatchObject({
      titulo: CAMPOS.titulo,
      descripcion: CAMPOS.descripcion,
      precio: '45.00',
      estado: 'disponible',
      imagen: null,
      num_favoritos: 0
    });
    expect(anuncio.autor).toMatchObject({ id: 1, nombre: 'Ana Ruiz' });
    expect(anuncio.categoria).toEqual({ id: 2, nombre: 'Hogar y jardín' });

    const guardado = await ejecutar('SELECT id, precio FROM anuncios WHERE id = ?', [anuncio.id]);
    expect(guardado[0].precio).toBe('45.00');
  });

  test('el autor del detalle no lleva el email', async () => {
    const respuesta = await crearPorApi().field(CAMPOS);

    expect(respuesta.body.datos.anuncio.autor.email).toBeUndefined();
    expect(respuesta.body.datos.anuncio.autor.password_hash).toBeUndefined();
  });

  test('el precio se puede mandar como texto o como número', async () => {
    const texto = await crearPorApi().field({ ...CAMPOS, precio: '45.5' });
    expect(texto.status).toBe(201);
    expect(texto.body.datos.anuncio.precio).toBe('45.50');

    const numero = await crearPorApi().field({ ...CAMPOS, precio: 45.5 });
    expect(numero.status).toBe(201);
    expect(numero.body.datos.anuncio.precio).toBe('45.50');
  });

  test.each([
    ['precio negativo', { precio: '-1' }, 'precio'],
    ['precio con 3 decimales', { precio: '45.678' }, 'precio'],
    ['precio no numérico', { precio: 'abc' }, 'precio'],
    ['precio vacío', { precio: '' }, 'precio'],
    ['categoría inexistente', { categoria: '999' }, 'categoria'],
    ['categoría no numérica', { categoria: 'abc' }, 'categoria'],
    ['título vacío', { titulo: '   ' }, 'titulo'],
    ['título demasiado largo', { titulo: 'a'.repeat(151) }, 'titulo'],
    ['descripción vacía', { descripcion: '  ' }, 'descripcion'],
    ['descripción demasiado larga', { descripcion: 'a'.repeat(5001) }, 'descripcion']
  ])('devuelve 400 con %s', async (_caso, cambios, campo) => {
    const respuesta = await crearPorApi().field({ ...CAMPOS, ...cambios });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('VALIDACION');
    expect(respuesta.body.error.campo).toBe(campo);

    expect(await consultarTotalAnuncios()).toBe(0);
  });

  test.each(['descripcion', 'categoria'])('sin %s devuelve 400 señalando el campo', async (campo) => {
    const sinElCampo = { ...CAMPOS };
    delete sinElCampo[campo];

    const respuesta = await crearPorApi().field(sinElCampo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo });
  });

  describe('subida de imagen', () => {
    test('con una imagen válida la guarda y la devuelve', async () => {
      const respuesta = await crearPorApi()
        .field(CAMPOS)
        .attach('imagen', PNG, { filename: 'mesa.png', contentType: 'image/png' });

      expect(respuesta.status).toBe(201);

      const { imagen } = respuesta.body.datos.anuncio;
      expect(imagen).toMatch(/^[0-9a-f-]{36}\.png$/);
      expect(fs.existsSync(path.join(CARPETA_UPLOADS, imagen))).toBe(true);
    });

    test('el nombre del fichero lo pone el servidor, no el cliente', async () => {
      const respuesta = await crearPorApi()
        .field(CAMPOS)
        .attach('imagen', PNG, { filename: '../../secreto.png', contentType: 'image/png' });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.datos.anuncio.imagen).not.toContain('secreto');
      expect(respuesta.body.datos.anuncio.imagen).not.toContain('..');
    });

    test.each([
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/webp', '.webp']
    ])('admite %s', async (contentType, extension) => {
      const respuesta = await crearPorApi()
        .field(CAMPOS)
        .attach('imagen', PNG, { filename: 'foto', contentType });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.datos.anuncio.imagen.endsWith(extension)).toBe(true);
    });

    test('con un tipo no permitido devuelve 400 y no guarda nada', async () => {
      const respuesta = await crearPorApi()
        .field(CAMPOS)
        .attach('imagen', Buffer.from('hola'), { filename: 'notas.txt', contentType: 'text/plain' });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'imagen' });
      expect(ficherosEnUploads()).toEqual([]);
      expect(await consultarTotalAnuncios()).toBe(0);
    });

    test('con una imagen de más de 5 MB devuelve 400 y no guarda el resto', async () => {
      const enorme = Buffer.alloc(5 * 1024 * 1024 + 1024, 0x41);
      const respuesta = await crearPorApi()
        .field(CAMPOS)
        .attach('imagen', enorme, { filename: 'enorme.png', contentType: 'image/png' });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'imagen' });
      expect(respuesta.body.error.mensaje).toContain('5 MB');
      expect(ficherosEnUploads()).toEqual([]);
      expect(await consultarTotalAnuncios()).toBe(0);
    });

    test('la imagen se sirve en /clasify_api/uploads/:fichero', async () => {
      const creado = await crearPorApi()
        .field(CAMPOS)
        .attach('imagen', PNG, { filename: 'mesa.png', contentType: 'image/png' });

      const { imagen } = creado.body.datos.anuncio;
      const respuesta = await request(app).get(`/clasify_api/uploads/${imagen}`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['content-type']).toContain('image/png');
    });

    // multer escribe el fichero antes de que se compruebe el cuerpo, así que un
    // error posterior (este o un 403) dejaría la imagen huérfana en `uploads/`.
    test.each([
      ['el título está vacío', { ...CAMPOS, titulo: '' }, 'titulo'],
      ['la categoría no existe', { ...CAMPOS, categoria: '999' }, 'categoria'],
      ['el precio es negativo', { ...CAMPOS, precio: '-5' }, 'precio']
    ])('si la imagen es válida pero %s, no queda el fichero en disco', async (_caso, campos, campo) => {
      const respuesta = await crearPorApi()
        .field(campos)
        .attach('imagen', PNG, { filename: 'mesa.png', contentType: 'image/png' });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo });
      expect(ficherosEnUploads()).toEqual([]);
      expect(await consultarTotalAnuncios()).toBe(0);
    });
  });
});

async function consultarTotalAnuncios() {
  const filas = await ejecutar('SELECT COUNT(*) AS total FROM anuncios');
  return filas[0].total;
}

describe('GET /clasify_api/anuncios', () => {
  beforeEach(async () => {
    await crearAnuncio({ titulo: 'Mesa de madera', precio: 45, id_categoria: 2 });
    await crearAnuncio({ titulo: 'Bicicleta de montaña', precio: 120.5, id_categoria: 3 });
    await crearAnuncio({ titulo: 'Mesa de cristal', precio: 20, id_categoria: 2 });
    await crearAnuncio({ titulo: 'Silla de oficina', precio: 35.9, id_categoria: 1, estado: 'vendido' });
  });

  test('devuelve 200 con datos y paginación', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?pagina=1&limite=10');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toHaveLength(3);
    expect(respuesta.body.paginacion).toEqual({ pagina: 1, limite: 10, total: 3, paginas: 1 });
    // Nacen los cuatro en el mismo segundo, así que el `id DESC` del desempate
    // delata que la ordenación es estable y no depende del reloj.
    expect(respuesta.body.datos[0]).toMatchObject({
      titulo: 'Mesa de cristal',
      precio: '20.00',
      estado: 'disponible',
      imagen: null,
      id_categoria: 2
    });
  });

  test('por defecto no muestra los vendidos', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios');

    const titulos = respuesta.body.datos.map((a) => a.titulo);
    expect(titulos).not.toContain('Silla de oficina');
    expect(respuesta.body.paginacion.total).toBe(3);
  });

  test('con estado=vendido solo salen los vendidos', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?estado=vendido');

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0].titulo).toBe('Silla de oficina');
  });

  test('con estado=todos salen todos', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?estado=todos');

    expect(respuesta.body.datos).toHaveLength(4);
    expect(respuesta.body.paginacion.total).toBe(4);
  });

  test('con un estado no permitido devuelve 400', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?estado=todo');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'estado' });
  });

  test('busca por texto en el título', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?texto=bicicleta');

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0].titulo).toBe('Bicicleta de montaña');
  });

  test('busca por texto en la descripción', async () => {
    await crearAnuncio({ titulo: 'Chaleco', descripcion: 'De segunda mano, poco uso.', precio: 5 });

    const respuesta = await request(app).get('/clasify_api/anuncios?texto=segunda%20mano');

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0].titulo).toBe('Chaleco');
  });

  test('la búsqueda no distingue mayúsculas ni acentos', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?texto=MONTA%C3%91A');

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0].titulo).toBe('Bicicleta de montaña');
  });

  test('los comodines de LIKE se buscan literalmente', async () => {
    await crearAnuncio({ titulo: 'Rebaja 50% en todo', precio: 5 });

    const respuesta = await request(app).get('/clasify_api/anuncios?texto=50%25');

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0].titulo).toBe('Rebaja 50% en todo');
  });

  test('un texto que no aparece en nada devuelve la lista vacía', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?texto=zzzz');

    expect(respuesta.body.datos).toEqual([]);
    expect(respuesta.body.paginacion).toEqual({ pagina: 1, limite: 20, total: 0, paginas: 0 });
  });

  test('filtra por categoría', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?categoria=2');

    expect(respuesta.body.datos).toHaveLength(2);
    expect(respuesta.body.datos.every((a) => a.id_categoria === 2)).toBe(true);
  });

  test('combina texto, categoría y estado', async () => {
    await crearAnuncio({ titulo: 'Mesa de vintage', precio: 10, id_categoria: 2, estado: 'vendido' });

    const respuesta = await request(app).get('/clasify_api/anuncios?texto=mesa&categoria=2&estado=todos');

    expect(respuesta.body.datos).toHaveLength(3);
  });

  test('con una categoría inexistente devuelve 400', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?categoria=999');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'categoria' });
  });

  test.each([
    ['precio_asc', ['Mesa de cristal', 'Mesa de madera', 'Bicicleta de montaña']],
    ['precio_desc', ['Bicicleta de montaña', 'Mesa de madera', 'Mesa de cristal']],
    ['fecha_asc', ['Mesa de madera', 'Bicicleta de montaña', 'Mesa de cristal']],
    ['fecha_desc', ['Mesa de cristal', 'Bicicleta de montaña', 'Mesa de madera']]
  ])('ordena con orden=%s', async (orden, titulos) => {
    const respuesta = await request(app).get(`/clasify_api/anuncios?orden=${orden}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.map((a) => a.titulo)).toEqual(titulos);
  });

  test('con un orden no permitido devuelve 400', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?orden=titulo');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'orden' });
  });

  test('respeta la paginación', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?orden=precio_asc&pagina=2&limite=2');

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0].titulo).toBe('Bicicleta de montaña');
    expect(respuesta.body.paginacion).toEqual({ pagina: 2, limite: 2, total: 3, paginas: 2 });
  });

  test('con limite fuera de rango devuelve 400', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios?limite=999');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'limite' });
  });

  test('sin anuncios devuelve la lista vacía', async () => {
    await ejecutar('DELETE FROM anuncios');

    const respuesta = await request(app).get('/clasify_api/anuncios');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([]);
    expect(respuesta.body.paginacion.total).toBe(0);
  });
});

describe('GET /clasify_api/anuncios/:id', () => {
  test('devuelve el anuncio con autor, categoría y número de favoritos', async () => {
    const id = await crearAnuncio({ titulo: 'Mesa de madera', precio: 45 });

    const respuesta = await request(app).get(`/clasify_api/anuncios/${id}`);

    expect(respuesta.status).toBe(200);
    const { anuncio } = respuesta.body.datos;
    expect(anuncio).toMatchObject({
      id,
      titulo: 'Mesa de madera',
      descripcion: 'Descripción de prueba',
      precio: '45.00',
      num_favoritos: 0
    });
    expect(anuncio.autor).toEqual({
      id: 1,
      nombre: 'Ana Ruiz',
      biografia: null,
      fecha_alta: expect.any(String),
      valoracion_media: null,
      num_valoraciones: 0
    });
    expect(anuncio.categoria).toEqual({ id: 1, nombre: 'Electrónica' });
  });

  test('el autor del detalle no lleva el email', async () => {
    const id = await crearAnuncio();

    const respuesta = await request(app).get(`/clasify_api/anuncios/${id}`);

    expect(respuesta.body.datos.anuncio.autor.email).toBeUndefined();
  });

  test('num_favoritos cuenta los favoritos del anuncio', async () => {
    const id = await crearAnuncio();
    await ejecutar('INSERT INTO favoritos (id_usuario, id_anuncio) VALUES (?, ?)', [1, id]);
    await ejecutar('INSERT INTO favoritos (id_usuario, id_anuncio) VALUES (?, ?)', [2, id]);

    const respuesta = await request(app).get(`/clasify_api/anuncios/${id}`);

    expect(respuesta.body.datos.anuncio.num_favoritos).toBe(2);
  });

  test('un anuncio vendido también se puede ver', async () => {
    const id = await crearAnuncio({ estado: 'vendido' });

    const respuesta = await request(app).get(`/clasify_api/anuncios/${id}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.anuncio.estado).toBe('vendido');
  });

  test('con un id inexistente devuelve 404', async () => {
    const respuesta = await request(app).get('/clasify_api/anuncios/999');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  test.each(['abc', '0', '-3', '1.5'])('con el id %s devuelve 400', async (id) => {
    const respuesta = await request(app).get(`/clasify_api/anuncios/${id}`);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'id' });
  });
});

describe('PATCH /clasify_api/anuncios/:id', () => {
  test('el autor cambia título, descripción y precio', async () => {
    const id = await crearAnuncio({ titulo: 'Mesa de madera', precio: 45 });

    const respuesta = await request(app)
      .patch(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .field({ titulo: '  Mesa de roble  ', descripcion: 'Nueva descripción', precio: '89.9' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.anuncio).toMatchObject({
      titulo: 'Mesa de roble',
      descripcion: 'Nueva descripción',
      precio: '89.90'
    });

    const guardado = await ejecutar('SELECT titulo, precio FROM anuncios WHERE id = ?', [id]);
    expect(guardado[0].titulo).toBe('Mesa de roble');
    expect(guardado[0].precio).toBe('89.90');
  });

  test('el autor cambia la categoría', async () => {
    const id = await crearAnuncio({ id_categoria: 1 });

    const respuesta = await request(app)
      .patch(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .field({ categoria: '3' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.anuncio.categoria).toEqual({ id: 3, nombre: 'Deportes' });
  });

  test('un campo que no se manda no se toca', async () => {
    const id = await crearAnuncio({ titulo: 'Mesa de madera', precio: 45 });

    await request(app)
      .patch(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .field({ precio: '50' });

    const anuncio = await request(app).get(`/clasify_api/anuncios/${id}`);
    expect(anuncio.body.datos.anuncio.titulo).toBe('Mesa de madera');
  });

  test('sin token devuelve 401', async () => {
    const id = await crearAnuncio();

    const respuesta = await request(app).patch(`/clasify_api/anuncios/${id}`).field({ precio: '50' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SIN_TOKEN');
  });

  test('otro usuario recibe 403 y no se modifica nada', async () => {
    const id = await crearAnuncio({ titulo: 'Mesa de madera', precio: 45 });

    const respuesta = await request(app)
      .patch(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenCarlos}`)
      .field({ titulo: 'Secuestrado' });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('SIN_PERMISOS');

    const anuncio = await request(app).get(`/clasify_api/anuncios/${id}`);
    expect(anuncio.body.datos.anuncio.titulo).toBe('Mesa de madera');
  });

  test('con un id inexistente devuelve 404', async () => {
    const respuesta = await request(app)
      .patch('/clasify_api/anuncios/999')
      .set('Authorization', `Bearer ${tokenAna}`)
      .field({ precio: '50' });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  test.each([
    ['categoría inexistente', { categoria: '999' }, 'categoria'],
    ['precio negativo', { precio: '-5' }, 'precio'],
    ['título vacío', { titulo: '  ' }, 'titulo'],
    ['sin campos editables', { desconocido: 'x' }, undefined]
  ])('devuelve 400 con %s', async (_caso, cambios, campo) => {
    const id = await crearAnuncio();

    const respuesta = await request(app)
      .patch(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .field(cambios);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('VALIDACION');
    expect(respuesta.body.error.campo).toBe(campo);
  });

  test('sustituir la imagen borra el fichero antiguo', async () => {
    const creado = await crearPorApi()
      .field(CAMPOS)
      .attach('imagen', PNG, { filename: 'antigua.png', contentType: 'image/png' });
    const imagenAntigua = creado.body.datos.anuncio.imagen;

    const respuesta = await request(app)
      .patch(`/clasify_api/anuncios/${creado.body.datos.anuncio.id}`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .field({ titulo: 'Con foto nueva' })
      .attach('imagen', PNG, { filename: 'nueva.png', contentType: 'image/png' });

    expect(respuesta.status).toBe(200);
    const imagenNueva = respuesta.body.datos.anuncio.imagen;

    expect(imagenNueva).not.toBe(imagenAntigua);
    expect(fs.existsSync(path.join(CARPETA_UPLOADS, imagenNueva))).toBe(true);
    expect(fs.existsSync(path.join(CARPETA_UPLOADS, imagenAntigua))).toBe(false);
    expect(ficherosEnUploads()).toEqual([imagenNueva]);
  });

  test('mandar solo una imagen también es una edición válida', async () => {
    const id = await crearAnuncio({ titulo: 'Sin foto' });

    const respuesta = await request(app)
      .patch(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .attach('imagen', PNG, { filename: 'primera.png', contentType: 'image/png' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.anuncio.imagen).not.toBeNull();
  });

  test('sin imagen no se borra la que ya había', async () => {
    const id = await crearAnuncio();

    await request(app)
      .patch(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .attach('imagen', PNG, { filename: 'mesa.png', contentType: 'image/png' });

    const respuesta = await request(app)
      .patch(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .field({ precio: '60' });

    expect(respuesta.body.datos.anuncio.imagen).not.toBeNull();
    expect(ficherosEnUploads()).toHaveLength(1);
  });

  // La imagen llega antes que la comprobación de autoría: si el 403 no limpiara
  // el fichero, cualquiera podría llenar `uploads/` con archivos ajenos.
  test('un 403 con imagen no deja el fichero en disco', async () => {
    const id = await crearAnuncio();

    const respuesta = await request(app)
      .patch(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenCarlos}`)
      .field({ precio: '1' })
      .attach('imagen', PNG, { filename: 'intrusa.png', contentType: 'image/png' });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('SIN_PERMISOS');
    expect(ficherosEnUploads()).toEqual([]);
  });
});

describe('PATCH /clasify_api/anuncios/:id/estado', () => {
  test('el autor marca el anuncio como vendido y vuelve a disponible', async () => {
    const id = await crearAnuncio();

    const vendido = await request(app)
      .patch(`/clasify_api/anuncios/${id}/estado`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .send({ estado: 'vendido' });

    expect(vendido.status).toBe(200);
    expect(vendido.body.datos.anuncio.estado).toBe('vendido');

    const disponible = await request(app)
      .patch(`/clasify_api/anuncios/${id}/estado`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .send({ estado: 'disponible' });

    expect(disponible.body.datos.anuncio.estado).toBe('disponible');

    const guardado = await ejecutar('SELECT estado FROM anuncios WHERE id = ?', [id]);
    expect(guardado[0].estado).toBe('disponible');
  });

  test('un anuncio vendido desaparece del listado por defecto', async () => {
    const id = await crearAnuncio();

    await request(app)
      .patch(`/clasify_api/anuncios/${id}/estado`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .send({ estado: 'vendido' });

    expect((await request(app).get('/clasify_api/anuncios')).body.datos).toEqual([]);
    expect((await request(app).get('/clasify_api/anuncios?estado=vendido')).body.datos).toHaveLength(1);
  });

  test.each([
    ['inventado', { estado: 'todo' }],
    ['ausente', {}],
    ['en mayúsculas', { estado: 'VENDIDO' }]
  ])('con el estado %s devuelve 400', async (_caso, cuerpo) => {
    const id = await crearAnuncio();

    const respuesta = await request(app)
      .patch(`/clasify_api/anuncios/${id}/estado`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .send(cuerpo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'estado' });
  });

  test('sin token devuelve 401', async () => {
    const id = await crearAnuncio();

    const respuesta = await request(app)
      .patch(`/clasify_api/anuncios/${id}/estado`)
      .send({ estado: 'vendido' });

    expect(respuesta.status).toBe(401);
  });

  test('otro usuario recibe 403 y el estado no cambia', async () => {
    const id = await crearAnuncio();

    const respuesta = await request(app)
      .patch(`/clasify_api/anuncios/${id}/estado`)
      .set('Authorization', `Bearer ${tokenCarlos}`)
      .send({ estado: 'vendido' });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('SIN_PERMISOS');

    const guardado = await ejecutar('SELECT estado FROM anuncios WHERE id = ?', [id]);
    expect(guardado[0].estado).toBe('disponible');
  });

  test('con un id inexistente devuelve 404', async () => {
    const respuesta = await request(app)
      .patch('/clasify_api/anuncios/999/estado')
      .set('Authorization', `Bearer ${tokenAna}`)
      .send({ estado: 'vendido' });

    expect(respuesta.status).toBe(404);
  });
});

describe('DELETE /clasify_api/anuncios/:id', () => {
  test('el autor borra el anuncio y devuelve 204', async () => {
    const id = await crearAnuncio();

    const respuesta = await request(app)
      .delete(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(respuesta.status).toBe(204);
    expect(respuesta.body).toEqual({});
    expect(await consultarTotalAnuncios()).toBe(0);
    expect((await request(app).get(`/clasify_api/anuncios/${id}`)).status).toBe(404);
  });

  test('borra también el fichero de imagen', async () => {
    const creado = await crearPorApi()
      .field(CAMPOS)
      .attach('imagen', PNG, { filename: 'mesa.png', contentType: 'image/png' });
    const imagen = creado.body.datos.anuncio.imagen;

    await request(app)
      .delete(`/clasify_api/anuncios/${creado.body.datos.anuncio.id}`)
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(fs.existsSync(path.join(CARPETA_UPLOADS, imagen))).toBe(false);
    expect(ficherosEnUploads()).toEqual([]);
  });

  test('borra el anuncio aunque el fichero de imagen ya no esté', async () => {
    const creado = await crearPorApi()
      .field(CAMPOS)
      .attach('imagen', PNG, { filename: 'mesa.png', contentType: 'image/png' });
    const id = creado.body.datos.anuncio.id;

    // Como si alguien hubiera limpiado `uploads/` a mano: la fila se borra igual.
    limpiarUploads();

    const respuesta = await request(app)
      .delete(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(respuesta.status).toBe(204);
    expect(await consultarTotalAnuncios()).toBe(0);
  });

  test('los favoritos y conversaciones se van por el CASCADE del esquema', async () => {
    const id = await crearAnuncio();
    await ejecutar('INSERT INTO favoritos (id_usuario, id_anuncio) VALUES (?, ?)', [2, id]);
    await ejecutar('INSERT INTO conversaciones (id_anuncio, id_comprador) VALUES (?, ?)', [id, 2]);
    const conversacion = await ejecutar('SELECT id FROM conversaciones WHERE id_anuncio = ?', [id]);
    await ejecutar('INSERT INTO mensajes (texto, id_conversacion, id_emisor) VALUES (?, ?, ?)', [
      'Hola',
      conversacion[0].id,
      2
    ]);

    await request(app)
      .delete(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenAna}`);

    const favoritos = await ejecutar('SELECT COUNT(*) AS total FROM favoritos');
    const conversaciones = await ejecutar('SELECT COUNT(*) AS total FROM conversaciones');
    const mensajes = await ejecutar('SELECT COUNT(*) AS total FROM mensajes');

    expect(favoritos[0].total).toBe(0);
    expect(conversaciones[0].total).toBe(0);
    expect(mensajes[0].total).toBe(0);
  });

  test('sin token devuelve 401', async () => {
    const id = await crearAnuncio();

    const respuesta = await request(app).delete(`/clasify_api/anuncios/${id}`);

    expect(respuesta.status).toBe(401);
    expect(await consultarTotalAnuncios()).toBe(1);
  });

  test('otro usuario recibe 403 y el anuncio sigue ahí', async () => {
    const id = await crearAnuncio();

    const respuesta = await request(app)
      .delete(`/clasify_api/anuncios/${id}`)
      .set('Authorization', `Bearer ${tokenCarlos}`);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('SIN_PERMISOS');
    expect(await consultarTotalAnuncios()).toBe(1);
  });

  test('con un id inexistente devuelve 404', async () => {
    const respuesta = await request(app)
      .delete('/clasify_api/anuncios/999')
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(respuesta.status).toBe(404);
  });
});

describe('GET /clasify_api/categorias', () => {
  test('devuelve 200 con las categorías ordenadas por nombre', async () => {
    const respuesta = await request(app).get('/clasify_api/categorias');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([
      { id: 3, nombre: 'Deportes' },
      { id: 1, nombre: 'Electrónica' },
      { id: 2, nombre: 'Hogar y jardín' }
    ]);
  });

  test('no necesita token', async () => {
    expect((await request(app).get('/clasify_api/categorias')).status).toBe(200);
  });
});
