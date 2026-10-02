'use strict';

const { cliente, clienteConToken } = require('../supabase/cliente');
const { desdeError, deServicio } = require('../errors/ErrorDeServicio');
const {
  leerPaginacion,
  respuestaPaginada,
  contar,
  patronBusqueda
} = require('../helpers/listado');

const LONGITUD_MAXIMA_TITULO = 120;
const LONGITUD_MAXIMA_DESCRIPCION = 5000;
const ESTADOS = ['disponible', 'vendido'];
const ESTADO_POR_DEFECTO = 'disponible';

/** Columnas del anuncio con su autor (público) y su categoría embebidos. */
const COLUMNAS = `
  id, titulo, descripcion, precio, estado, imagen, created_at,
  id_categoria, id_autor,
  categorias ( id, nombre ),
  perfiles ( id, nombre, biografia, created_at )
`;

/**
 * Convierte una fila de PostgREST al mismo formato que usa el backend propio, con
 * `id_categoria` dentro del objeto categoría y `autor` con la proyección pública.
 *
 * El precio llega como texto porque en Postgres `NUMERIC` no es un número de
 * JavaScript y el cliente lo serializa como cadena para no perder precisión. Aquí
 * se convierte, porque es un importe pequeño y quien lo consume lo va a comparar
 * y ordenar. Es la misma decisión que con `valoracion_media` en el otro backend.
 */
function aAnuncio(fila) {
  if (!fila) {
    return null;
  }

  return {
    id: fila.id,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    precio: Number(fila.precio),
    estado: fila.estado,
    imagen: fila.imagen,
    fecha_creacion: fila.created_at,
    categoria: fila.categorias
      ? { id: fila.categorias.id, nombre: fila.categorias.nombre }
      : null,
    autor: fila.perfiles
      ? {
          id: fila.perfiles.id,
          nombre: fila.perfiles.nombre,
          biografia: fila.perfiles.biografia,
          fecha_alta: fila.perfiles.created_at
        }
      : null
  };
}

function validarTitulo(valor) {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw deServicio('VALIDACION', 'El título es obligatorio', 400);
  }

  const titulo = valor.trim();
  if (titulo.length > LONGITUD_MAXIMA_TITULO) {
    throw deServicio(
      'VALIDACION',
      `El título no puede superar los ${LONGITUD_MAXIMA_TITULO} caracteres`,
      400
    );
  }

  return titulo;
}

function validarDescripcion(valor) {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw deServicio('VALIDACION', 'La descripción es obligatoria', 400);
  }

  const descripcion = valor.trim();
  if (descripcion.length > LONGITUD_MAXIMA_DESCRIPCION) {
    throw deServicio(
      'VALIDACION',
      `La descripción no puede superar los ${LONGITUD_MAXIMA_DESCRIPCION} caracteres`,
      400
    );
  }

  return descripcion;
}

function validarPrecio(valor) {
  const numero = Number(valor);

  if (valor === undefined || valor === null || valor === '' || !Number.isFinite(numero)) {
    throw deServicio('VALIDACION', 'El precio es obligatorio y tiene que ser un número', 400);
  }
  if (numero < 0) {
    throw deServicio('VALIDACION', 'El precio no puede ser negativo', 400);
  }

  return numero;
}

function validarImagen(valor) {
  if (valor === null || valor === '') {
    return null;
  }
  if (typeof valor !== 'string') {
    throw deServicio('VALIDACION', 'La imagen tiene que ser una URL o un nombre', 400);
  }

  return valor.trim() || null;
}

function validarNuevo(datos) {
  const validados = {
    titulo: validarTitulo(datos.titulo),
    descripcion: validarDescripcion(datos.descripcion),
    precio: validarPrecio(datos.precio)
  };

  const categoria = Number(datos.id_categoria);
  if (!Number.isInteger(categoria) || categoria < 1) {
    throw deServicio('VALIDACION', 'La categoría es obligatoria', 400);
  }
  validados.id_categoria = categoria;

  if (datos.imagen !== undefined) {
    validados.imagen = validarImagen(datos.imagen);
  }

  return validados;
}

/**
 * Crea un anuncio del usuario autenticado.
 *
 * El `id_autor` lo pone el servicio y no el que llama, y además lo fuerza a ser
 * el del token. La política `anuncios_insert` vuelve a comprobarlo en la base de
 * datos con `auth.uid() = id_autor`, así que los dos sitios tienen que estar de
 * acuerdo.
 */
async function crear(datos, { token, usuarioId } = {}) {
  const validados = validarNuevo(datos);

  const { data, error } = await clienteConToken(token)
    .from('anuncios')
    .insert({ ...validados, id_autor: usuarioId })
    .select(COLUMNAS)
    .single();

  if (error) {
    throw desdeError(error, { tabla: 'anuncios' });
  }

  return aAnuncio(data);
}

