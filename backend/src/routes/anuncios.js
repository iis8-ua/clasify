'use strict';

const express = require('express');
const { Router } = express;
const anuncioService = require('../services/anuncioService');
const favoritoService = require('../services/favoritoService');
const { autenticar } = require('../middleware/auth');
const { subirImagen } = require('../middleware/subidaImagen');
const { leerPaginacion } = require('../helpers/paginacion');
const {
  validarNuevoAnuncio,
  validarActualizacionAnuncio,
  validarCambioEstado,
  validarFiltrosAnuncios,
  validarId
} = require('../middleware/validar');

const router = Router();

/** Nombre del fichero tal como lo ha guardado multer, o undefined si no hay imagen. */
function imagenSubida(req) {
  return req.file === undefined ? undefined : req.file.filename;
}

router.post('/', autenticar, subirImagen, async (req, res) => {
  const datos = validarNuevoAnuncio(req.body);
  const anuncio = await anuncioService.crear({
    ...datos,
    imagen: imagenSubida(req) ?? null,
    idAutor: req.usuario.id
  });
  res.status(201).json({ datos: { anuncio } });
});

router.get('/', async (req, res) => {
  const filtros = validarFiltrosAnuncios(req.query);
  res.status(200).json(await anuncioService.listar(filtros, leerPaginacion(req.query)));
});

router.get('/:id', async (req, res) => {
  const anuncio = await anuncioService.detalle(validarId(req.params.id));
  res.status(200).json({ datos: { anuncio } });
});

router.patch('/:id', autenticar, subirImagen, async (req, res) => {
  const id = validarId(req.params.id);
  const cambios = validarActualizacionAnuncio(req.body, { hayImagen: req.file !== undefined });
  const anuncio = await anuncioService.actualizar(id, req.usuario.id, cambios, imagenSubida(req));
  res.status(200).json({ datos: { anuncio } });
});

router.patch('/:id/estado', autenticar, async (req, res) => {
  const id = validarId(req.params.id);
  const { estado } = validarCambioEstado(req.body);
  const anuncio = await anuncioService.cambiarEstado(id, req.usuario.id, estado);
  res.status(200).json({ datos: { anuncio } });
});

router.delete('/:id', autenticar, async (req, res) => {
  const id = validarId(req.params.id);
  await anuncioService.eliminar(id, req.usuario.id);
  res.status(204).end();
});

// El favorito es un subrecurso del anuncio, así que su ruta cuelga de aquí y no
// de un `/favoritos` propio. El listado de favoritos, en cambio, cuelga del
// usuario y está en `routes/usuarios.js`.
router.post('/:id/favorito', autenticar, async (req, res) => {
  const id = validarId(req.params.id);
  const { nuevo, favorito } = await favoritoService.añadir(id, req.usuario.id);
  res.status(nuevo ? 201 : 200).json({ datos: { favorito } });
});

router.delete('/:id/favorito', autenticar, async (req, res) => {
  const id = validarId(req.params.id);
  await favoritoService.quitar(id, req.usuario.id);
  res.status(204).end();
});

module.exports = router;
