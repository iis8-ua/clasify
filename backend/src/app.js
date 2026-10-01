'use strict';

const path = require('node:path');
const express = require('express');
const { noEncontrado, manejadorDeErrores } = require('./middleware/errores');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/clasify_api/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/clasify_api/salud', (req, res) => {
  res.status(200).json({ datos: { estado: 'ok' } });
});

app.use('/clasify_api/auth', require('./routes/auth'));
app.use('/clasify_api/usuarios', require('./routes/usuarios'));
app.use('/clasify_api/categorias', require('./routes/categorias'));
app.use('/clasify_api/anuncios', require('./routes/anuncios'));
app.use('/clasify_api/conversaciones', require('./routes/conversaciones'));

app.use(noEncontrado);
app.use(manejadorDeErrores);

module.exports = app;
