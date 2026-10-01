'use strict';

const { cliente, clienteConToken } = require('../supabase/cliente');
const { desdeError, deServicio } = require('../errors/ErrorDeServicio');
const perfilService = require('./perfilService');

const LONGITUD_MINIMA_CONTRASENA = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarRegistro({ email, contrasena, nombre }) {
  if (!email || !EMAIL_RE.test(String(email))) {
    throw deServicio('VALIDACION', 'El email no tiene un formato válido', 400);
  }
  if (!nombre || !String(nombre).trim()) {
    throw deServicio('VALIDACION', 'El nombre es obligatorio', 400);
  }
  if (!contrasena || String(contrasena).length < LONGITUD_MINIMA_CONTRASENA) {
    throw deServicio(
      'VALIDACION',
      `La contraseña tiene que tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`,
      400
    );
  }

  return {
    email: String(email).trim().toLowerCase(),
    contrasena: String(contrasena),
    nombre: String(nombre).trim()
  };
}

/**
 * Registra un usuario.
 *
 * La fila de `perfiles` la crea el trigger `trg_crear_perfil` de la migración,
 * que salta al insertarse en `auth.users`. Si la crease este servicio haría
 * falta una política de INSERT en `perfiles` y el resultado dependería de que
 * Supabase Auth ya hubiera emitido un token en ese momento.
 *
 * El nombre se pone **después** del registro, con una segunda llamada, y no en el
 * `signUp`. La razón es concreta: la versión de GoTrue de este proyecto descarta
 * las claves propias en `raw_user_meta_data` al registrarse, dejando solo
 * `sub`, `email`, `email_verified` y `phone_verified`. El trigger lee el nombre de
 * ahí, así que si se mandara en el `data` del `signUp` el perfil se crearía con el
 * nombre vacío. Comprobado contra el proyecto: `user_metadata` vuelve sin `nombre`
 * y con `updateUser` sí se guarda.
 *
 * El `data` del `signUp` se manda igualmente porque es donde debe ir el nombre y
 * en otras versiones de GoTrue funciona; el nombre que manda es el que escribe la
 * segunda llamada.
 */
async function registro(datos) {
  const { email, contrasena, nombre } = validarRegistro(datos);

  const { data, error } = await cliente.auth.signUp({
    email,
    password: contrasena,
    data: { nombre }
  });

  if (error) {
    throw desdeError(error);
  }

  // Sin sesión solo pasa cuando el proyecto tiene la confirmación de email
  // activada. Se avisa con un error propio para que no parezca un fallo.
  if (!data.session) {
    throw deServicio(
      'EMAIL_NO_CONFIRMADO',
      'El registro se creó pero el proyecto pide confirmar el email, así que no hay sesión todavía',
      400
    );
  }

  const token = data.session.access_token;

  // El trigger ya ha creado el perfil; aquí solo se rellena el nombre. Si esto
  // fallara, el usuario quedaría con el nombre vacío, así que no se ignora.
  await perfilService.actualizarPerfil(
    { nombre },
    { token, usuarioId: data.user.id }
  );

  return {
    token,
    usuario: {
      id: data.user.id,
      email: data.user.email,
      nombre
    }
  };
}

/**
 * Inicia sesión con email y contraseña.
 *
 * Supabase devuelve `invalid_credentials` tanto si el email no existe como si
 * la contraseña no es la buena, que es justo lo que se quiere: no hay que
 * filtrar qué emails están dados de alta.
 *
 * El nombre **no** se devuelve. Vive en `perfiles.nombre`, no en el JWT: en este
 * proyecto GoTrue descarta las claves propias al registrarse, así que
 * `user_metadata` no lo trae, y aunque lo trajera el token se quedaría congelado
 * con el valor que tenía al emitirse. Quien quiera el nombre, `perfilService`.
 */
async function login(email, contrasena) {
  if (!email || !contrasena) {
    throw deServicio('VALIDACION', 'El email y la contraseña son obligatorios', 400);
  }

  const { data, error } = await cliente.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password: String(contrasena)
  });

  if (error) {
    throw desdeError(error);
  }

  return {
    token: data.session.access_token,
    usuario: {
      id: data.user.id,
      email: data.user.email
    }
  };
}

/**
 * Cierra la sesión de una sesión concreta.
 *
 * `signOut` de por sí solo borra la sesión del cliente que lo llama, así que
 * necesita el cliente del usuario y su token. Si el token ya caducó, Supabase
 * devuelve 401 aunque para el usuario la sesión esté cerrada igualmente: eso se
 * trata como cierre correcto.
 */
async function logout(token) {
  const { error } = await clienteConToken(token).auth.signOut();

  if (error && error.status !== 401) {
    throw desdeError(error);
  }

  return { cerrada: true };
}

/**
 * Valida un token y devuelve lo que lleva dentro.
 *
 * No se usa `getUser`, que hace una llamada a la red al servidor de Auth, sino
 * `getClaims`, que valida la firma en local contra la clave pública del proyecto.
 *
 * El token hay que pasárselo como argumento. `getClaims()` sin argumentos usa la
 * sesión que el cliente tenga guardada, y como `clienteConToken` no guarda
 * ninguna (solo pone la cabecera `Authorization`), sin argumento no validaría
 * nada y daría error con cualquier token bueno.
 */
async function usuarioDelToken(token) {
  if (!token) {
    throw deServicio('SIN_TOKEN', 'Falta el token', 401);
  }

  const { data, error } = await clienteConToken(token).auth.getClaims(token);

  // Un token caducado o manipulado viene con un error de Supabase sin `code`
  // reconocible, así que se distingue por el motivo: si no hay `sub` es que el
  // token no valida, no que Supabase haya fallado por otra cosa.
  if (!data?.claims?.sub) {
    throw deServicio(
      'TOKEN_INVALIDO',
      'El token no es válido o ha caducado',
      401,
      error?.msg || null
    );
  }

  return {
    id: data.claims.sub,
    email: data.claims.email || null
  };
}

module.exports = { registro, login, logout, usuarioDelToken };