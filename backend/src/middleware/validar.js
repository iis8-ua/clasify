'use strict';

const { ApiError } = require('../errors/ApiError');
const {
  ORDENES_PERMITIDOS,
  ORDEN_POR_DEFECTO,
  ESTADOS_LISTADO,
  ESTADO_POR_DEFECTO
} = require('../services/anuncioService');

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

/* ------------------------------------------------------------------ */
/* Anuncios                                                            */
/* ------------------------------------------------------------------ */

const LONGITUD_MAXIMA_TITULO = 150;
const LONGITUD_MAXIMA_DESCRIPCION = 5000;
const LONGITUD_MAXIMA_BUSQUEDA = 150;
const PRECIO_MAXIMO = 99999999.99;

// Precio no negativo con hasta 2 decimales, que es lo que cabe en DECIMAL(10,2).
// Se rechaza lo que no encaja en lugar de dejar que MySQL redondee en silencio.
const FORMATO_PRECIO = /^\d{1,8}(\.\d{1,2})?$/;

const ESTADOS = ['disponible', 'vendido'];

/**
 * Acepta el precio como número (JSON) o como texto (multipart, donde todo llega
 * en cadena) y lo devuelve con dos decimales, como lo guarda la columna.
 */
function validarPrecio(valor) {
  const cadena =
    typeof valor === 'number' ? String(valor) : typeof valor === 'string' ? valor.trim() : '';

  if (!FORMATO_PRECIO.test(cadena)) {
    throw ApiError.validacion(
      'El precio debe ser un número no negativo con como mucho 2 decimales',
      'precio'
    );
  }

  const precio = Number(cadena);
  if (precio > PRECIO_MAXIMO) {
    throw ApiError.validacion(`El precio no puede superar los ${PRECIO_MAXIMO}`, 'precio');
  }

  return precio.toFixed(2);
}

function validarTitulo(valor) {
  const titulo = texto(valor);
  if (titulo === '') {
    throw ApiError.validacion('El título es obligatorio', 'titulo');
  }
  if (titulo.length > LONGITUD_MAXIMA_TITULO) {
    throw ApiError.validacion(
      `El título no puede superar los ${LONGITUD_MAXIMA_TITULO} caracteres`,
      'titulo'
    );
  }
  return titulo;
}

function validarDescripcion(valor) {
  if (typeof valor !== 'string') {
    throw ApiError.validacion('La descripción es obligatoria', 'descripcion');
  }
  const descripcion = valor.trim();
  if (descripcion === '') {
    throw ApiError.validacion('La descripción es obligatoria', 'descripcion');
  }
  if (descripcion.length > LONGITUD_MAXIMA_DESCRIPCION) {
    throw ApiError.validacion(
      `La descripción no puede superar los ${LONGITUD_MAXIMA_DESCRIPCION} caracteres`,
      'descripcion'
    );
  }
  return descripcion;
}

/** Igual que `validarId`, pero el campo del error se llama `categoria`. */
function validarCategoria(valor) {
  if (valor === undefined || valor === '') {
    throw ApiError.validacion('La categoría es obligatoria', 'categoria');
  }
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) {
    throw ApiError.validacion('La categoría no es válida', 'categoria');
  }
  return id;
}

/** Cuerpo de `POST /anuncios`. La imagen es opcional y la añade el middleware de subida. */
function validarNuevoAnuncio(cuerpo) {
  const anuncio = {
    titulo: validarTitulo(cuerpo.titulo),
    descripcion: validarDescripcion(cuerpo.descripcion),
    precio: validarPrecio(cuerpo.precio),
    idCategoria: validarCategoria(cuerpo.categoria)
  };
  return anuncio;
}

/**
 * Cuerpo de `PATCH /anuncios/:id`: solo se comprueban los campos enviados.
 * `hayImagen` va aparte porque la imagen no llega en el cuerpo sino en `req.file`.
 */
function validarActualizacionAnuncio(cuerpo, { hayImagen = false } = {}) {
  const cambios = {};

  if (cuerpo.titulo !== undefined) {
    cambios.titulo = validarTitulo(cuerpo.titulo);
  }
  if (cuerpo.descripcion !== undefined) {
    cambios.descripcion = validarDescripcion(cuerpo.descripcion);
  }
  if (cuerpo.precio !== undefined) {
    cambios.precio = validarPrecio(cuerpo.precio);
  }
  if (cuerpo.categoria !== undefined) {
    cambios.idCategoria = validarCategoria(cuerpo.categoria);
  }

  if (Object.keys(cambios).length === 0 && !hayImagen) {
    throw ApiError.validacion('No hay ningún campo editable en el cuerpo de la petición');
  }

  return cambios;
}

