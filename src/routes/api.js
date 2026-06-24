const path = require('path');
const express = require('express');
const config = require('../config');
const { clamp } = require('../text-utils');
const { getCatalog } = require('../data/catalog');
const { search } = require('../services/search-service');
const { findProcedureWithGemini } = require('../services/gemini-service');

// Capa de rutas HTTP. Los controladores son delgados: validan la entrada y delegan
// toda la logica en los servicios.

const router = express.Router();

// Expone una URL limpia para la vista de produccion sin etiquetas de testing.
router.get('/produccion', (_req, res) => {
  res.sendFile(path.join(config.publicDir, 'production', 'index.html'));
});

// Devuelve el catalogo normalizado para que el navegador construya el indice Fuse.js.
router.get('/api/catalog', (_req, res) => {
  const catalog = getCatalog();
  res.json({ tramites: catalog, total: catalog.length });
});

// Ejecuta busqueda semantica pura por embeddings y devuelve resultados ordenados por score.
router.post('/api/search', async (req, res) => {
  const { q, top_k: requestedTopK } = req.body || {};

  if (!q) {
    return res.status(400).json({ error: 'Se requiere q' });
  }

  const query = String(q).slice(0, config.maxQueryLength);
  const topK = clamp(Number(requestedTopK) || 15, 1, config.maxEmbeddingCandidates);

  try {
    res.json(await search(query, topK));
  } catch (error) {
    res.status(503).json({
      error: 'No se pudo ejecutar la busqueda por embeddings',
      detail: error.message,
    });
  }
});

// Consulta Gemini con candidatos ya filtrados por Fuse.js y/o embeddings.
router.post('/api/ai', async (req, res) => {
  const { q, candidatos } = req.body || {};

  if (!q || !Array.isArray(candidatos) || candidatos.length === 0) {
    return res.status(400).json({ error: 'Se requiere q y candidatos[]' });
  }

  const query = String(q).slice(0, config.maxQueryLength);
  const candidates = candidatos.slice(0, config.maxAiCandidates);

  try {
    res.json(await findProcedureWithGemini(query, candidates));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
