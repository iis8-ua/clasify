'use strict';

const app = require('./app');
const { port, db } = require('./config');
const { pool } = require('./db/pool');

async function main() {
  const conexion = await pool.getConnection();
  conexion.release();
  console.log(`Conectado a la base de datos ${db.base}`);

  const servidor = app.listen(port, () => {
    console.log(`Clasify escuchando en http://localhost:${port}/clasify_api`);
  });

  const cerrar = async (senal) => {
    console.log(`\n${senal} recibido, cerrando el servidor...`);
    servidor.closeIdleConnections();
    servidor.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => cerrar('SIGINT'));
  process.on('SIGTERM', () => cerrar('SIGTERM'));
}

main().catch((error) => {
  console.error('No se pudo arrancar el servidor:', error.message);
  process.exit(1);
});
