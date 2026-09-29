'use strict';

const jwt = require('jsonwebtoken');
const { jwt: configJwt } = require('../config');
const { ApiError } = require('../errors/ApiError');

/**
 * Exige un token JWT válido en la cabecera `Authorization: Bearer <token>`.
 * Deja el usuario autenticado en `req.usuario` ({ id, email }).
 */
function autenticar(req, res, next) {
  const cabecera = req.get('authorization') || '';
  const [esquema, token] = cabecera.split(' ');

  if (cabecera === '' || !token) {
    throw ApiError.noAutorizado('SIN_TOKEN', 'Falta el token en la cabecera Authorization');
  }
  if (esquema !== 'Bearer') {
    throw ApiError.noAutorizado('ESQUEMA_INVALIDO', 'El token debe enviarse como "Authorization: Bearer <token>"');
  }

  try {
    const payload = jwt.verify(token, configJwt.secreto, { algorithms: ['HS256'] });
    req.usuario = { id: payload.sub, email: payload.email };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.noAutorizado('TOKEN_CADUCADO', 'El token ha caducado');
    }
    throw ApiError.noAutorizado('TOKEN_INVALIDO', 'El token no es válido');
  }

  next();
}

module.exports = { autenticar };
