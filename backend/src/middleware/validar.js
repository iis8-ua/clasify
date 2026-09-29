'use strict';

const { ApiError } = require('../errors/ApiError');

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MINIMA_CONTRASENA = 8;
const LONGITUD_MAXIMA_NOMBRE = 100;

function texto(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validarRegistro(cuerpo) {
  const email = texto(cuerpo.email);
  const nombre = texto(cuerpo.nombre);
  const contrasena = typeof cuerpo.password === 'string' ? cuerpo.password : '';

  if (email === '') {
    throw ApiError.validacion('El email es obligatorio', 'email');
  }
  if (!FORMATO_EMAIL.test(email)) {
    throw ApiError.validacion('El email no tiene un formato válido', 'email');
  }
  if (email.length > 255) {
    throw ApiError.validacion('El email no puede superar los 255 caracteres', 'email');
  }
  if (nombre === '') {
    throw ApiError.validacion('El nombre es obligatorio', 'nombre');
  }
  if (nombre.length > LONGITUD_MAXIMA_NOMBRE) {
    throw ApiError.validacion(
      `El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres`,
      'nombre'
    );
  }
  if (contrasena.length < LONGITUD_MINIMA_CONTRASENA) {
    throw ApiError.validacion(
      `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`,
      'password'
    );
  }

  return { email, nombre, contrasena };
}

function validarLogin(cuerpo) {
  const email = texto(cuerpo.email);
  const contrasena = typeof cuerpo.password === 'string' ? cuerpo.password : '';

  if (email === '' || contrasena === '') {
    throw ApiError.validacion('El email y la contraseña son obligatorios');
  }
  if (!FORMATO_EMAIL.test(email)) {
    throw ApiError.validacion('El email no tiene un formato válido', 'email');
  }

  return { email, contrasena };
}

module.exports = { validarRegistro, validarLogin };
