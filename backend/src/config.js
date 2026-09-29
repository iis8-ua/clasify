'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const obligatorias = ['JWT_SECRET', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const faltantes = obligatorias.filter((clave) => !process.env[clave]);

if (faltantes.length > 0) {
  throw new Error(
    `Faltan variables de entorno obligatorias: ${faltantes.join(', ')}. ` +
      'Revisa backend/.env (plantilla en backend/.env.example).'
  );
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  esTest: process.env.NODE_ENV === 'test',
  jwt: {
    secreto: process.env.JWT_SECRET,
    caducidad: process.env.JWT_EXPIRES_IN || '7d'
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    puerto: Number(process.env.DB_PORT) || 3306,
    usuario: process.env.DB_USER,
    contrasena: process.env.DB_PASSWORD,
    base: process.env.DB_NAME,
    nombreBaseTest: process.env.DB_TEST_NAME || 'clasify_test',
    conexiones: Number(process.env.DB_POOL_SIZE) || 10
  }
};
