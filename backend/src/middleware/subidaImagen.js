'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { ApiError } = require('../errors/ApiError');
const { uploads } = require('../config');

const { carpeta: CARPETA, tamanoMaximo: TAMANO_MAXIMO, tipos: TIPOS_PERMITIDOS } = uploads;

/** Traducción de los errores que lanza multer al detectar un `MulterError`. */
const MENSAJES_MULTER = {
  LIMIT_FILE_SIZE: 'La imagen no puede superar los 5 MB',
  LIMIT_FILE_COUNT: 'Solo se admite una imagen',
  LIMIT_UNEXPECTED_FILE: 'La imagen tiene que ir en el campo "imagen"'
};

const almacenamiento = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CARPETA),
  filename: (req, file, cb) => {
    // El nombre lo pone el servidor, nunca el cliente: se evita así el path
    // traversal y que dos subidas se pisen.
    cb(null, crypto.randomUUID() + (TIPOS_PERMITIDOS.get(file.mimetype) ?? '.bin'));
  }
});

function filtro(req, file, cb) {
  if (!TIPOS_PERMITIDOS.has(file.mimetype)) {
    return cb(
      new ApiError(400, 'VALIDACION', 'La imagen debe estar en formato jpeg, png o webp', 'imagen')
    );
  }
  cb(null, true);
}

const subir = multer({
  storage: almacenamiento,
  fileFilter: filtro,
  limits: { fileSize: TAMANO_MAXIMO, files: 1 }
}).single('imagen');

/**
 * Borra la imagen si la petición acaba en error.
 *
 * multer escribe el fichero antes de que se compruebe el resto, así que una
 * validación que falla después (un título vacío, una categoría que no existe)
 * o un 403 por no ser el autor dejan el fichero en `uploads/` sin que nada lo
 * referencie. Se mira el estado con el que se respondió: si la operación tuvo
 * éxito, el nombre del fichero ya está en la fila del anuncio y hay que
 * conservarlo; si no, sobra.
 *
 * El borrado es síncrono y sus errores se ignoran a propósito: la petición ya
 * tiene su respuesta y un fallo al limpiar no debe convertirla en un 500. Es
 * síncrono para que el fichero esté borrado cuando el cliente recibe el error,
 * y no un instante después: en asíncrono, quien mira `uploads/` justo después
 * del 400 todavía se lo puede encontrar.
 */
function borrarImagenSiLaPeticionFalla(req, res, next) {
  res.on('close', () => {
    if (res.statusCode < 400 || !req.file) {
      return;
    }
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      // El fichero ya no está, o no se puede borrar: nada que hacer.
    }
  });
  next();
}

/**
 * Middleware que deja la imagen en `req.file` y el resto de campos en `req.body`.
 * Los errores de multer se convierten en `ApiError` para que los formatee el
 * manejador central con el mismo formato del resto de la API.
 * La imagen es opcional: si no se manda el campo, `req.file` queda sin definir.
 */
function subirImagen(req, res, next) {
  subir(req, res, (error) => {
    if (!error) {
      return borrarImagenSiLaPeticionFalla(req, res, next);
    }
    if (error instanceof multer.MulterError) {
      const mensaje = MENSAJES_MULTER[error.code] ?? 'No se ha podido procesar la imagen';
      return next(ApiError.validacion(mensaje, 'imagen'));
    }
    return next(error);
  });
}

module.exports = { subirImagen };
