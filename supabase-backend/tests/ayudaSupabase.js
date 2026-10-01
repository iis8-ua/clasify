'use strict';

const { authService, anuncioService } = require('../src');

/**
 * Utilidades para los tests contra el proyecto real de Supabase.
 *
 * Dos cosas condicionan cómo se crean los usuarios aquí:
 *
 * 1. **No se borra nada al terminar.** La clave publicable no tiene permiso para
 *    tocar `auth.users`, y meter una credencial de superusuario en los tests para
 *    no dejar datos sueltos no compensa. Para empezar de cero, a mano:
 *    `npm run db:limpiar -- --confirmar`.
 *
 * 2. **Los usuarios son unos pocos y con un propósito cada uno, no uno por test.**
 *    El plan gratis limita los registros de auth por hora (unos 30) y con un
 *    usuario por test la suite se comía el límite a mitad con
 *    `Request rate limit reached`. Cada usuario de aquí está pensado para un grupo
 *    de tests, así que la suite entera gasta cinco o seis registros en total.
 */

const DOMINIO = 'gmail.com';
const CONTRASENA = 'ClasifyPruebas1!';

/**
 * Email único por usuario.
 *
 * El dominio tiene que ser uno real: Supabase rechaza `example.com`, `ejemplo.dev`
 * y los demás dominios reservados con `email_address_invalid`. No llega ningún
 * correo porque el proyecto tiene "Confirm email" desactivado, pero un dominio
 * válido hace falta para no chocar con esa validación.
 */
function emailUnico(etiqueta = 'test') {
  const marca = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `clasify.${etiqueta}.${marca}@${DOMINIO}`;
}

/** Registra un usuario nuevo sin cachear. */
async function crearUsuario(etiqueta = 'test', nombre = 'Usuario de prueba') {
  const email = emailUnico(etiqueta);
  const { token, usuario } = await authService.registro({ email, contrasena: CONTRASENA, nombre });

  return {
    email,
    token,
    usuario,
    ...usuario,
    contexto: { token, usuarioId: usuario.id }
  };
}

/**
 * Cache de usuarios por etiqueta.
 *
 * Se guarda la **promesa**, no el resultado, para que dos tests que piden el mismo
 * usuario al mismo tiempo disparen un solo registro y no dos.
 *
 * Ojo: Jest da un registro de módulos distinto por fichero de test, así que esta
 * cache es por fichero. Los cinco usuarios de un fichero no coinciden con los de
 * otro, y por eso las pruebas de "el usuario A no toca lo del usuario B" pueden
 * usar usuarios distintos en cada fichero sinuously interferir.
 */
const cache = new Map();

async function usuarioMemorizado(etiqueta, nombre = 'Usuario de prueba') {
  if (!cache.has(etiqueta)) {
    cache.set(etiqueta, crearUsuario(etiqueta, nombre));
  }
  return cache.get(etiqueta);
}

/** Usuario de solo lectura: login, token, perfil público. No se modifica nunca. */
const usuario = (nombre = 'Usuario de prueba') => usuarioMemorizado('basico', nombre);

/**
 * Usuario para los tests que editan el perfil.
 *
 * Va aparte del de solo lectura porque esos tests le cambian el nombre y la
 * biografía, y si compartieran usuario los tests que comprueban el nombre original
 * empezarían a fallar según el orden.
 */
const usuarioEditable = () => usuarioMemorizado('editable', 'Nombre Original');

/**
 * Usuario cuya sesión se revoca.
 *
 * Tiene que ser propio: cerrar sesión no tiene vuelta atrás, así que si este
 * usuario fuera el de solo lectura, todos los tests siguientes fallarían.
 */
const usuarioRevocado = () => usuarioMemorizado('revocado', 'Usuario Revocado');

/** Los dos usuarios de las pruebas de permisos cruzados, siempre en orden [a, b]. */
async function dosUsuarios() {
  const [a, b] = await Promise.all([
    usuarioMemorizado('cross-a', 'Usuario A'),
    usuarioMemorizado('cross-b', 'Usuario B')
  ]);
  return [a, b];
}

/** Crea un anuncio con el contexto del usuario y devuelve el anuncio ya mapeado. */
async function crearAnuncio(contexto, anuncio = {}) {
  return anuncioService.crear(
    {
      titulo: 'Bicicleta de montaña',
      descripcion: 'Mountain bike talla M, poco uso.',
      precio: 250,
      id_categoria: 8,
      ...anuncio
    },
    contexto
  );
}

module.exports = {
  emailUnico,
  crearUsuario,
  usuario,
  usuarioEditable,
  usuarioRevocado,
  dosUsuarios,
  crearAnuncio,
  CONTRASENA
};