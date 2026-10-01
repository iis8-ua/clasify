'use strict';

const { consultar, ejecutar } = require('../db/pool');
const { leerPaginacion, respuestaPaginada, totalDe } = require('../helpers/paginacion');

/** Valor de `?desde=` que devuelve la página de los últimos mensajes. */
const DESDE_FINAL = 'final';

function mensajeDesdeFila(fila) {
  return {
    id: fila.id,
    texto: fila.texto,
    fecha: fila.fecha,
    leido: fila.leido === 1,
    id_conversacion: fila.id_conversacion,
    id_emisor: fila.id_emisor
  };
}

const COLUMNAS_MENSAJE = 'id, texto, fecha, leido, id_conversacion, id_emisor';

/**
 * Añade un mensaje a la conversación. Devuelve el mensaje ya leído de la base de
 * datos en vez de armarlo en memoria, para que la fecha sea la que ha puesto
 * MySQL y no la del reloj de Node, que pueden no coincidir.
 */
async function enviar(idConversacion, idEmisor, texto) {
  const resultado = await ejecutar(
    'INSERT INTO mensajes (texto, id_conversacion, id_emisor) VALUES (?, ?, ?)',
    [texto, idConversacion, idEmisor]
  );

  const filas = await consultar(`SELECT ${COLUMNAS_MENSAJE} FROM mensajes WHERE id = ?`, [
    resultado.insertId
  ]);

  return mensajeDesdeFila(filas[0]);
}

/**
 * Mensajes de una conversación, del más antiguo al más nuevo, y de paso se dan
 * por leídos los que le quedaban pendientes al otro participante.
 *
 * `conversacion` es la fila que ya ha devuelto `conversacionService`, con su
 * `id_autor`: de ahí sale el otro participante, que es el único a quien se le
 * marcan mensajes. `null` significa que todavía no hay conversación, y entonces
 * el hilo está vacío: 200 con la lista vacía, no un 404.
 *
 * Al listar se marcan **todos** los pendientes del otro, no solo los de la página
 * que se devuelve, y `no_leidos` dice cuántos eran. Es lo que dice la SPEC y hace
 * que el contador sea el total real de pendientes, aunque después se muestren en
 * varias páginas. Por eso los mensajes del otro de esta misma respuesta ya
 * salen con `leido: true`: es el estado en que quedan tras esta llamada.
 */
async function listar(conversacion, idUsuario, paginacion, opciones = {}) {
  const { pagina, limite } = paginacion ?? leerPaginacion();

  if (!conversacion) {
    return respuestaPaginada([], { pagina, limite }, 0);
  }

  const otro = conversacion.id_comprador === idUsuario ? conversacion.id_autor : conversacion.id_comprador;

  const marcados = await ejecutar(
    'UPDATE mensajes SET leido = 1 WHERE id_conversacion = ? AND id_emisor = ? AND leido = 0',
    [conversacion.id, otro]
  );
  const noLeidos = marcados.affectedRows;

  const conteo = await consultar('SELECT COUNT(*) AS total FROM mensajes WHERE id_conversacion = ?', [
    conversacion.id
  ]);
  const total = totalDe(conteo);

  if (pagina > Math.ceil(total / limite)) {
    return respuestaPaginada([], { pagina, limite }, total);
  }

  // Con `desde=final` la primera página es la de los últimos mensajes, pero
  // dentro de la página el orden sigue siendo de más antiguo a más nuevo, que es
  // como se lee un hilo. Con `desde=inicio` (el valor por defecto) la primera
  // página es la del principio del hilo.
  //
  // Contadas desde el final, las páginas van hacia atrás y la última en llegar al
  // principio puede quedar a medias, así que además del `offset` hay que ajustar
  // cuántas filas se piden: si el hilo no es múltiplo del `limite`, la última
  // página devuelve solo las suyas. Sin ese recorte, con 5 mensajes y un límite
  // de 2, la tercera página devolvería M1 y M2, y M2 ya había salido en la
  // segunda.
  const desdeFinal = opciones.desde === DESDE_FINAL;
  const offset = desdeFinal ? Math.max(0, total - pagina * limite) : (pagina - 1) * limite;
  const registros = desdeFinal ? Math.min(limite, total - offset - (pagina - 1) * limite) : limite;

  const filas = await consultar(
    `SELECT ${COLUMNAS_MENSAJE} FROM mensajes
      WHERE id_conversacion = ?
      ORDER BY fecha ASC, id ASC
      LIMIT ? OFFSET ?`,
    [conversacion.id, registros, offset]
  );

  const mensajes = filas.map((fila) => ({ ...mensajeDesdeFila(fila), no_leidos: noLeidos }));

  return respuestaPaginada(mensajes, { pagina, limite }, total);
}

module.exports = { enviar, listar };
