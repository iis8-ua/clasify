'use strict';

const request = require('supertest');
const app = require('../src/app');
const { pool, ejecutar } = require('../src/db/pool');
const { prepararBaseDePruebas, limpiarTablas } = require('./ayudaBaseDeDatos');

const EMAIL = 'ana@example.com';
const CONTRASENA = 'Clasify123!';

let token;

async function crearUsuario(email = EMAIL) {
  const respuesta = await request(app)
    .post('/clasify_api/auth/register')
    .send({ email, nombre: 'Ana Ruiz', password: CONTRASENA });
  return respuesta.body.datos;
}

async function crearAnuncio(idAutor, titulo, precio) {
  const resultado = await ejecutar(
    'INSERT INTO anuncios (titulo, descripcion, precio, id_autor, id_categoria) VALUES (?, ?, ?, ?, 1)',
    [titulo, 'Descripción de prueba', precio, idAutor]
  );
  return resultado.insertId;
}

beforeAll(async () => {
  await prepararBaseDePruebas();
});

beforeEach(async () => {
  await limpiarTablas();
  const { token: t } = await crearUsuario();
  token = t;
});

afterAll(async () => {
  await pool.end();
});

describe('GET /clasify_api/usuarios/me', () => {
  test('devuelve el perfil propio con el email', async () => {
    const respuesta = await request(app)
      .get('/clasify_api/usuarios/me')
      .set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario).toMatchObject({
      email: EMAIL,
      nombre: 'Ana Ruiz'
    });
    expect(respuesta.body.datos.usuario.biografia).toBeNull();
    expect(respuesta.body.datos.usuario.password_hash).toBeUndefined();
  });

  test('sin token devuelve 401', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/me');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SIN_TOKEN');
  });
});

describe('GET /clasify_api/usuarios/:id', () => {
  test('devuelve el perfil público sin email ni password_hash', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/1');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario).toMatchObject({ id: 1, nombre: 'Ana Ruiz' });
    expect(respuesta.body.datos.usuario.email).toBeUndefined();
    expect(respuesta.body.datos.usuario.password_hash).toBeUndefined();
    expect(respuesta.body.datos.usuario.fecha_alta).toEqual(expect.any(String));
  });

  test('con id inexistente devuelve 404', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/999');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  test.each([
    ['no numérico', 'abc'],
    ['cero', '0'],
    ['negativo', '-3'],
    ['decimal', '1.5']
  ])('con un id %s devuelve 400', async (_caso, id) => {
    const respuesta = await request(app).get(`/clasify_api/usuarios/${id}`);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatchObject({ codigo: 'VALIDACION', campo: 'id' });
  });
});

