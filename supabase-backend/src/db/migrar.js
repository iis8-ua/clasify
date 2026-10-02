'use strict';

/**
 * Aplica los ficheros de `migrations/` en orden, por nombre, **una vez cada uno**.
 *
 * Hace falta `pg` y el string del **Session pooler**, no el de la conexión
 * directa: `db.<ref>.supabase.co` solo resuelve a IPv6 y desde una red sin IPv6 no
 * hay forma de llegar. El código de la aplicación no usa nada de esto.
 *
 * El control de qué se ha aplicado está en la tabla `schema_migrations`. Sin él
 * el script re-aplicaba todo en cada ejecución, y la segunda petaba: `ADD
 * COLUMN` sin `IF NOT EXISTS` falla porque la columna ya existe. Además, sin ese
 * registro no hay forma de saber qué migración ha roto el proyecto por la
 * mitad.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../config');

const CARPETA = path.join(__dirname, '..', '..', 'migrations');

const CREAR_REGISTRO = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    nombre     text PRIMARY KEY,
    aplicada_en timestamptz NOT NULL DEFAULT now()
  )
`;

/**
 * Los permisos por defecto del proyecto hacen que `anon` pueda leer lo que se
 * cree en `public`, así que la tabla de control de migraciones quedaba accesible
 * desde fuera con solo la clave anónima. No guarda nada secreto (son nombres de
 * fichero), pero es una tabla interna y se cierra. Es aquí, y no en una
 * migración, porque es este script quien la crea.
 */
const CERRAR_REGISTRO = `
  REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC, anon, authenticated
`;

async function aplicadas(conexion) {
  const { rows } = await conexion.query(
    'SELECT nombre FROM public.schema_migrations ORDER BY nombre'
  );
  return new Set(rows.map((f) => f.nombre));
}

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

  try {
    await conexion.query(CREAR_REGISTRO);
    await conexion.query(CERRAR_REGISTRO);
  } catch (error) {
    console.error(`No se pudo preparar schema_migrations: ${error.message}`);
    process.exitCode = 1;
    await conexion.end();
    return;
  }

  const yaAplicadas = await aplicadas(conexion);
  let nuevas = 0;
  let fallo = null;

  for (const fichero of ficheros) {
    if (yaAplicadas.has(fichero)) {
      console.log(`--  ${fichero} (ya aplicada)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(CARPETA, fichero), 'utf8');

    // Cada migración va en su transacción: o se anota como aplicada o no se anota
    // nada. Un fallo a medias deja el proyecto como estaba antes.
    try {
      await conexion.query('BEGIN');
      await conexion.query(sql);
      await conexion.query('INSERT INTO public.schema_migrations (nombre) VALUES ($1)', [
        fichero
      ]);
      await conexion.query('COMMIT');
      console.log(`OK  ${fichero}`);
      nuevas += 1;
    } catch (error) {
      await conexion.query('ROLLBACK').catch(() => {});
      console.error(`FALLO  ${fichero}: ${error.message}`);
      fallo = fichero;
      process.exitCode = 1;
      break;
    }
  }

  if (!fallo && nuevas === 0) {
    console.log('\nNo había nada que aplicar.');
  }

  await conexion.end();
}

main();