'use strict';

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

/**
 * Prepara la base de datos de pruebas: crea el esquema y deja las tablas
 * limpias antes de cada prueba.
 */
async function prepararBaseDePruebas() {
  const { db } = require('../src/config');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf8');

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
}

async function limpiarTablas() {
  const { pool } = require('../src/db/pool');
  const conexion = await pool.getConnection();

  try {
    await conexion.query('SET FOREIGN_KEY_CHECKS = 0');
    // La lista está escrita a mano, así que **cada tabla nueva tiene que añadirse
    // aquí**. Si se olvida, sus filas se cuelan de un test al siguiente y la suite
    // pasa con datos de otro test, que es la forma más difícil de detectar que hay.
    for (const tabla of [
      'valoraciones',
      'mensajes',
      'conversaciones',
      'favoritos',
      'anuncios',
      'usuarios',
      'categorias'
    ]) {
      await conexion.query(`TRUNCATE TABLE ${tabla}`);
    }
    await conexion.query('SET FOREIGN_KEY_CHECKS = 1');
    await conexion.query('INSERT INTO categorias (nombre) VALUES (?)', ['Electrónica']);
  } finally {
    conexion.release();
  }
}

module.exports = { prepararBaseDePruebas, limpiarTablas };
