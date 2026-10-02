'use strict';

const mysql = require('mysql2/promise');
const { db } = require('../config');

const pool = mysql.createPool({
  host: db.host,
  port: db.puerto,
  user: db.usuario,
  password: db.contrasena,
  database: db.base,
  waitForConnections: true,
  connectionLimit: db.conexiones,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z'
});

/**
 * Ejecuta una consulta y devuelve las filas.
 * @param {string} sql
 * @param {Array<any>} [parametros]
 */
async function consultar(sql, parametros = []) {
  const [filas] = await pool.execute(sql, parametros);
  return filas;
}

/**
 * Ejecuta una consulta de escritura y devuelve el encabezado de resultado.
 * @param {string} sql
 * @param {Array<any>} [parametros]
 */
async function ejecutar(sql, parametros = []) {
  const [resultado] = await pool.execute(sql, parametros);
  return resultado;
}

module.exports = { pool, consultar, ejecutar };
