'use strict';

/**
 * Aplica los ficheros de `migrations/` en orden, por nombre.
 *
 * Hace falta `pg` y el string del **Session pooler**, no el de la conexión
 * directa: `db.<ref>.supabase.co` solo resuelve a IPv6 y desde una red sin IPv6 no
 * hay forma de llegar. El código de la aplicación no usa nada de esto.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../config');

const CARPETA = path.join(__dirname, '..', '..', 'migrations');

async function main() {
  if (!config.urlBaseDeDatos) {
    console.error(
      'Falta SUPABASE_DB_URL en el .env.\n' +
        'Es la Connection string (URI) de la pestaña SESSION POOLER de Project Settings -> Database.'
    );
    process.exitCode = 1;
    return;
  }

  const ficheros = fs
    .readdirSync(CARPETA)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort();

  if (ficheros.length === 0) {
    console.log('No hay migraciones en migrations/.');
    return;
  }

  const conexion = new Client({ connectionString: config.urlBaseDeDatos });

  try {
    await conexion.connect();
  } catch (error) {
    console.error(`No se pudo conectar: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  for (const fichero of ficheros) {
    const sql = fs.readFileSync(path.join(CARPETA, fichero), 'utf8');

    try {
      await conexion.query(sql);
      console.log(`OK  ${fichero}`);
    } catch (error) {
      console.error(`FALLO  ${fichero}: ${error.message}`);
      process.exitCode = 1;
      break;
    }
  }

  await conexion.end();
}

main();