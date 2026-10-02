'use strict';

const { consultar, ejecutar } = require('../db/pool');
const { ApiError } = require('../errors/ApiError');
const { leerPaginacion, respuestaPaginada, totalDe } = require('../helpers/paginacion');

const COLUMNAS_VALORACION = 'id, puntuacion, comentario, fecha, id_valorador, id_valorado';

function valoracionDesdeFila(fila) {
  return {
    id: fila.id,
    puntuacion: fila.puntuacion,
    comentario: fila.comentario,
    fecha: fila.fecha,
    id_valorador: fila.id_valorador,
    id_valorado: fila.id_valorado
  };
}

/** 404 con el mismo phrasing que el 404 de ruta del manejador central. */
function usuarioNoEncontrado(id) {
  return new ApiError(404, 'NO_ENCONTRADO', `No existe el usuario ${id}`);
}

/**
 * Comprueba que el usuario existe y devuelve su fila mínima. Se llama antes de
 * escribir para poder contestar 404 en vez de dejar que reviente una clave
 * foránea.
 */
async function exigirUsuario(id) {
  const filas = await consultar('SELECT id FROM usuarios WHERE id = ?', [id]);

  if (filas.length === 0) {
    throw usuarioNoEncontrado(id);
  }
  return filas[0];
}

/**
 * Pone o cambia la valoración que `idValorador` le deja a `idValorado`.
 *
 * La unicidad la decide el `UNIQUE (id_valorador, id_valorado)` del esquema y se
 * resuelve en dos pasos en lugar de con un `ON DUPLICATE KEY UPDATE`. La razón
 * está medida: `ON DUPLICATE KEY UPDATE` devuelve `affectedRows` 1 tanto al
 * insertar una fila nueva como al actualizar una que ya tenía los mismos
 * valores, porque el driver informa de filas *encontradas* y no de filas
 * *cambiadas*. Con esa señal no hay forma de saber si hay que contestar 201 o
 * 200, que es justo lo que la ruta necesita saber.
 *
 * `INSERT IGNORE`, en cambio, sí devuelve 0 cuando la fila ya existe, igual que
 * en los favoritos y en las conversaciones. Por eso: si da 1 es nueva (201) y si
 * da 0 se actualiza la que ya había (200).
 *
 * Que el `INSERT IGNORE` se trague errores ajenos al duplicado no importa aquí:
 * el usuario está comprobado y la puntuación la ha validado `validar.js`, así
 * que ninguna clave foránea ni el `CHECK` pueden fallar. Y si algún día
 * alguien se salta esa capa, la fila no llega a insertarse y el `UPDATE`
 * posterior falla con un 500, o sea que el error sale igualmente.
 */
async function valorar(idValorador, idValorado, { puntuacion, comentario }) {
  await exigirUsuario(idValorado);

  if (idValorador === idValorado) {
    throw ApiError.validacion('No puedes valorarte a ti mismo', 'usuario');
  }

  const insertado = await ejecutar(
    'INSERT IGNORE INTO valoraciones (id_valorador, id_valorado, puntuacion, comentario) VALUES (?, ?, ?, ?)',
    [idValorador, idValorado, puntuacion, comentario]
  );

  if (insertado.affectedRows === 0) {
    await ejecutar(
      'UPDATE valoraciones SET puntuacion = ?, comentario = ? WHERE id_valorador = ? AND id_valorado = ?',
      [puntuacion, comentario, idValorador, idValorado]
    );
  }

  const filas = await consultar(
    `SELECT ${COLUMNAS_VALORACION} FROM valoraciones WHERE id_valorador = ? AND id_valorado = ?`,
    [idValorador, idValorado]
  );

  return { nuevo: insertado.affectedRows === 1, valoracion: valoracionDesdeFila(filas[0]) };
}

/**
 * Quita la valoración propia sobre otro usuario. Si no había ninguna, 404: no se
 * trata como un borrado idempotente porque el enunciado pide que las operaciones
 * avisen cuando no había nada que borrar, que es lo que ya hace `/favoritos`.
 */
async function quitar(idValorador, idValorado) {
  await exigirUsuario(idValorado);

  const resultado = await ejecutar(
    'DELETE FROM valoraciones WHERE id_valorador = ? AND id_valorado = ?',
    [idValorador, idValorado]
  );

  if (resultado.affectedRows === 0) {
    throw new ApiError(
      404,
      'NO_ENCONTRADO',
      `No has valorado al usuario ${idValorado}`
    );
  }
}

/**
 * Valoraciones recibidas por un usuario, de la más reciente a la más antigua.
 *
 * Sale quién valoración con su nombre, pero nunca su email ni su `password_hash`:
 * el listado es público y no tiene por qué enseñar datos de contacto.
 */
async function listar(idUsuario, paginacion) {
  const { pagina, limite, offset } = paginacion ?? leerPaginacion();

  await exigirUsuario(idUsuario);

  const [filas, conteo] = await Promise.all([
    consultar(
      `SELECT v.id, v.puntuacion, v.comentario, v.fecha,
              v.id_valorador, u.nombre AS autor_nombre
         FROM valoraciones v
         JOIN usuarios u ON u.id = v.id_valorador
        WHERE v.id_valorado = ?
        ORDER BY v.fecha DESC, v.id DESC
        LIMIT ? OFFSET ?`,
      [idUsuario, limite, offset]
    ),
    consultar('SELECT COUNT(*) AS total FROM valoraciones WHERE id_valorado = ?', [idUsuario])
  ]);

  const datos = filas.map((fila) => ({
    id: fila.id,
    puntuacion: fila.puntuacion,
    comentario: fila.comentario,
    fecha: fila.fecha,
    autor: { id: fila.id_valorador, nombre: fila.autor_nombre }
  }));

  return respuestaPaginada(datos, { pagina, limite }, totalDe(conteo));
}

/**
 * Valoraciones que ha escrito el usuario, de la más reciente a la más antigua, con
 * el nombre y la media de quien las ha recibido. Es el "las que he puesto yo", al
 * revés que `listar`.
 */
async function listarPropias(idUsuario, paginacion) {
  const { pagina, limite, offset } = paginacion ?? leerPaginacion();

  const [filas, conteo] = await Promise.all([
    consultar(
      `SELECT v.id, v.puntuacion, v.comentario, v.fecha, v.id_valorado,
              u.nombre AS autor_nombre,
              (SELECT ROUND(AVG(v2.puntuacion), 2) FROM valoraciones v2
                WHERE v2.id_valorado = v.id_valorado) AS valoracion_media,
              (SELECT COUNT(*) FROM valoraciones v3 WHERE v3.id_valorado = v.id_valorado)
                AS num_valoraciones
         FROM valoraciones v
         JOIN usuarios u ON u.id = v.id_valorado
        WHERE v.id_valorador = ?
        ORDER BY v.fecha DESC, v.id DESC
        LIMIT ? OFFSET ?`,
      [idUsuario, limite, offset]
    ),
    consultar('SELECT COUNT(*) AS total FROM valoraciones WHERE id_valorador = ?', [idUsuario])
  ]);

  const datos = filas.map((fila) => ({
    id: fila.id,
    puntuacion: fila.puntuacion,
    comentario: fila.comentario,
    fecha: fila.fecha,
    para: {
      id: fila.id_valorado,
      nombre: fila.autor_nombre,
      valoracion_media: Number(fila.valoracion_media),
      num_valoraciones: Number(fila.num_valoraciones)
    }
  }));

  return respuestaPaginada(datos, { pagina, limite }, totalDe(conteo));
}

module.exports = { valorar, quitar, listar, listarPropias };