'use strict';

const jwt = require('jsonwebtoken');
const { jwt: configJwt } = require('../config');
const { ApiError } = require('../errors/ApiError');
const { existe } = require('../services/usuarioService');

/**
 * El token demuestra que la firma es nuestra, no que su usuario siga en la base
 * de datos. Un usuario borrado después de emitir el token (el token vive 7 días)
 * haría que cada ruta protegida se equivocase por su cuenta: un perfil con
 * `usuario: null`, un 403 que no es de permisos o un error de clave foránea.
 * Por eso la comprobación va aquí y no en las rutas, que solo tienen que decidir
 * si la ruta exige token o no.
 */
async function exigirUsuarioVivo(id) {
  if (!(await existe(id))) {
    throw ApiError.noAutorizado('USUARIO_NO_EXISTE', 'El usuario del token ya no existe');
  }
}

/**
 * Exige un token JWT válido en la cabecera `Authorization: Bearer <token>`.
 * Deja el usuario autenticado en `req.usuario` ({ id, email }).
 */
async function autenticar(req, res, next) {
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

  await exigirUsuarioVivo(req.usuario.id);

  next();
}

/**
 * Igual que `autenticar`, pero la ausencia de token no es un error. Se usa en las
 * rutas públicas que improvesn con saber quién pregunta: el detalle de un anuncio
 * devuelve su conversación solo a quien participa, y sigue siendo accesible sin
 * token.
 *
 * Un token ausente, con otro esquema, inválido, caducado o de un usuario que ya no
 * existe se ignoran y la petición sigue como anónima. Solo un token que verifica
 * contra nuestro secreto y con un usuario en la base de datos se acepta.
 */
async function autenticarSiHayToken(req, res, next) {
  const cabecera = req.get('authorization') || '';
  const [, token] = cabecera.split(' ');

  if (cabecera === '' || !token) {
    return next();
  }

  let payload;
  try {
    payload = jwt.verify(token, configJwt.secreto, { algorithms: ['HS256'] });
  } catch {
    return next();
  }

  req.usuario = { id: payload.sub, email: payload.email };

  if (await existe(req.usuario.id)) {
    return next();
  }

  delete req.usuario;
  next();
}

module.exports = { autenticar, autenticarSiHayToken };
