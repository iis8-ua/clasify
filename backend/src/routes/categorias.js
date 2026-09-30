'use strict';

const express = require('express');
const { Router } = express;
const categoriaService = require('../services/categoriaService');

const router = Router();

router.get('/', async (req, res) => {
  res.status(200).json({ datos: await categoriaService.listar() });
});

module.exports = router;
