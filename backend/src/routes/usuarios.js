'use strict';

const express = require('express');
const { Router } = express;
const usuarioService = require('../services/usuarioService');
const { autenticar } = require('../middleware/auth');
const { leerPaginacion } = require('../helpers/paginacion');
const { validarActualizacionPerfil, validarId } = require('../middleware/validar');

const router = Router();

// Las rutas con "me" van antes que "/:id": si no, Express leería "me" como un id.
router.get('/me', autenticar, async (req, res) => {
  const usuario = await usuarioService.perfilPropio(req.usuario.id);
  res.status(200).json({ datos: { usuario } });
});

router.patch('/me', autenticar, async (req, res) => {
  const cambios = validarActualizacionPerfil(req.body);
  const usuario = await usuarioService.actualizarPerfil(req.usuario.id, cambios);
  res.status(200).json({ datos: { usuario } });
});

router.get('/me/anuncios', autenticar, async (req, res) => {
  const usuario = await usuarioService.perfilPropio(req.usuario.id);
  res.status(200).json(await usuarioService.listarAnuncios(usuario.id, leerPaginacion(req.query)));
});

router.get('/:id/anuncios', async (req, res) => {
  const id = validarId(req.params.id);
  await usuarioService.exigirUsuario(id);
  res.status(200).json(await usuarioService.listarAnuncios(id, leerPaginacion(req.query)));
});

router.get('/:id', async (req, res) => {
  const usuario = await usuarioService.perfilPublico(validarId(req.params.id));
  res.status(200).json({ datos: { usuario } });
});

module.exports = router;
