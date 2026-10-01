'use strict';

/**
 * Punto de entrada de la capa de servicios.
 *
 * El enunciado pide una capa de servicios, no un servidor HTTP: aquí no hay
 * Express ni rutas, solo funciones. Quien la use (un frontend, otro backend o los
 * propios tests) importa los servicios y los llama.
 */

const authService = require('./services/authService');
const perfilService = require('./services/perfilService');
const anuncioService = require('./services/anuncioService');
const categoriaService = require('./services/categoriaService');
const { ErrorDeServicio } = require('./errors/ErrorDeServicio');

module.exports = {
  authService,
  perfilService,
  anuncioService,
  categoriaService,
  ErrorDeServicio
};