/**
 * Aplica los filtros de búsqueda a una consulta que ya tiene su `select`.
 *
 * `orden` acepta los mismos cuatro valores que el backend propio. El precio es un
 * `NUMERIC` en Postgres, así que ordenar por precio ordena por valor: no hay el
 * problema de "100" antes que "20" que daría ordena por texto.
 */
function aplicarFiltros(base, { texto, categoria, estado, orden = 'fecha_desc' }) {
  let consulta = base;

  if (texto && String(texto).trim()) {
    // Busca sobre las columnas normalizadas, no sobre las originales: en el
    // backend propio la collation utf8mb4_unicode_ci hace que "electronica"
    // encuentre "Electrónica", y para igualarlo en Postgres el texto tiene que
    // venir ya en minúsculas y sin acentos. El trigger de la migración 0002 se
    // encarga al escribir.
    const patron = patronBusqueda(String(texto).trim());
    consulta = consulta.or(
      `titulo_buscable.ilike.${patron},descripcion_buscable.ilike.${patron}`
    );
  }

  if (categoria !== undefined && categoria !== null && categoria !== '') {
    const numero = Number(categoria);
    if (!Number.isInteger(numero) || numero < 1) {
      throw deServicio('VALIDACION', 'La categoría no es válida', 400);
    }
    consulta = consulta.eq('id_categoria', numero);
  }

  // Por defecto se ocultan los vendidos, igual que en el backend propio, y
  // 'todos' los enseña.
  if (estado !== 'todos') {
    const valor = estado ?? ESTADO_POR_DEFECTO;
    if (!ESTADOS.includes(valor)) {
      throw deServicio(
        'VALIDACION',
        `El estado tiene que ser ${ESTADOS.join(', ')} o todos`,
        400
      );
    }
    consulta = consulta.eq('estado', valor);
  }

  const ORDENES = {
    fecha_desc: ['created_at', false],
    fecha_asc: ['created_at', true],
    precio_desc: ['precio', false],
    precio_asc: ['precio', true]
  };
  const [columna, ascendente] = ORDENES[orden] || ORDENES.fecha_desc;

  return consulta.order(columna, { ascending: ascendente, nullsFirst: false });
}

/**
 * Lista anuncios con búsqueda por texto, filtro por categoría y paginación.
 *
 * Es una ruta pública: se usa el cliente sin sesión y RLS deja leer los anuncios a
 * cualquiera. El autor y la categoría van embebidos para no tener que hacer una
 * consulta por fila.
 *
 * El total y los datos salen de dos peticiones en paralelo. Van en dos porque en
 * PostgREST el `count` que trae la respuesta de una página es el número de filas de
 * esa página, no el total de la tabla; para el total hay que pedirlo aparte con
 * `head: true`.
 */
