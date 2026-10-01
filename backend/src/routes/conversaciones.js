'use strict';

const express = require('express');
const { Router } = express;
const conversacionService = require('../services/conversacionService');
const mensajeService = require('../services/mensajeService');
const { autenticar } = require('../middleware/auth');
const { leerPaginacion } = require('../helpers/paginacion');
const { validarMensaje, validarDesde, validarId } = require('../middleware/validar');

/**
 * Rutas de una conversación concreta. Solo las usan los dos participantes: la
 * comprobación vive en `conversacionService.exigirParticipante`, que devuelve
 * 404 si la conversación no existe y 403 si existe pero el usuario no participa.
 * El vendedor llega aquí desde `/usuarios/me/conversaciones`, donde tiene todas
 * las suyas; el comprador, desde el anuncio.
 */
const router = Router();

router.get('/:id/mensajes', autenticar, async (req, res) => {
  const id = validarId(req.params.id);
  const conversacion = await conversacionService.exigirParticipante(id, req.usuario.id);
  const mensajes = await mensajeService.listar(conversacion, req.usuario.id, leerPaginacion(req.query), {
    desde: validarDesde(req.query)
  });

  res.status(200).json(mensajes);
});

router.post('/:id/mensajes', autenticar, async (req, res) => {
  const id = validarId(req.params.id);
  const { texto } = validarMensaje(req.body);
  const conversacion = await conversacionService.exigirParticipante(id, req.usuario.id);
  const mensaje = await mensajeService.enviar(id, req.usuario.id, texto);

  res.status(201).json({ datos: { mensaje } });
});

module.exports = router;
