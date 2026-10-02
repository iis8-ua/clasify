'use strict';

const { consultar, ejecutar } = require('../db/pool');
const { ApiError } = require('../errors/ApiError');
const { buscar } = require('./anuncioService');
const { leerPaginacion, respuestaPaginada, totalDe } = require('../helpers/paginacion');
const { CAMPOS_LISTADO_ANUNCIO_ALIAS } = require('../helpers/proyecciones');

/**
 * Proyección de una fila de `favoritos` para la respuesta.
 * `fecha` es la de la primera vez que se guardó: si se vuelve a marcar el mismo
 * anuncio, la fecha no cambia, que es lo que espera un usuario ("¿cuándo lo
 * guardé?").
 */
function favoritoDesdeFila(fila) {
  return {
    id: fila.id,
    fecha: fila.fecha,
    id_anuncio: fila.id_anuncio,
    id_usuario: fila.id_usuario
  };
}

async function exigirAnuncio(id) {
  const anuncio = await buscar(id);
  if (!anuncio) {
    throw new ApiError(404, 'NO_ENCONTRADO', `No existe el anuncio ${id}`);
  }
  return anuncio;
}

/**
 * Marca el anuncio como favorito. Es idempotente: la primera vez devuelve
 * `nuevo: true` y las siguientes `nuevo: false`, de modo que la ruta puede
 * contestar 201 o 200 sin que el cliente tenga que comprobar nada antes.
 *
 * El `INSERT IGNORE` se apoya en la restricción `UNIQUE (id_usuario, id_anuncio)`
 * del esquema: si la fila ya está, MySQL la descarta y `affectedRows` vale 0;
 * si no, la inserta y vale 1. No puede estar ocultando otro error, porque antes
 * se ha comprobado que el anuncio existe y el usuario sale del token, así que
 * ninguna clave foránea puede fallar.
 */
async function añadir(idAnuncio, idUsuario) {
  const anuncio = await exigirAnuncio(idAnuncio);

  if (anuncio.id_autor === idUsuario) {
    throw ApiError.validacion('No se puede añadir a favoritos tu propio anuncio', 'anuncio');
  }

  const resultado = await ejecutar(
    'INSERT IGNORE INTO favoritos (id_usuario, id_anuncio) VALUES (?, ?)',
    [idUsuario, idAnuncio]
  );

  const filas = await consultar(
    'SELECT id, fecha, id_usuario, id_anuncio FROM favoritos WHERE id_usuario = ? AND id_anuncio = ?',
    [idUsuario, idAnuncio]
  );

  return { nuevo: resultado.affectedRows === 1, favorito: favoritoDesdeFila(filas[0]) };
}

/** Quita el favorito. Si el anuncio no estaba en la lista, 404. */
async function quitar(idAnuncio, idUsuario) {
  await exigirAnuncio(idAnuncio);

  const resultado = await ejecutar(
    'DELETE FROM favoritos WHERE id_usuario = ? AND id_anuncio = ?',
    [idUsuario, idAnuncio]
  );

  if (resultado.affectedRows === 0) {
    throw new ApiError(404, 'NO_ENCONTRADO', `El anuncio ${idAnuncio} no está en tus favoritos`);
  }
}

/**
 * Anuncios guardados por el usuario, del más reciente al más antiguo por la
 * fecha en que se guardaron (no por la del anuncio). Salen los vendidos
 * también, igual que en `/usuarios/:id/anuncios`: si alguien guarda algo y
 * luego se vende, quiere saber que lo tenía guardado.
 */
async function listar(idUsuario, paginacion) {
  const { pagina, limite, offset } = paginacion ?? leerPaginacion();

  const [filas, conteo] = await Promise.all([
    consultar(
      `SELECT ${CAMPOS_LISTADO_ANUNCIO_ALIAS}
         FROM favoritos f
         JOIN anuncios a ON a.id = f.id_anuncio
        WHERE f.id_usuario = ?
        ORDER BY f.fecha DESC, f.id DESC
        LIMIT ? OFFSET ?`,
      [idUsuario, limite, offset]
    ),
    consultar('SELECT COUNT(*) AS total FROM favoritos WHERE id_usuario = ?', [idUsuario])
  ]);

  return respuestaPaginada(filas, { pagina, limite }, totalDe(conteo));
}

module.exports = { añadir, quitar, listar };
