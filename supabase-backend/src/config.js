'use strict';

require('dotenv').config();

/**
 * Configuración leída del `.env`.
 *
 * Falla al arrancar y no en la primera llamada: si `SUPABASE_URL` no está, es
 * mejor quejarse enseguida con un mensaje claro que devolver un error raro de
 * PostgREST a la primera consulta.
 */
function obligatoria(nombre) {
  const valor = process.env[nombre];

  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copia .env.example a .env y rellénala.`
    );
  }

  return valor;
}

module.exports = {
  url: obligatoria('SUPABASE_URL'),
  claveAnon: obligatoria('SUPABASE_ANON_KEY'),

  /** Solo para `npm run db:migrate` y `db:limpiar`, nunca para la aplicación. */
  urlBaseDeDatos: process.env.SUPABASE_DB_URL || null
};