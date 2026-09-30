'use strict';

const { consultar, ejecutar } = require('../db/pool');
const { hashearContrasena, verificarContrasena } = require('./authService');
const { ApiError } = require('../errors/ApiError');
const { leerPaginacion, respuestaPaginada, totalDe } = require('../helpers/paginacion');
const { CAMPOS_LISTADO_ANUNCIO } = require('../helpers/proyecciones');

const CAMPOS_PRIVADOS = 'id, email, nombre, biografia, fecha_alta';
const CAMPOS_PUBLICOS = 'id, nombre, biografia, fecha_alta';

/** 404 con el mismo phrasing que el 404 de ruta del manejador central. */
function usuarioNoEncontrado(id) {
  return new ApiError(404, 'NO_ENCONTRADO', `No existe el usuario ${id}`);
}

/**
 * Perfil propio: incluye el email, que solo ve su dueño.
 * No se proyecta el password_hash en ningún caso.
 */
async function perfilPropio(id) {
  const filas = await consultar(
    `SELECT ${CAMPOS_PRIVADOS} FROM usuarios WHERE id = ?`,
    [id]
  );
  return filas[0] ?? null;
}

/** Perfil público: sin email ni password_hash. */
async function perfilPublico(id) {
  const filas = await consultar(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios WHERE id = ?`, [id]);
  if (!filas[0]) {
    throw usuarioNoEncontrado(id);
  }
  return filas[0];
}

async function existe(id) {
  const filas = await consultar('SELECT 1 AS existe FROM usuarios WHERE id = ?', [id]);
  return filas.length > 0;
}

/** Lanza 404 si el usuario no existe. Para los listados que no devuelven su perfil. */
async function exigirUsuario(id) {
  if (!(await existe(id))) {
    throw usuarioNoEncontrado(id);
  }
}

/**
 * Actualiza los campos indicados del perfil y lo devuelve ya actualizado.
 * Solo se tocan los campos enviados: es un PATCH, no un PUT.
 * @param {number} id
 * @param {{ nombre?: string, biografia?: string|null, nuevaContrasena?: string, contrasenaActual?: string }} cambios
 */
async function actualizarPerfil(id, cambios) {
  const columnas = [];
  const valores = [];

  if (cambios.nombre !== undefined) {
    columnas.push('nombre = ?');
    valores.push(cambios.nombre);
  }

  if (cambios.biografia !== undefined) {
    // Una biografía vacía se guarda como NULL, no como cadena vacía.
    columnas.push('biografia = ?');
    valores.push(cambios.biografia === '' ? null : cambios.biografia);
  }

  if (cambios.nuevaContrasena !== undefined) {
    columnas.push('password_hash = ?');
    valores.push(await hashDeContrasenaValida(id, cambios.contrasenaActual, cambios.nuevaContrasena));
  }

  if (columnas.length === 0) {
    throw ApiError.validacion('No hay ningún campo editable en el cuerpo de la petición');
  }

  valores.push(id);
  await ejecutar(`UPDATE usuarios SET ${columnas.join(', ')} WHERE id = ?`, valores);

  return perfilPropio(id);
}

/**
 * Comprueba la contraseña actual y devuelve el hash nuevo. Se llama antes de
 * escribir nada, para no dejar el UPDATE a medias si la actual no coincide.
 */
async function hashDeContrasenaValida(id, contrasenaActual, nuevaContrasena) {
  const filas = await consultar('SELECT password_hash FROM usuarios WHERE id = ?', [id]);

  if (!filas[0]) {
    throw usuarioNoEncontrado(id);
  }

  const coincide = await verificarContrasena(contrasenaActual, filas[0].password_hash);
  if (!coincide) {
    throw ApiError.noAutorizado(
      'CREDENCIALES_INVALIDAS',
      'La contraseña actual no es correcta'
    );
  }

  return hashearContrasena(nuevaContrasena);
}

/** Anuncios publicados por un usuario, en el formato paginado común. */
async function listarAnuncios(idUsuario, paginacion) {
  const { pagina, limite, offset } = paginacion ?? leerPaginacion();

  const [filas, conteo] = await Promise.all([
    consultar(
      `SELECT ${CAMPOS_LISTADO_ANUNCIO} FROM anuncios
       WHERE id_autor = ?
       ORDER BY fecha_creacion DESC, id DESC
       LIMIT ? OFFSET ?`,
      [idUsuario, limite, offset]
    ),
    consultar('SELECT COUNT(*) AS total FROM anuncios WHERE id_autor = ?', [idUsuario])
  ]);

  return respuestaPaginada(filas, { pagina, limite }, totalDe(conteo));
}

module.exports = {
  CAMPOS_PRIVADOS,
  CAMPOS_PUBLICOS,
  perfilPropio,
  perfilPublico,
  existe,
  exigirUsuario,
  actualizarPerfil,
  listarAnuncios
};