/** Cuerpo de `PATCH /anuncios/:id/estado`. */
function validarCambioEstado(cuerpo) {
  const estado = typeof cuerpo.estado === 'string' ? cuerpo.estado.trim() : '';
  if (!ESTADOS.includes(estado)) {
    throw ApiError.validacion(
      `El estado tiene que ser uno de estos: ${ESTADOS.join(', ')}`,
      'estado'
    );
  }
  return { estado };
}

/**
 * Query de `GET /anuncios`. `texto` vacío se ignora (viene de un buscador) y
 * `orden` y `estado` tienen valor por defecto.
 *
 * Los valores permitidos de `orden` y `estado` se importan del servicio para que
 * la lista que se valida y la lista que se traduce a SQL no puedan divergir.
 */
function validarFiltrosAnuncios(query = {}) {
  const busqueda = typeof query.texto === 'string' ? query.texto.trim() : '';
  if (busqueda.length > LONGITUD_MAXIMA_BUSQUEDA) {
    throw ApiError.validacion(
      `La búsqueda no puede superar los ${LONGITUD_MAXIMA_BUSQUEDA} caracteres`,
      'texto'
    );
  }

  const orden = query.orden === undefined || query.orden === '' ? ORDEN_POR_DEFECTO : query.orden;
  if (!ORDENES_PERMITIDOS.includes(orden)) {
    throw ApiError.validacion(
      `El orden tiene que ser uno de estos: ${ORDENES_PERMITIDOS.join(', ')}`,
      'orden'
    );
  }

  const estado = query.estado === undefined || query.estado === '' ? ESTADO_POR_DEFECTO : query.estado;
  if (!ESTADOS_LISTADO.includes(estado)) {
    throw ApiError.validacion(
      `El estado tiene que ser uno de estos: ${ESTADOS_LISTADO.join(', ')}`,
      'estado'
    );
  }

  const filtros = { texto: busqueda === '' ? undefined : busqueda, orden, estado };

  if (query.categoria !== undefined && query.categoria !== '') {
    filtros.idCategoria = validarCategoria(query.categoria);
  }

  return filtros;
}

/* ------------------------------------------------------------------ */
/* Mensajería                                                          */
/* ------------------------------------------------------------------ */

const LONGITUD_MAXIMA_MENSAJE = 1000;

// `desde` dice desde qué extremo del hilo se cuentan las páginas: por defecto
// desde el principio, y con `final` la primera página trae los últimos mensajes.
const DIRECCIONES_HILO = ['inicio', 'final'];
const DESDE_POR_DEFECTO = 'inicio';

/**
 * Cuerpo de `POST` de un mensaje. El texto va recortado, como el resto.
 *
 * El cuerpo puede no existir (una `POST` sin cuerpo deja `req.body` a
 * `undefined`), y eso es un campo obligatorio que falta, no un 500.
 */
function validarMensaje(cuerpo = {}) {
  if (typeof cuerpo.texto !== 'string' || cuerpo.texto.trim() === '') {
    throw ApiError.validacion('El texto del mensaje es obligatorio', 'texto');
  }

  const texto = cuerpo.texto.trim();
  if (texto.length > LONGITUD_MAXIMA_MENSAJE) {
    throw ApiError.validacion(
      `El texto del mensaje no puede superar los ${LONGITUD_MAXIMA_MENSAJE} caracteres`,
      'texto'
    );
  }

  return { texto };
}

/** Query de los listados de mensajes: solo añade `desde`. */
function validarDesde(query = {}) {
  const desde = query.desde === undefined || query.desde === '' ? DESDE_POR_DEFECTO : query.desde;
  if (!DIRECCIONES_HILO.includes(desde)) {
    throw ApiError.validacion(
      `desde tiene que ser uno de estos: ${DIRECCIONES_HILO.join(', ')}`,
      'desde'
    );
  }
  return desde;
}

module.exports = {
  validarRegistro,
  validarLogin,
  validarActualizacionPerfil,
  validarNuevoAnuncio,
  validarActualizacionAnuncio,
  validarCambioEstado,
  validarFiltrosAnuncios,
  validarMensaje,
  validarDesde,
  validarId
};
