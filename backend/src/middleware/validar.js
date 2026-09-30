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

const LONGITUD_MAXIMA_BIOGRAFIA = 500;

/**
 * Valida el cuerpo de `PATCH /usuarios/me`. Solo se comprueban los campos que
 * se han enviado: es un PATCH, así que el resto se quedan sin tocar.
 * @returns {{ nombre?: string, biografia?: string, nuevaContrasena?: string, contrasenaActual?: string }}
 */
function validarActualizacionPerfil(cuerpo) {
  if (cuerpo.email !== undefined) {
    throw ApiError.validacion('El email no se puede cambiar', 'email');
  }

  const cambios = {};

  if (cuerpo.nombre !== undefined) {
    const nombre = texto(cuerpo.nombre);
    if (nombre === '') {
      throw ApiError.validacion('El nombre es obligatorio', 'nombre');
    }
    if (nombre.length > LONGITUD_MAXIMA_NOMBRE) {
      throw ApiError.validacion(
        `El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres`,
        'nombre'
      );
    }
    cambios.nombre = nombre;
  }

  if (cuerpo.biografia !== undefined) {
    if (typeof cuerpo.biografia !== 'string') {
      throw ApiError.validacion('La biografía debe ser texto', 'biografia');
    }
    const biografia = cuerpo.biografia.trim();
    if (biografia.length > LONGITUD_MAXIMA_BIOGRAFIA) {
      throw ApiError.validacion(
        `La biografía no puede superar los ${LONGITUD_MAXIMA_BIOGRAFIA} caracteres`,
        'biografia'
      );
    }
    cambios.biografia = biografia;
  }

  if (cuerpo.password !== undefined) {
    const nuevaContrasena = typeof cuerpo.password === 'string' ? cuerpo.password : '';
    if (nuevaContrasena.length < LONGITUD_MINIMA_CONTRASENA) {
      throw ApiError.validacion(
        `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`,
        'password'
      );
    }
    if (typeof cuerpo.password_actual !== 'string' || cuerpo.password_actual === '') {
      throw ApiError.validacion(
        'Hay que enviar la contraseña actual para cambiar la contraseña',
        'password_actual'
      );
    }
    cambios.nuevaContrasena = nuevaContrasena;
    cambios.contrasenaActual = cuerpo.password_actual;
  }

  if (Object.keys(cambios).length === 0) {
    throw ApiError.validacion('No hay ningún campo editable en el cuerpo de la petición');
  }

  return cambios;
}

/** Los `:id` de las rutas son enteros positivos; "abc" es un 400, no un 404. */
function validarId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) {
    throw ApiError.validacion('El id debe ser un entero positivo', 'id');
  }
  return id;
}

module.exports = {
  validarRegistro,
  validarLogin,
  validarActualizacionPerfil,
  validarId
};
