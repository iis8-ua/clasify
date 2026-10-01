'use strict';

const express = require('express');
const { Router } = express;
const anuncioService = require('../services/anuncioService');
const favoritoService = require('../services/favoritoService');
const conversacionService = require('../services/conversacionService');
const mensajeService = require('../services/mensajeService');
const { autenticar, autenticarSiHayToken } = require('../middleware/auth');
const { subirImagen } = require('../middleware/subidaImagen');
const { leerPaginacion } = require('../helpers/paginacion');
const {
  validarNuevoAnuncio,
  validarActualizacionAnuncio,
  validarCambioEstado,
  validarFiltrosAnuncios,
  validarMensaje,
  validarDesde,
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

// El detalle es público, así que el token es opcional: si viene y su usuario
// participa en alguna conversación del anuncio, se le añade su `conversacion`.
// Sin token, o con uno que no se pueda verificar, el anuncio se sirve igual.
router.get('/:id', autenticarSiHayToken, async (req, res) => {
  const id = validarId(req.params.id);
  const anuncio = await anuncioService.detalle(id);

  if (req.usuario) {
    const conversacion = await conversacionService.deParticipante(id, req.usuario.id);
    if (conversacion) {
      anuncio.conversacion = { id: conversacion.id };
    }
  }

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
// usuario y está en `routes/usuarios.js`. Los mensajes reparten igual: los del
// anuncio aquí, los de una conversación en `routes/conversaciones.js` y la
// bandeja en `routes/usuarios.js`.
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

// Inicia la conversación con el vendedor y manda el primer mensaje. 201 si la
// conversación se acaba de crear, 200 si ya existía, con la misma forma en los
// dos casos.
router.post('/:id/mensajes', autenticar, async (req, res) => {
  const id = validarId(req.params.id);
  const { texto } = validarMensaje(req.body);
  const { nueva, conversacion } = await conversacionService.iniciar(id, req.usuario.id);
  const mensaje = await mensajeService.enviar(conversacion.id, req.usuario.id, texto);

  res.status(nueva ? 201 : 200).json({ datos: { conversacion, mensaje } });
});

// Los mensajes del comprador con el vendedor de este anuncio. El vendedor
// recibe un 400 con la ruta donde están las suyas, porque puede tener varias.
router.get('/:id/mensajes', autenticar, async (req, res) => {
  const id = validarId(req.params.id);
  const conversacion = await conversacionService.deComprador(id, req.usuario.id);
  const mensajes = await mensajeService.listar(conversacion, req.usuario.id, leerPaginacion(req.query), {
    desde: validarDesde(req.query)
  });

  res.status(200).json(mensajes);
});

module.exports = router;
