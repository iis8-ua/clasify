'use strict';

const { consultar, ejecutar } = require('../db/pool');
const { ApiError } = require('../errors/ApiError');
const { buscar } = require('./anuncioService');
const { CAMPOS_PUBLICOS } = require('./usuarioService');
const { leerPaginacion, respuestaPaginada, totalDe } = require('../helpers/paginacion');
const { camposListadoAnuncio } = require('../helpers/proyecciones');

/**
 * El anuncio va envuelto en el objeto `anuncio` de cada fila, así que sus
 * columnas llevan el prefijo `anuncio_` para no chocar con las de la
 * conversación. La contraparte usa `contraparte_`, igual que el `autor_` del
 * detalle, y sale con la proyección pública de `usuarioService`: sin email ni
 * `password_hash`.
 */
const CAMPOS_ANUNCIO = camposListadoAnuncio('a.', 'anuncio_');
const CAMPOS_CONTRAPARTE = CAMPOS_PUBLICOS.split(', ')
  .map((campo) => `u2.${campo} AS contraparte_${campo}`)
  .join(', ');

/**
 * El otro participante de la conversación: el vendedor si quien mira es el
 * comprador, y el comprador si quien mira es el vendedor. Es el mismo dato en
 * las dos filas de la lista, y por eso va como `CASE` en vez de repetirse la
 * condición en cada sitio.
 */
const CONTRAPARTE_SQL = 'CASE WHEN c.id_comprador = ? THEN a.id_autor ELSE c.id_comprador END';

const COLUMNAS_CONVERSACION = 'c.id, c.fecha_creacion, c.id_anuncio, c.id_comprador';

function conversacionDesdeFila(fila) {
  return {
    id: fila.id,
    fecha_creacion: fila.fecha_creacion,
    id_anuncio: fila.id_anuncio,
    id_comprador: fila.id_comprador
  };
}

function conversacionNoEncontrada(id) {
  return new ApiError(404, 'NO_ENCONTRADO', `No existe la conversación ${id}`);
}

function anuncioNoEncontrado(id) {
  return new ApiError(404, 'NO_ENCONTRADO', `No existe el anuncio ${id}`);
}

/**
 * Fila de una conversación con el `id_autor` del anuncio, que es el vendedor y
 * hace falta para saber quién es el otro participante.
 */
async function consultarConVendedor(id) {
  const filas = await consultar(
    `SELECT ${COLUMNAS_CONVERSACION}, a.id_autor
       FROM conversaciones c
       JOIN anuncios a ON a.id = c.id_anuncio
      WHERE c.id = ?`,
    [id]
  );
  return filas[0] ?? null;
}

/**
 * Devuelve la conversación si el usuario es uno de sus participantes, o 404 si
 * no existe y 403 si existe pero no participa. Es el único punto donde se decide
 * quién puede ver y escribir en un hilo: las dos rutas de `/conversaciones/:id`
 * pasan por aquí, y con `/anuncios/:id/mensajes` comparte reglas.
 */
async function exigirParticipante(id, idUsuario) {
  const conversacion = await consultarConVendedor(id);

  if (!conversacion) {
    throw conversacionNoEncontrada(id);
  }
  if (conversacion.id_comprador !== idUsuario && conversacion.id_autor !== idUsuario) {
    throw ApiError.prohibido('Solo los participantes pueden ver esta conversación');
  }

  return conversacion;
}

/**
 * La conversación del usuario con un anuncio, sea como comprador o como
 * vendedor, o `null` si no tiene ninguna con ese anuncio. No hace ninguna
 * comprobación: la usa el detalle del anuncio, que es público y donde el
 * vendedor también puede tener conversación.
 *
 * Si el usuario es el vendedor puede tener varias con el mismo anuncio, así que
 * el `ORDER BY` y el `LIMIT` no son adorno: sin ellos MySQL devolvería la primera
 * que encuentre, que no es necesariamente la última y con lo que el detalle
 * enseñaría un hilo arbitrario. Con el orden sale la más reciente, que es la que
 * de verdad le interesa. Para el comprador da igual, porque solo puede tener una.
 */
async function deParticipante(idAnuncio, idUsuario) {
  const filas = await consultar(
    `SELECT ${COLUMNAS_CONVERSACION}
       FROM conversaciones c
       JOIN anuncios a ON a.id = c.id_anuncio
      WHERE c.id_anuncio = ? AND (c.id_comprador = ? OR a.id_autor = ?)
      ORDER BY c.fecha_creacion DESC, c.id DESC
      LIMIT 1`,
    [idAnuncio, idUsuario, idUsuario]
  );
  return filas[0] ?? null;
}

