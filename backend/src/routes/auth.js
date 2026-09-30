'use strict';

const express = require('express');
const { Router } = express;
const authService = require('../services/authService');
const { autenticar } = require('../middleware/auth');
const { validarRegistro, validarLogin } = require('../middleware/validar');
const { ApiError } = require('../errors/ApiError');

const router = Router();

router.post('/register', async (req, res) => {
  const datos = validarRegistro(req.body);
  const usuario = await authService.registrar(datos);
  res.status(201).json({
    datos: {
      token: authService.firmarToken(usuario),
      usuario: authService.projectionPrivada(usuario)
    }
  });
});

router.post('/login', async (req, res) => {
  const datos = validarLogin(req.body);
  const usuario = await authService.autenticar(datos);
  res.status(200).json({
    datos: {
      token: authService.firmarToken(usuario),
      usuario: authService.projectionPrivada(usuario)
    }
  });
});

router.get('/yo', autenticar, async (req, res) => {
  const usuario = await authService.buscarPorId(req.usuario.id);
  if (!usuario) {
    throw ApiError.noAutorizado('USUARIO_NO_EXISTE', 'El usuario del token ya no existe');
  }
  res.status(200).json({ datos: { usuario: authService.projectionPrivada(usuario) } });
});

module.exports = router;
