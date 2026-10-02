'use strict';

const express = require('express');
const { Router } = express;
const categoriaService = require('../services/categoriaService');

const router = Router();

// Listado paginado, sin token, con el mismo formato que el resto de la API.
// Las categorías no son el recurso principal y la tabla no crece, pero se pagina
// igual para no mantener un segundo formato de respuesta ni una excepción que
// justificar. Ver `services/categoriaService.js`.
router.get('/', async (req, res) => {
  res.status(200).json(await categoriaService.listar(req.query));
});

module.exports = router;