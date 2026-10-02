'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

/**
 * Opciones comunes a las dos instancias.
 *
 * `persistSession: false` porque aquí no hay cookies ni navegador: la sesión la
 * lleva quien llama, no el cliente. Y `autoRefreshToken: false` porque nadie se
 * lo pide, así que refrescar solo generaría peticiones de más.
 */
const OPCIONES = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
};

/**
 * Cliente de Supabase con la clave publicable, sin sesión. Es el que se usa para
 * lo público: listar anuncios, buscar y leer las categorías.
 */
const cliente = createClient(config.url, config.claveAnon, OPCIONES);

/**
 * Copia del cliente con la sesión de un usuario.
 *
 * Se crea una instancia nueva en lugar de llamar a `signIn` sobre el cliente
 * compartido, porque Supabase guarda la sesión en memoria: si dos peticiones
 * llegan a la vez con usuarios distintos, compartir el cliente les cruzaría
 * el token. Crearlo por petición es barato y quita esa posibilidad de raíz.
 */
function clienteConToken(token) {
  return createClient(config.url, config.claveAnon, {
    ...OPCIONES,
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }
  });
}

module.exports = { cliente, clienteConToken };