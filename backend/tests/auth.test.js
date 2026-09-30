'use strict';

const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');
const { prepararBaseDePruebas, limpiarTablas } = require('./ayudaBaseDeDatos');

const EMAIL_VALIDO = 'nuevo@example.com';
const CONTRASENA_VALIDA = 'Clasify123!';

beforeAll(async () => {
  await prepararBaseDePruebas();
});

beforeEach(async () => {
  await limpiarTablas();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /clasify_api/auth/register', () => {
  test('registra un usuario válido y devuelve 201 con token', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/auth/register')
      .send({ email: EMAIL_VALIDO, nombre: 'Nueva', password: CONTRASENA_VALIDA });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.datos.token).toEqual(expect.any(String));
    expect(respuesta.body.datos.usuario).toMatchObject({
      email: EMAIL_VALIDO,
      nombre: 'Nueva'
    });
    expect(respuesta.body.datos.usuario.password_hash).toBeUndefined();
  });

  test('el token recibido permite acceder a una ruta protegida', async () => {
    const registro = await request(app)
      .post('/clasify_api/auth/register')
      .send({ email: EMAIL_VALIDO, nombre: 'Nueva', password: CONTRASENA_VALIDA });

    const respuesta = await request(app)
      .get('/clasify_api/auth/yo')
      .set('Authorization', `Bearer ${registro.body.datos.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.usuario.email).toBe(EMAIL_VALIDO);
  });

  test('devuelve 409 si el email ya está registrado', async () => {
    const cuerpo = { email: EMAIL_VALIDO, nombre: 'Nueva', password: CONTRASENA_VALIDA };
    await request(app).post('/clasify_api/auth/register').send(cuerpo);

    const respuesta = await request(app).post('/clasify_api/auth/register').send(cuerpo);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe('EMAIL_DUPLICADO');
    expect(respuesta.body.error.campo).toBe('email');
  });

  test.each([
    ['email ausente', { nombre: 'Nueva', password: CONTRASENA_VALIDA }, 'email'],
    ['email inválido', { email: 'no-es-un-email', nombre: 'Nueva', password: CONTRASENA_VALIDA }, 'email'],
    ['nombre ausente', { email: EMAIL_VALIDO, password: CONTRASENA_VALIDA }, 'nombre'],
    ['contraseña corta', { email: EMAIL_VALIDO, nombre: 'Nueva', password: 'corta' }, 'password']
  ])('devuelve 400 con %s', async (_caso, cuerpo, campo) => {
    const respuesta = await request(app).post('/clasify_api/auth/register').send(cuerpo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('VALIDACION');
    expect(respuesta.body.error.campo).toBe(campo);
  });
});

describe('POST /clasify_api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/clasify_api/auth/register')
      .send({ email: EMAIL_VALIDO, nombre: 'Nueva', password: CONTRASENA_VALIDA });
  });

  test('con credenciales correctas devuelve 200 con token', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/auth/login')
      .send({ email: EMAIL_VALIDO, password: CONTRASENA_VALIDA });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.token).toEqual(expect.any(String));
    expect(respuesta.body.datos.usuario.email).toBe(EMAIL_VALIDO);
  });

  test('con contraseña incorrecta devuelve 401', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/auth/login')
      .send({ email: EMAIL_VALIDO, password: 'contrasena-equivocada' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  test('con email inexistente devuelve 401', async () => {
    const respuesta = await request(app)
      .post('/clasify_api/auth/login')
      .send({ email: 'nadie@example.com', password: CONTRASENA_VALIDA });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
  });
});

describe('Middleware de autenticación', () => {
  test('una ruta protegida sin token devuelve 401', async () => {
    const respuesta = await request(app).get('/clasify_api/auth/yo');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SIN_TOKEN');
  });

  test('una ruta protegida con token inválido devuelve 401', async () => {
    const respuesta = await request(app)
      .get('/clasify_api/auth/yo')
      .set('Authorization', 'Bearer token-que-no-es-valido');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('TOKEN_INVALIDO');
  });

  test('una ruta protegida con un esquema distinto de Bearer devuelve 401', async () => {
    const respuesta = await request(app)
      .get('/clasify_api/auth/yo')
      .set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('ESQUEMA_INVALIDO');
  });

  test('una ruta protegida con un token caducado devuelve 401', async () => {
    const { jwt: configJwt } = require('../src/config');
    const caducado = require('jsonwebtoken').sign(
      { sub: 1, email: 'nuevo@example.com' },
      configJwt.secreto,
      { algorithm: 'HS256', expiresIn: -10 }
    );

    const respuesta = await request(app)
      .get('/clasify_api/auth/yo')
      .set('Authorization', `Bearer ${caducado}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('TOKEN_CADUCADO');
  });
});

describe('Formato de respuesta', () => {
  test('una ruta inexistente devuelve 404 con el formato de error', async () => {
    const respuesta = await request(app).get('/clasify_api/no-existe');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error).toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });

  test('el endpoint de salud responde 200', async () => {
    const respuesta = await request(app).get('/clasify_api/salud');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.estado).toBe('ok');
  });
});
