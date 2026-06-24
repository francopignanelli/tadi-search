require('dotenv').config();

const express = require('express');
const config = require('./src/config');
const apiRoutes = require('./src/routes/api');
const { getCatalog } = require('./src/data/catalog');

// Punto de entrada: arma la app Express, monta middleware y rutas, y levanta el servidor.

const app = express();

app.use(express.json({ limit: '256kb' }));
app.use(express.static(config.publicDir));
app.use('/shared', express.static(config.sharedDir));
app.use('/', apiRoutes);

// Inicia el servidor y precarga el catalogo para detectar errores de datos al arrancar.
app.listen(config.port, () => {
  const total = getCatalog().length;
  console.log(`[tadi-search] ${total} tramites cargados`);
  console.log(`[tadi-search] http://localhost:${config.port}`);
});
