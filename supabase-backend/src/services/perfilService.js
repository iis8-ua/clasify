'use strict';

const { cliente, clienteConToken } = require('../supabase/cliente');
const { desdeError, deServicio } = require('../errors/ErrorDeServicio');

const LONGITUD_MAXIMA_BIOGRAFIA = 500;

/**
 * Perfil del usuario autenticado, **con su email**.
 *
 * El email está protegido con permisos de columna: `anon` y `authenticated` no
 * tienen permiso de SELECT sobre esa columna, así que `perfiles.email` sale a
 * `null` siempre. Para leerlo hay que llamar a `mi_perfil_actual()`, una función
 * `SECURITY DEFINER` que solo devuelve la fila de quien la llama y por eso no
 * puede usarse para ver el email de otro.
 *
 * El contexto es `{ token, usuarioId }`, el mismo que usan los anuncios: aquí solo
 * hace falta el token, porque la función RPC ya sabe quién llama.
 */
async function perfil({ token } = {}) {
  const { data, error } = await clienteConToken(recibirToken(token)).rpc('mi_perfil_actual');

  if (error) {
    throw desdeError(error, { tabla: 'perfiles' });
  }

  const fila = Array.isArray(data) ? data[0] : data;

  if (!fila) {
    throw deServicio('NO_ENCONTRADO', 'El perfil no existe', 404);
  }

  return {
    id: fila.id,
    email: fila.email,
    nombre: fila.nombre,
    biografia: fila.biografia,
    fecha_alta: fila.created_at
  };
}

/**
 * Perfil público de cualquier usuario: id, nombre, biografía y fecha de alta, sin
 * email. Es lo que sale al pedir un anuncio con su autor embebido.
 *
 * `perfiles` es `uuid` y los ids son del propio Supabase Auth, así que un id que
 * no existe no da error: sencillamente no devuelve filas.
 */
async function perfilPublico(usuarioId) {
  if (!usuarioId) {
    return null;
  }

  const { data, error } = await cliente
    .from('perfiles')
    .select('id, nombre, biografia, created_at')
    .eq('id', usuarioId)
    .maybeSingle();

  if (error) {
    throw desdeError(error, { tabla: 'perfiles' });
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    nombre: data.nombre,
    biografia: data.biografia,
    fecha_alta: data.created_at
  };
}

function validarBiografia(valor) {
  if (valor === undefined) {
    return undefined;
  }
  if (valor === null) {
    return null;
  }
  if (typeof valor !== 'string') {
    throw deServicio('VALIDACION', 'La biografía tiene que ser texto', 400);
  }

  const recortada = valor.trim();
  if (recortada.length > LONGITUD_MAXIMA_BIOGRAFIA) {
    throw deServicio(
      'VALIDACION',
      `La biografía no puede superar los ${LONGITUD_MAXIMA_BIOGRAFIA} caracteres`,
      400
    );
  }

  return recortada || null;
}

/**
 * Edita el perfil del usuario autenticado.
 *
 * Solo se escriben los campos que llegan, como en el `PATCH` del backend propio.
 * El email y el id no se tocan ni se pueden tocar: cambiar el email lo hace
 * Supabase Auth con su propio flujo, y el id es la identidad de la fila.
 *
 * La política `perfiles_update` ya exige `auth.uid() = id`, así que aunque se
 * mandara otro id en el cuerpo la escritura se rechazaría en la base de datos.
 */
async function actualizarPerfil(datos, { token, usuarioId } = {}) {
  // El email se comprueba antes que el resto porque es un rechazo concreto: si
  // solo llega `{ email }`, sin esta comprobación antes de "no hay nada que
  // actualizar", el mensaje que vería quien llama sería el equivocado.
  if (datos.email !== undefined) {
    throw deServicio(
      'EMAIL_NO_EDITABLE',
      'El email no se cambia desde aquí, hay que hacerlo en Supabase Auth',
      400
    );
  }

  const cambios = {};

  if (datos.nombre !== undefined) {
    if (typeof datos.nombre !== 'string' || !datos.nombre.trim()) {
      throw deServicio('VALIDACION', 'El nombre es obligatorio', 400);
    }
    cambios.nombre = datos.nombre.trim();
  }

  const bio = validarBiografia(datos.biografia);
  if (bio !== undefined) {
    cambios.biografia = bio;
  }

  if (Object.keys(cambios).length === 0) {
    throw deServicio('VALIDACION', 'No hay nada que actualizar', 400);
  }

  const clienteSesion = clienteConToken(recibirToken(token));
  const { data, error } = await clienteSesion
    .from('perfiles')
    .update(cambios)
    .eq('id', usuarioId)
    .select('id, nombre, biografia, created_at')
    .maybeSingle();

  if (error) {
    throw desdeError(error, { tabla: 'perfiles' });
  }

  // Si RLS bloquea la escritura, `update` no da error: no toca ninguna fila y
  // `maybeSingle` devuelve null. Devolver null aquí sería decir "no hay nada que
  // actualizar" cuando en realidad es "no tienes permiso", que son cosas muy
  // distintas para quien llama. Se comprueba si la fila existe.
  if (!data) {
    const existente = await cliente
      .from('perfiles')
      .select('id')
      .eq('id', usuarioId)
      .maybeSingle();

    if (!existente.data) {
      throw deServicio('NO_ENCONTRADO', 'Ese perfil no existe', 404);
    }
    throw deServicio('SIN_PERMISOS', 'Solo puedes editar tu propio perfil', 403);
  }

  return data;
}

/**
 * Saca el token del contexto y lo comprueba.
 *
 * Se pasan el token y el id del usuario por separado, en `{ token, usuarioId }`, y
 * no solo el token. Hacen falta los dos: el token es la credencial y el id es la
 * fila a la que se escribe. Si se usara un solo valor, o habría que decodificar el
 * token para sacar el id, o el mismo string acabaría haciendo las dos cosas.
 */
function recibirToken(token) {
  if (typeof token === 'string' && token) {
    return token;
  }
  throw deServicio('SIN_TOKEN', 'Falta el token', 401);
}

module.exports = { perfil, perfilPublico, actualizarPerfil };