async function listar({ texto, categoria, estado, orden = 'fecha_desc', ...opciones } = {}) {
  const paginacion = leerPaginacion(opciones);
  const filtros = { texto, categoria, estado, orden };

  const [total, { data, error }] = await Promise.all([
    contar(
      aplicarFiltros(
        cliente.from('anuncios').select('id', { count: 'exact', head: true }),
        filtros
      )
    ),
    aplicarFiltros(cliente.from('anuncios').select(COLUMNAS), filtros).range(
      paginacion.desde,
      paginacion.hasta
    )
  ]);

  if (error) {
    throw desdeError(error, { tabla: 'anuncios' });
  }

  return respuestaPaginada(
    (data ?? []).map(aAnuncio),
    paginacion,
    total
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Comprueba que un id tiene forma de uuid antes de mandarlo a la base.
 *
 * `anuncios.id` e `id_autor` son uuid. Sin esta comprobación, Postgres responde
 * "invalid input syntax for type uuid", que es un error interno de la base de
 * datos y no un 404 ni un fallo de validación de la capa. Todas las funciones
 * que reciben un id pasan por aquí, no solo las de lectura: si se valida en unas
 * sí y en otras no, el mismo id inválido daría dos respuestas distintas según por
 * dónde entre.
 */
function exigirUuid(valor, nombre = 'el id del anuncio') {
  if (typeof valor !== 'string' || !UUID_RE.test(valor)) {
    throw deServicio('VALIDACION', `${nombre} no es un uuid válido`, 400);
  }
}

/** Un anuncio con su autor y su categoría, o `null` si no existe. */
async function obtener(id) {
  exigirUuid(id);

  const { data, error } = await cliente
    .from('anuncios')
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw desdeError(error, { tabla: 'anuncios' });
  }

  return aAnuncio(data);
}

function validarActualizacion(datos) {
  const cambios = {};

  if (datos.titulo !== undefined) {
    cambios.titulo = validarTitulo(datos.titulo);
  }
  if (datos.descripcion !== undefined) {
    cambios.descripcion = validarDescripcion(datos.descripcion);
  }
  if (datos.precio !== undefined) {
    cambios.precio = validarPrecio(datos.precio);
  }
  if (datos.imagen !== undefined) {
    cambios.imagen = validarImagen(datos.imagen);
  }
  if (datos.id_categoria !== undefined) {
    const numero = Number(datos.id_categoria);
    if (!Number.isInteger(numero) || numero < 1) {
      throw deServicio('VALIDACION', 'La categoría no es válida', 400);
    }
    cambios.id_categoria = numero;
  }
  if (datos.estado !== undefined) {
    if (!ESTADOS.includes(datos.estado)) {
      throw deServicio('VALIDACION', 'El estado tiene que ser disponible o vendido', 400);
    }
    cambios.estado = datos.estado;
  }

  if (Object.keys(cambios).length === 0) {
    throw deServicio('VALIDACION', 'No hay nada que actualizar', 400);
  }

  return cambios;
}

/**
 * Edita un anuncio. Solo del autor.
 *
 * No se comprueba a mano que el anuncio sea del token: la política
 * `anuncios_update` lo exige en la base de datos, así que un anuncio ajeno
 * devuelve error de RLS y no se escribe nada. La comprobación vive en dos sitios
 * porque el `WHERE` que pone el cliente y la política son cosas distintas, y con
 * solo uno de los dos se podría escribir en la fila equivocada.
 */
async function actualizar(id, datos, { token, usuarioId } = {}) {
  exigirUuid(id);

  const cambios = validarActualizacion(datos);

  const { data, error } = await clienteConToken(token)
    .from('anuncios')
    .update(cambios)
    .eq('id', id)
    .eq('id_autor', usuarioId)
    .select(COLUMNAS)
    .maybeSingle();

  if (error) {
    throw desdeError(error, { tabla: 'anuncios' });
  }

  // Sin filas puede ser que el anuncio no exista o que sea de otro. Con el token
  // no se puede distinguir, así que se comprueba si existe.
  if (!data) {
    const existente = await cliente.from('anuncios').select('id').eq('id', id).maybeSingle();
    if (!existente.data) {
      throw deServicio('NO_ENCONTRADO', `No existe el anuncio ${id}`, 404);
    }
    throw deServicio('SIN_PERMISOS', 'Solo el autor del anuncio puede modificarlo', 403);
  }

  return aAnuncio(data);
}

/** Marca un anuncio como vendido o disponible. */
async function cambiarEstado(id, estado, contexto) {
  return actualizar(id, { estado }, contexto);
}

/**
 * Borra un anuncio. Solo del autor, por la misma política de RLS.
 *
 * Una fila que RLS filtra no se puede borrar, así que después del `delete` se
 * comprueba si el anuncio existía para poder decir 404 en vez de 403 sin regalar
 * información: si no existe no hay fila que borrar y si existe pero es de otro,
 * borrar no hace nada.
 */
async function eliminar(id, { token, usuarioId } = {}) {
  exigirUuid(id);

  const { error } = await clienteConToken(token)
    .from('anuncios')
    .delete()
    .eq('id', id)
    .eq('id_autor', usuarioId);

  if (error) {
    throw desdeError(error, { tabla: 'anuncios' });
  }

  const { data } = await cliente.from('anuncios').select('id').eq('id', id).maybeSingle();

  if (data) {
    // Sigue ahí: o no era de este usuario, o RLS bloqueó el borrado.
    throw deServicio('SIN_PERMISOS', 'Solo el autor del anuncio puede eliminarlo', 403);
  }

  return { eliminado: true };
}

/**
 * Lista los anuncios de un autor, con los mismos filtros y paginación que
 * `listar`.
 *
 * Es una ruta pública en el backend propio (`/usuarios/:id/anuncios`), y aquí
 * también lo es: el filtro va sobre `id_autor`, que es una columna, no sobre un
 * JWT, así que no hace falta sesión y RLS se encarga de no filtrar nada.
 */
async function listarPorAutor({ idAutor, pagina, limite, ...filtros } = {}) {
  if (!idAutor) {
    throw deServicio('VALIDACION', 'Falta el autor de los anuncios', 400);
  }
  exigirUuid(idAutor, 'el id del autor');

  // La paginación va en el mismo objeto que los filtros, como en `listar`. Con un
  // argumento aparte era fácil dejar `pagina` y `limite` dentro de los filtros y
  // que se ignoraran en silencio, devolviendo siempre la página de 20.
  const pag = leerPaginacion({ pagina, limite });

  const { desde, hasta } = pag;
  const [total, { data, error }] = await Promise.all([
    contar(
      aplicarFiltros(cliente.from('anuncios').select('id', { count: 'exact', head: true }), filtros).eq(
        'id_autor',
        idAutor
      )
    ),
    aplicarFiltros(cliente.from('anuncios').select(COLUMNAS), filtros)
      .eq('id_autor', idAutor)
      .range(desde, hasta)
  ]);

  if (error) {
    throw desdeError(error, { tabla: 'anuncios' });
  }

  return respuestaPaginada(data.map(aAnuncio), pag, total);
}

module.exports = {
  listar,
  listarPorAutor,
  obtener,
  crear,
  actualizar,
  cambiarEstado,
  eliminar,
  validarNuevo,
  validarActualizacion,
  ESTADOS
};