describe('PATCH /clasify_api/usuarios/me', () => {
  test('cambia el nombre y la biografía y devuelve el perfil actualizado', async () => {
    const respuesta = await request(app)
      .patch('/clasify_api/usuarios/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: '  Ana Editada  ', biografia: 'Vendo de todo un poco' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario).toMatchObject({
      nombre: 'Ana Editada',
      biografia: 'Vendo de todo un poco'
    });

    const perfil = await request(app).get('/clasify_api/usuarios/me').set('Authorization', `Bearer ${token}`);
    expect(perfil.body.datos.usuario.nombre).toBe('Ana Editada');
  });

  test('una biografía vacía la deja a null y no toca el resto', async () => {
    const respuesta = await request(app)
      .patch('/clasify_api/usuarios/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ biografia: 'Algo' });

    expect(respuesta.status).toBe(200);

    const limpieza = await request(app)
      .patch('/clasify_api/usuarios/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ biografia: '' });

    expect(limpieza.status).toBe(200);
    expect(limpieza.body.datos.usuario.biografia).toBeNull();
    expect(limpieza.body.datos.usuario.nombre).toBe('Ana Ruiz');
  });

  test.each([
    ['nombre vacío', { nombre: '   ' }, 'nombre'],
    ['nombre demasiado largo', { nombre: 'a'.repeat(101) }, 'nombre'],
    ['biografía no textual', { biografia: 42 }, 'biografia'],
    ['biografía demasiado larga', { biografia: 'a'.repeat(501) }, 'biografia'],
    ['contraseña corta', { password: 'corta', password_actual: CONTRASENA }, 'password'],
    ['cambio de email', { email: 'otro@example.com' }, 'email'],
    ['cambio de email aunque sea el mismo', { email: EMAIL, nombre: 'Ana' }, 'email'],
    ['contraseña sin la actual', { password: 'NuevaClasify123!' }, 'password_actual'],
    ['sin campos editables', { desconocido: 'x' }, undefined]
  ])('devuelve 400 con %s', async (_caso, cuerpo, campo) => {
    const respuesta = await request(app)
      .patch('/clasify_api/usuarios/me')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('VALIDACION');
    expect(respuesta.body.error.campo).toBe(campo);
  });

  test('sin token devuelve 401', async () => {
    const respuesta = await request(app)
      .patch('/clasify_api/usuarios/me')
      .send({ nombre: 'Ana' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SIN_TOKEN');
  });

  test('cambia la contraseña y con la nueva se puede hacer login', async () => {
    const nueva = 'Clasify456!';

    const respuesta = await request(app)
      .patch('/clasify_api/usuarios/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: nueva, password_actual: CONTRASENA });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario).not.toHaveProperty('password_hash');

    const loginNuevo = await request(app)
      .post('/clasify_api/auth/login')
      .send({ email: EMAIL, password: nueva });
    expect(loginNuevo.status).toBe(200);

    const loginViejo = await request(app)
      .post('/clasify_api/auth/login')
      .send({ email: EMAIL, password: CONTRASENA });
    expect(loginViejo.status).toBe(401);
  });

  test('con la contraseña actual equivocada devuelve 401 y no cambia nada', async () => {
    const respuesta = await request(app)
      .patch('/clasify_api/usuarios/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'Clasify456!', password_actual: 'no-es-la-actual' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');

    const login = await request(app)
      .post('/clasify_api/auth/login')
      .send({ email: EMAIL, password: CONTRASENA });
    expect(login.status).toBe(200);
  });
});

describe('Anuncios de un usuario', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 3; i += 1) {
      await crearAnuncio(1, `Anuncio ${i}`, 10 * i);
    }
    await crearUsuario('carlos@example.com');
  });

  test('GET /usuarios/:id/anuncios devuelve el listado paginado', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/1/anuncios');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toHaveLength(3);
    expect(respuesta.body.paginacion).toEqual({ pagina: 1, limite: 20, total: 3, paginas: 1 });
    expect(respuesta.body.datos[0]).toMatchObject({ titulo: 'Anuncio 3', id_categoria: 1 });
  });

  test('respeta pagina y limite', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/1/anuncios?pagina=2&limite=2');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0]).toMatchObject({ titulo: 'Anuncio 1' });
    expect(respuesta.body.paginacion).toEqual({ pagina: 2, limite: 2, total: 3, paginas: 2 });
  });

  test.each([
    ['limite fuera de rango', '?limite=999'],
    ['limite cero', '?limite=0'],
    ['pagina cero', '?pagina=0'],
    ['pagina no numérica', '?pagina=abc']
  ])('devuelve 400 con %s', async (_caso, query) => {
    const respuesta = await request(app).get(`/clasify_api/usuarios/1/anuncios${query}`);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('VALIDACION');
  });

  test('un usuario sin anuncios devuelve el listado vacío', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/2/anuncios');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([]);
    expect(respuesta.body.paginacion).toEqual({ pagina: 1, limite: 20, total: 0, paginas: 0 });
  });

  test('con un id inexistente devuelve 404', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/999/anuncios');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  test('GET /usuarios/me/anuncios devuelve los anuncios del token', async () => {
    const respuesta = await request(app)
      .get('/clasify_api/usuarios/me/anuncios')
      .set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toHaveLength(3);
    expect(respuesta.body.paginacion.total).toBe(3);
  });

  test('GET /usuarios/me/anuncios sin token devuelve 401', async () => {
    const respuesta = await request(app).get('/clasify_api/usuarios/me/anuncios');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SIN_TOKEN');
  });

  test('/usuarios/me no se confunde con /usuarios/:id', async () => {
    const conToken = await request(app)
      .get('/clasify_api/usuarios/me')
      .set('Authorization', `Bearer ${token}`);
    expect(conToken.body.datos.usuario.email).toBe(EMAIL);

    const sinToken = await request(app).get('/clasify_api/usuarios/me');
    expect(sinToken.status).toBe(401);
  });
});
