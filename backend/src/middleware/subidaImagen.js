'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { ApiError } = require('../errors/ApiError');

const CARPETA = path.join(__dirname, '..', '..', 'uploads');
const TAMANO_MAXIMO = 5 * 1024 * 1024;

/** Tipos aceptados y la extensión con la que se guarda cada uno. */
const TIPOS_PERMITIDOS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
]);

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
 * Middleware que deja la imagen en `req.file` y el resto de campos en `req.body`.
 * Los errores de multer se convierten en `ApiError` para que los formatee el
 * manejador central con el mismo formato del resto de la API.
 * La imagen es opcional: si no se manda el campo, `req.file` queda sin definir.
 */
function subirImagen(req, res, next) {
  subir(req, res, (error) => {
    if (!error) {
      return next();
    }
    if (error instanceof multer.MulterError) {
      const mensaje = MENSAJES_MULTER[error.code] ?? 'No se ha podido procesar la imagen';
      return next(ApiError.validacion(mensaje, 'imagen'));
    }
    return next(error);
  });
}

module.exports = { subirImagen, CARPETA, TAMANO_MAXIMO, TIPOS_PERMITIDOS };
