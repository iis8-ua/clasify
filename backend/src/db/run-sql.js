'use strict';

/**
 * Ejecuta un fichero .sql sobre la base de datos de desarrollo.
 *   node src/db/run-sql.js schema.sql
 *   node src/db/run-sql.js seed.sql
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { db } = require('../config');

async function main() {
  const fichero = process.argv[2];

  if (!fichero) {
    console.error('Uso: node src/db/run-sql.js <fichero.sql>');
    process.exit(1);
  }

  const ruta = path.join(__dirname, path.basename(fichero));
  const sql = await fs.readFile(ruta, 'utf8');

  const conexion = await mysql.createConnection({
    host: db.host,
    port: db.puerto,
    user: db.usuario,
    password: db.contrasena,
    database: db.base,
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  await conexion.query(sql);
  await conexion.end();

  console.log(`Ejecutado ${path.basename(ruta)} sobre ${db.base}`);
}

main().catch((error) => {
  console.error('Error al ejecutar el script SQL:', error.message);
  process.exit(1);
});
