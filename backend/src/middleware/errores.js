'use strict';

const { ApiError } = require('../errors/ApiError');

/** 404 para cualquier ruta no registrada. */
function noEncontrado(req, res, next) {
  next(new ApiError(404, 'NO_ENCONTRADO', `No existe la ruta ${req.method} ${req.originalUrl}`));
}

/**
 * Manejador de errores central. Oculta los detalles internos y devuelve siempre
 * el formato de docs/ARCHITECTURE.md.
 * Los cuatro parámetros son obligatorios: Express solo reconoce un manejador
 * de errores si declara la firma completa.
 */
function manejadorDeErrores(error, req, res, next) {
  if (error instanceof ApiError) {
    return res.status(error.estado).json(error.aJson());
  }

  if (error.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json(new ApiError(400, 'JSON_INVALIDO', 'El cuerpo de la petición no es JSON válido').aJson());
  }

  if (error.type === 'entity.too.large') {
    return res
      .status(413)
      .json(new ApiError(413, 'CUERPO_DEMASIADO_GRANDE', 'El cuerpo de la petición es demasiado grande').aJson());
  }

  console.error('Error no controlado:', error);
  return res
    .status(500)
    .json(new ApiError(500, 'ERROR_INTERNO', 'Se ha producido un error en el servidor').aJson());
}

module.exports = { noEncontrado, manejadorDeErrores };
