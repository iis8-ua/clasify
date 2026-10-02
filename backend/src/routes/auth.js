'use strict';

const express = require('express');
const { Router } = express;
const authService = require('../services/authService');
const usuarioService = require('../services/usuarioService');
const { autenticar } = require('../middleware/auth');
const { validarRegistro, validarLogin } = require('../middleware/validar');

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

/**
 * Usuario de la sesión. Usa `perfilPropio` y no `projectionPrivada` porque
 * `/auth/yo` devuelve el perfil entero, con biografía y con el resumen de
 * valoraciones, mientras que el registro y el login usan la proyección corta a
 * propósito: ahí el usuario es recién creado y no tiene nada que ver.
 *
 * El 401 USUARIO_NO_EXISTE lo pone ya el middleware `autenticar`, así que aquí el
 * usuario existe seguro y no hace falta volver a comprobarlo.
 */
router.get('/yo', autenticar, async (req, res) => {
  const usuario = await usuarioService.perfilPropio(req.usuario.id);
  res.status(200).json({ datos: { usuario } });
});

module.exports = router;
