'use strict';

/**
 * Crea las bases de datos de Clasify si no existen.
 *   node src/db/create-databases.js
 *
 * Necesita un usuario MySQL con permiso CREATE. Luego se ejecuta:
 *   npm run db:schema
 *   npm run db:seed
 */
const mysql = require('mysql2/promise');
const { db } = require('../config');

const bases = [db.base, db.nombreBaseTest];

async function main() {
  const conexion = await mysql.createConnection({
    host: db.host,
    port: db.puerto,
    user: db.usuario,
    password: db.contrasena,
    multipleStatements: true
  });

  for (const nombre of bases) {
    if (!/^[A-Za-z0-9_]+$/.test(nombre)) {
      throw new Error(`Nombre de base de datos no válido: ${nombre}`);
    }
    await conexion.query(
      `CREATE DATABASE IF NOT EXISTS \`${nombre}\` ` +
        'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    console.log(`Base de datos lista: ${nombre}`);
  }

  await conexion.end();
}

main().catch((error) => {
  console.error('Error al crear las bases de datos:', error.message);
  process.exit(1);
});
