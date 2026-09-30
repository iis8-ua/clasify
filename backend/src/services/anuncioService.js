'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { consultar, ejecutar } = require('../db/pool');
const { ApiError } = require('../errors/ApiError');
const { leerPaginacion, respuestaPaginada, totalDe } = require('../helpers/paginacion');
const { CAMPOS_PUBLICOS } = require('./usuarioService');
const { CARPETA } = require('../middleware/subidaImagen');

const CAMPOS_LISTADO =
  'a.id, a.titulo, a.precio, a.estado, a.imagen, a.fecha_creacion, a.id_categoria';

/**
 * Proyección del autor para el detalle. Se deriva de `CAMPOS_PUBLICOS` de
 * `usuarioService` para que el autor embebido salga con los mismos campos que el
 * perfil público y no vuelva a aparecer el email.
 */
const CAMPOS_AUTOR = CAMPOS_PUBLICOS.split(', ')
  .map((campo) => `u.${campo} AS autor_${campo}`)
  .join(', ');

const ORDEN_POR_DEFECTO = 'fecha_desc';
const ESTADO_POR_DEFECTO = 'disponible';

/**
 * Traducción de `?orden=` a SQL. El `id` de segunda hace que la ordenación sea
 * estable: sin él, dos anuncios con el mismo precio pueden cambiar de posición
 * entre dos páginas y alguno se repetiría o se saltaría.
 */
const ORDENES_SQL = {
  fecha_desc: 'a.fecha_creacion DESC, a.id DESC',
  fecha_asc: 'a.fecha_creacion ASC, a.id ASC',
  precio_desc: 'a.precio DESC, a.id DESC',
  precio_asc: 'a.precio ASC, a.id ASC'
};

const ORDENES_PERMITIDOS = Object.keys(ORDENES_SQL);
const ESTADOS_LISTADO = ['disponible', 'vendido', 'todos'];

function anuncioNoEncontrado(id) {
  return new ApiError(404, 'NO_ENCONTRADO', `No existe el anuncio ${id}`);
}

function sinPermisos() {
  return ApiError.prohibido('Solo el autor del anuncio puede modificarlo');
}

/** Escapa los comodines de LIKE para que el usuario pueda buscarlos literalmente. */
function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

async function exigirCategoria(id) {
  const filas = await consultar('SELECT 1 AS existe FROM categorias WHERE id = ?', [id]);
  if (filas.length === 0) {
    throw ApiError.validacion('La categoría no existe', 'categoria');
  }
}

/**
 * Crea un anuncio. La imagen es opcional: sin ella se guarda `null`, que es lo
 * que la columna admite.
 */