/**
 * La conversación del comprador con el vendedor de un anuncio, o `null` si
 * todavía no tiene ninguna con ese vendedor (el hilo está vacío, no es un
 * error). El vendedor no puede usar esta función: sus conversaciones, que
 * pueden ser varias, están en `/usuarios/me/conversaciones`.
 *
 * Se comprueba primero que el anuncio exista (404) y después que no sea suyo
 * (400), el mismo orden que el resto de la API. Devuelve la fila con el
 * `id_autor` del anuncio, que es el vendedor, porque `mensajeService` lo necesita
 * para saber a quién le marca los mensajes como leídos.
 */
async function deComprador(idAnuncio, idComprador) {
  const anuncio = await buscar(idAnuncio);

  if (!anuncio) {
    throw anuncioNoEncontrado(idAnuncio);
  }
  if (anuncio.id_autor === idComprador) {
    throw ApiError.validacion(
      'Eres el vendedor de este anuncio: tus conversaciones están en /usuarios/me/conversaciones',
      'anuncio'
    );
  }

  const filas = await consultarConversacion(idAnuncio, idComprador);
  return filas[0] ?? null;
}

/**
 * El hilo del comprador con el vendedor de un anuncio, o la lista vacía si
 * todavía no tiene ninguno. Trae también el `id_autor` del anuncio, que es el
 * vendedor: `deComprador` lo necesita para el listado de mensajes y `iniciar` lo
 * descarta, pero así las dos rutas de escritura y lectura comparten una sola
 * forma de leer el hilo.
 */
async function consultarConversacion(idAnuncio, idComprador) {
  return consultar(
    `SELECT ${COLUMNAS_CONVERSACION}, a.id_autor
       FROM conversaciones c
       JOIN anuncios a ON a.id = c.id_anuncio
      WHERE c.id_anuncio = ? AND c.id_comprador = ?`,
    [idAnuncio, idComprador]
  );
}

/**
 * Inicia la conversación del comprador con el vendedor del anuncio, o devuelve
 * la que ya tenía.
 *
 * El anuncio `vendido` solo bloquea cuando el hilo **todavía no existe**. Un
 * hilo abierto antes de la venta tiene que poder seguir, o el comprador se
 * quedaría sin poder escribir justo cuando más necesita hablar con el vendedor
 * (dónde queda, cómo se paga), y además `POST /conversaciones/:id/mensajes` le
 * dejaría continuar igual: dos rutas darían dos respuestas distintas para lo
 * mismo.
 *
 * El `SELECT` previo decide solo esa política, nunca el código de la respuesta.
 * El 201 y el 200 los sigue decidiendo `affectedRows` del `INSERT IGNORE`, que
 * se apoya en la restricción `UNIQUE (id_anuncio, id_comprador)` del esquema,
 * igual que en los favoritos de la I4. Preguntar antes de escribir y decidir con
 * eso dejaría una carrera entre dos peticiones simultáneas del mismo comprador
 * sobre el mismo anuncio; aquí la única ventana que abre el `SELECT` es que el
 * vendedor marque el anuncio como vendido entre las dos consultas, y en ese caso
 * se abre un hilo sobre un anuncio recién cerrado.
 */
async function iniciar(idAnuncio, idComprador) {
  const anuncio = await buscar(idAnuncio);

  if (!anuncio) {
    throw anuncioNoEncontrado(idAnuncio);
  }
  if (anuncio.id_autor === idComprador) {
    throw ApiError.validacion(
      'No puedes iniciar una conversación sobre tu propio anuncio',
      'anuncio'
    );
  }

  const previa = await consultarConversacion(idAnuncio, idComprador);

  if (previa.length === 0 && anuncio.estado === 'vendido') {
    throw ApiError.validacion(
      'No se puede iniciar una conversación sobre un anuncio vendido',
      'estado'
    );
  }

  const resultado = await ejecutar(
    'INSERT IGNORE INTO conversaciones (id_anuncio, id_comprador) VALUES (?, ?)',
    [idAnuncio, idComprador]
  );

  // Si el hilo ya estaba, la fila de la consulta previa es la misma que acaba de
  // devolver el `INSERT IGNORE` y no hace falta volver a leerla. Solo cuando se
  // acaba de crear hace falta leerla, para devolverla con su `id` y su fecha.
  const fila = previa[0] ?? (await consultarConversacion(idAnuncio, idComprador))[0];

  return {
    nueva: resultado.affectedRows === 1,
    conversacion: conversacionDesdeFila(fila)
  };
}

