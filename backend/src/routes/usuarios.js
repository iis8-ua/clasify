'use strict';

const express = require('express');
const { Router } = express;
const usuarioService = require('../services/usuarioService');
const favoritoService = require('../services/favoritoService');
const conversacionService = require('../services/conversacionService');
const valoracionService = require('../services/valoracionService');
const { autenticar, autenticarSiHayToken } = require('../middleware/auth');
const { leerPaginacion } = require('../helpers/paginacion');
const {
  validarActualizacionPerfil,
  validarValoracion,
  validarId
} = require('../middleware/validar');

const router = Router();

// Las rutas con "me" van antes que "/:id": si no, Express leería "me" como un id.
// "/me/valoraciones" y "/:id/valoraciones" tienen exactamente la misma forma, así
// que el orden aquí no es solo una costumbre, es lo que las distingue.
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

router.get('/me/favoritos', autenticar, async (req, res) => {
  res.status(200).json(await favoritoService.listar(req.usuario.id, leerPaginacion(req.query)));
});

router.get('/me/conversaciones', autenticar, async (req, res) => {
  res.status(200).json(await conversacionService.listar(req.usuario.id, leerPaginacion(req.query)));
});

router.get('/me/valoraciones', autenticar, async (req, res) => {
  res.status(200).json(
    await valoracionService.listarPropias(req.usuario.id, leerPaginacion(req.query))
  );
});

/**
 * Alta o edición de la valoración propia sobre otro usuario. Es un `PUT` y no un
 * `POST` porque repetir la acción es Actualizar, no Crear: el `nuevo` que devuelve
 * el servicio es lo que permite contestar 201 o 200 sin preguntar antes.
 */
router.put('/:id/valoracion', autenticar, async (req, res) => {
  const idValorado = validarId(req.params.id);
  const valoracion = validarValoracion(req.body);
  const resultado = await valoracionService.valorar(req.usuario.id, idValorado, valoracion);
  res.status(resultado.nuevo ? 201 : 200).json({ datos: resultado });
});

router.delete('/:id/valoracion', autenticar, async (req, res) => {
  const idValorado = validarId(req.params.id);
  await valoracionService.quitar(req.usuario.id, idValorado);
  res.status(204).send();
});

router.get('/:id/valoraciones', async (req, res) => {
  const idUsuario = validarId(req.params.id);
  res.status(200).json(await valoracionService.listar(idUsuario, leerPaginacion(req.query)));
});

router.get('/:id/anuncios', async (req, res) => {
  const id = validarId(req.params.id);
  await usuarioService.exigirUsuario(id);
  res.status(200).json(await usuarioService.listarAnuncios(id, leerPaginacion(req.query)));
});

/**
 * Perfil público. Lleva token **opcional** y no obligatorio a propósito: el
 * resumen de valoraciones siempre sale, y `mi_valoracion` solo aparece si quien
 * pregunta lleva un token válido y ya ha valorado a ese usuario. Quien no lleve
 * token recibe exactamente lo mismo que antes de que existieran las valoraciones.
 */
router.get('/:id', autenticarSiHayToken, async (req, res) => {
  const usuario = await usuarioService.perfilPublico(validarId(req.params.id));

  if (req.usuario) {
    const propias = await usuarioService.misValoracionesDe(req.usuario.id, usuario.id);
    if (propias) {
      usuario.mi_valoracion = propias;
    }
  }

  res.status(200).json({ datos: { usuario } });
});

module.exports = router;