async function crear({ titulo, descripcion, precio, idCategoria, idAutor, imagen = null }) {
  await exigirCategoria(idCategoria);

  const resultado = await ejecutar(
    `INSERT INTO anuncios (titulo, descripcion, precio, imagen, id_autor, id_categoria)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [titulo, descripcion, precio, imagen, idAutor, idCategoria]
  );

  return detalle(resultado.insertId);
}

/**
 * Listado con búsqueda por texto, filtro por categoría y filtro por estado.
 * El `WHERE` y el `ORDER BY` se construyen con lo que llega en la query, siempre
 * sobre listas cerradas de columnas y de valores permitidos.
 */
async function listar(filtros = {}, paginacion) {
  const { pagina, limite, offset } = paginacion ?? leerPaginacion();
  const condiciones = [];
  const valores = [];

  if (filtros.estado !== 'todos') {
    condiciones.push('a.estado = ?');
    valores.push(filtros.estado ?? ESTADO_POR_DEFECTO);
  }

  if (filtros.idCategoria !== undefined) {
    await exigirCategoria(filtros.idCategoria);
    condiciones.push('a.id_categoria = ?');
    valores.push(filtros.idCategoria);
  }

  if (filtros.texto !== undefined) {
    // utf8mb4_unicode_ci hace que la comparación no distinga mayúsculas, minúsculas
    // ni acentos: "electronica" encuentra "Electrónica".
    condiciones.push('(a.titulo LIKE ? OR a.descripcion LIKE ?)');
    const patron = `%${escaparLike(filtros.texto)}%`;
    valores.push(patron, patron);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  const orden = ORDENES_SQL[filtros.orden ?? ORDEN_POR_DEFECTO];

  const [filas, conteo] = await Promise.all([
    consultar(
      `SELECT ${CAMPOS_LISTADO} FROM anuncios a ${where} ORDER BY ${orden} LIMIT ? OFFSET ?`,
      [...valores, limite, offset]
    ),
    consultar(`SELECT COUNT(*) AS total FROM anuncios a ${where}`, valores)
  ]);

  return respuestaPaginada(filas, { pagina, limite }, totalDe(conteo));
}

/**
 * Detalle del anuncio con su autor, su categoría y el número de favoritos.
 * No se incluye `conversacion`: esa tabla no se consulta hasta la I5.
 */
async function detalle(id) {
  const filas = await consultar(
    `SELECT a.id, a.titulo, a.descripcion, a.precio, a.estado, a.imagen, a.fecha_creacion,
            a.id_autor, a.id_categoria,
            ${CAMPOS_AUTOR},
            c.id AS categoria_id, c.nombre AS categoria_nombre,
            (SELECT COUNT(*) FROM favoritos f WHERE f.id_anuncio = a.id) AS num_favoritos
       FROM anuncios a
       JOIN usuarios u ON u.id = a.id_autor
       JOIN categorias c ON c.id = a.id_categoria
      WHERE a.id = ?`,
    [id]
  );

  const fila = filas[0];
  if (!fila) {
    throw anuncioNoEncontrado(id);
  }

  return {
    id: fila.id,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    precio: fila.precio,
    estado: fila.estado,
    imagen: fila.imagen,
    fecha_creacion: fila.fecha_creacion,
    autor: {
      id: fila.autor_id,
      nombre: fila.autor_nombre,
      biografia: fila.autor_biografia,
      fecha_alta: fila.autor_fecha_alta
    },
    categoria: { id: fila.categoria_id, nombre: fila.categoria_nombre },
    num_favoritos: Number(fila.num_favoritos)
  };
}

/** Fila mínima con lo justo para comprobar la autoría. */
async function buscar(id) {
  const filas = await consultar('SELECT id, id_autor, imagen FROM anuncios WHERE id = ?', [id]);
  return filas[0] ?? null;
}

/**
 * Devuelve el anuncio si existe y pertenece a `idUsuario`; si existe pero es de
 * otro, 403. Se comprueba primero la existencia para que un id inexistente sea
 * 404 y no 403, igual que en el resto de la API.
 */
async function exigirAnuncioDeAutor(id, idUsuario) {
  const anuncio = await buscar(id);
  if (!anuncio) {
    throw anuncioNoEncontrado(id);
  }
  if (anuncio.id_autor !== idUsuario) {
    throw sinPermisos();
  }
  return anuncio;
}

/**
 * Edita los campos enviados y devuelve el anuncio actualizado.
 * Si llega imagen nueva se guarda el nombre en la base de datos y se borra el
 * fichero antiguo, que si no se quedaría huérfano en `uploads/`.
 */
async function actualizar(id, idUsuario, cambios, imagenNueva) {
  const anterior = await exigirAnuncioDeAutor(id, idUsuario);

  const columnas = [];
  const valores = [];

  if (cambios.titulo !== undefined) {
    columnas.push('titulo = ?');
    valores.push(cambios.titulo);
  }
  if (cambios.descripcion !== undefined) {
    columnas.push('descripcion = ?');
    valores.push(cambios.descripcion);
  }
  if (cambios.precio !== undefined) {
    columnas.push('precio = ?');
    valores.push(cambios.precio);
  }
  if (cambios.idCategoria !== undefined) {
    await exigirCategoria(cambios.idCategoria);
    columnas.push('id_categoria = ?');
    valores.push(cambios.idCategoria);
  }
  if (imagenNueva !== undefined) {
    columnas.push('imagen = ?');
    valores.push(imagenNueva);
  }

  valores.push(id);
  await ejecutar(`UPDATE anuncios SET ${columnas.join(', ')} WHERE id = ?`, valores);

  if (imagenNueva !== undefined && anterior.imagen) {
    await borrarFichero(anterior.imagen);
  }

  return detalle(id);
}

/** Cambia el estado entre disponible y vendido. Solo su autor. */
async function cambiarEstado(id, idUsuario, estado) {
  await exigirAnuncioDeAutor(id, idUsuario);
  await ejecutar('UPDATE anuncios SET estado = ? WHERE id = ?', [estado, id]);
  return detalle(id);
}

/**
 * Borra el anuncio y su fichero de imagen. Las filas de favoritos,
 * conversaciones y mensajes se van solas por el ON DELETE CASCADE del esquema.
 */
async function eliminar(id, idUsuario) {
  const anuncio = await exigirAnuncioDeAutor(id, idUsuario);
  await ejecutar('DELETE FROM anuncios WHERE id = ?', [id]);

  if (anuncio.imagen) {
    await borrarFichero(anuncio.imagen);
  }
}

/**
 * Borra un fichero de `uploads/`. Si ya no está, no es un error: el anuncio se
 * puede haber borrado antes y lo que importa es que no quede la fila.
 */
async function borrarFichero(nombre) {
  try {
    await fs.unlink(path.join(CARPETA, path.basename(nombre)));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

module.exports = {
  ORDENES_PERMITIDOS,
  ORDEN_POR_DEFECTO,
  ESTADOS_LISTADO,
  ESTADO_POR_DEFECTO,
  crear,
  listar,
  detalle,
  buscar,
  exigirAnuncioDeAutor,
  actualizar,
  cambiarEstado,
  eliminar,
  borrarFichero
};