/** Fila del listado con el anuncio, la contraparte y el último mensaje. */
function conversacionDelListado(fila) {
  return {
    id: fila.id,
    fecha_creacion: fila.fecha_creacion,
    anuncio: {
      id: fila.anuncio_id,
      titulo: fila.anuncio_titulo,
      precio: fila.anuncio_precio,
      estado: fila.anuncio_estado,
      imagen: fila.anuncio_imagen,
      fecha_creacion: fila.anuncio_fecha_creacion,
      id_categoria: fila.anuncio_id_categoria
    },
    contraparte: {
      id: fila.contraparte_id,
      nombre: fila.contraparte_nombre,
      biografia: fila.contraparte_biografia,
      fecha_alta: fila.contraparte_fecha_alta
    },
    ultimo_mensaje:
      fila.ultimo_id === null
        ? null
        : { id: fila.ultimo_id, texto: fila.ultimo_texto, fecha: fila.ultimo_fecha },
    no_leidos: Number(fila.no_leidos)
  };
}

/**
 * Conversaciones del usuario, como comprador y como vendedor, de la más reciente
 * actividad a la más antigua. La actividad es la fecha del último mensaje, y el
 * `id` de ese mensaje hace de desempate: la fecha es un `TIMESTAMP` de segundos,
 * así que dos mensajes del mismo segundo tienen la misma fecha y, sin el `id`,
 * dos conversaciones con actividad en el mismo segundo saldrían en un orden
 * arbitrario.
 *
 * `no_leidos` cuenta los mensajes del otro participante sin leer. La lista no
 * marca nada como leído: abrir la bandeja no puede vaciar los pendientes.
 */
async function listar(idUsuario, paginacion) {
  const { pagina, limite, offset } = paginacion ?? leerPaginacion();

  // El orden de los parámetros es el orden en que aparecen en el SQL: primero
  // el `CASE` de `no_leidos` en el SELECT, después el de la JOIN, los dos de la
  // WHERE y, al final, `LIMIT` y `OFFSET`.
  const [filas, conteo] = await Promise.all([
    consultar(
      `SELECT ${COLUMNAS_CONVERSACION},
              ${CAMPOS_ANUNCIO},
              ${CAMPOS_CONTRAPARTE},
              (SELECT m.id    FROM mensajes m WHERE m.id_conversacion = c.id ORDER BY m.fecha DESC, m.id DESC LIMIT 1) AS ultimo_id,
              (SELECT m.texto FROM mensajes m WHERE m.id_conversacion = c.id ORDER BY m.fecha DESC, m.id DESC LIMIT 1) AS ultimo_texto,
              (SELECT m.fecha FROM mensajes m WHERE m.id_conversacion = c.id ORDER BY m.fecha DESC, m.id DESC LIMIT 1) AS ultimo_fecha,
              (SELECT COUNT(*) FROM mensajes m
                WHERE m.id_conversacion = c.id AND m.leido = 0 AND m.id_emisor = ${CONTRAPARTE_SQL}) AS no_leidos
         FROM conversaciones c
         JOIN anuncios a  ON a.id = c.id_anuncio
         JOIN usuarios u2 ON u2.id = ${CONTRAPARTE_SQL}
        WHERE c.id_comprador = ? OR a.id_autor = ?
        ORDER BY ultimo_fecha DESC, ultimo_id DESC
        LIMIT ? OFFSET ?`,
      [idUsuario, idUsuario, idUsuario, idUsuario, limite, offset]
    ),
    consultar(
      `SELECT COUNT(*) AS total
         FROM conversaciones c
         JOIN anuncios a ON a.id = c.id_anuncio
        WHERE c.id_comprador = ? OR a.id_autor = ?`,
      [idUsuario, idUsuario]
    )
  ]);

  return respuestaPaginada(filas.map(conversacionDelListado), { pagina, limite }, totalDe(conteo));
}

module.exports = {
  exigirParticipante,
  deParticipante,
  deComprador,
  iniciar,
  listar
};
