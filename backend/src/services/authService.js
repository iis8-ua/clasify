'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { jwt: configJwt } = require('../config');
const { consultar, ejecutar } = require('../db/pool');
const { ApiError } = require('../errors/ApiError');

const COSTE_HASH = 12;

async function hashearContrasena(contrasena) {
  return bcrypt.hash(contrasena, COSTE_HASH);
}

async function verificarContrasena(contrasena, hash) {
  return bcrypt.compare(contrasena, hash);
}

function firmarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, email: usuario.email },
    configJwt.secreto,
    { algorithm: 'HS256', expiresIn: configJwt.caducidad }
  );
}

function projectionPrivada(usuario) {
  return { id: usuario.id, email: usuario.email, nombre: usuario.nombre };
}

function projectionPublica(usuario) {
  return { id: usuario.id, nombre: usuario.nombre };
}

async function buscarPorId(id) {
  const filas = await consultar(
    'SELECT id, email, nombre, biografia, fecha_alta FROM usuarios WHERE id = ?',
    [id]
  );
  return filas[0] ?? null;
}

async function buscarPorEmail(email) {
  const filas = await consultar('SELECT * FROM usuarios WHERE email = ?', [email]);
  return filas[0] ?? null;
}

async function registrar({ email, nombre, contrasena }) {
  const existente = await buscarPorEmail(email);
  if (existente) {
    throw ApiError.conflicto('EMAIL_DUPLICADO', 'Ya existe un usuario con ese email', 'email');
  }

  const hash = await hashearContrasena(contrasena);

  try {
    const resultado = await ejecutar(
      'INSERT INTO usuarios (email, nombre, password_hash) VALUES (?, ?, ?)',
      [email, nombre, hash]
    );
    return await buscarPorId(resultado.insertId);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw ApiError.conflicto('EMAIL_DUPLICADO', 'Ya existe un usuario con ese email', 'email');
    }
    throw error;
  }
}

async function autenticar({ email, contrasena }) {
  const usuario = await buscarPorEmail(email);

  const coincide =
    usuario !== null && (await verificarContrasena(contrasena, usuario.password_hash));

  if (!coincide) {
    throw ApiError.noAutorizado('CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos');
  }

  return usuario;
}

module.exports = {
  hashearContrasena,
  verificarContrasena,
  firmarToken,
  projectionPrivada,
  projectionPublica,
  buscarPorId,
  buscarPorEmail,
  registrar,
  autenticar
};
