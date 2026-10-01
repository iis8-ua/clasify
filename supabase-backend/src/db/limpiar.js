'use strict';

/**
 * Deja el proyecto Supabase como estaba antes de los tests.
 *
 * Hace falta `pg` y el Session pooler, porque la API de Supabase con la clave
 * publicable no puede borrar usuarios de `auth.users`: eso es cosa de
 * `service_role` o de la conexión directa a Postgres.
 *
 * **Borra usuarios de verdad.** Se ejecuta a mano, no en un `globalSetup` de
 * Jest, para que nadie borre el proyecto por accidente pensando que es un
 * `TRUNCATE` de una base de pruebas. Si el proyecto no es el de pruebas, no lo
 * ejecutes.
 */

const { Client } = require('pg');
const config = require('../config');

const SQL = `
  DELETE FROM auth.users;
  TRUNCATE public.anuncios, public.perfiles RESTART IDENTITY CASCADE;
`;

async function main() {
  if (!config.urlBaseDeDatos) {
    console.error(
      'Falta SUPABASE_DB_URL en el .env.\n' +
        'Es la Connection string (URI) de la pestaña SESSION POOLER de Project Settings -> Database.'
    );
    process.exitCode = 1;
    return;
  }

  if (!process.argv.includes('--confirmar')) {
    console.log('Esto borra TODOS los usuarios y anuncios del proyecto.');
    console.log('Si el .env apunta al proyecto bueno, no lo ejecutes.');
    console.log('Para ejecutarlo de verdad, añade --confirmar:');
    console.log('  npm run db:limpiar -- --confirmar');
    return;
  }

  const conexion = new Client({ connectionString: config.urlBaseDeDatos });

  try {
    await conexion.connect();
    await conexion.query(SQL);
    console.log('Limpieza hecha: sin usuarios, sin perfiles y sin anuncios.');
  } catch (error) {
    console.error(`No se pudo limpiar: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await conexion.end();
  }
}

main();