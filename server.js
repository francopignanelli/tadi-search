require('dotenv').config();

const express = require('express');
const path = require('path');
const { getCatalog, normalizeEmbeddingResult } = require('./src/catalog');
const { findProcedureWithGemini } = require('./src/gemini-service');
const { searchWithEmbeddings } = require('./src/semantic-search');
const { clamp } = require('./src/text-utils');

const app = express();

const PORT = Number(process.env.PORT || 3002);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_QUERY_LENGTH = 300;

// Tope de seguridad del backend para /api/search.
// La cantidad real pedida desde la UI se cambia en public/js/app.js -> SEARCH_CONFIG.embeddingVisibleLimit.
const MAX_EMBEDDING_CANDIDATES = 50;

// Tope de seguridad del backend para /api/ai.
// La cantidad real enviada desde la UI se cambia en public/js/app.js -> SEARCH_CONFIG.aiCandidatesSentLimit.
const MAX_AI_CANDIDATES = 50;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(PUBLIC_DIR));

// Expone una URL limpia para la vista de produccion sin etiquetas de testing.
app.get('/produccion', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'production', 'index.html'));
});

// Devuelve el catalogo normalizado para que el navegador construya el indice Fuse.js.
app.get('/api/catalog', (_req, res) => {
  const catalog = getCatalog();
  res.json({ tramites: catalog, total: catalog.length });
});

// Ejecuta busqueda semantica pura por embeddings y devuelve resultados ordenados por score.
app.post('/api/search', async (req, res) => {
  const { q, top_k: requestedTopK } = req.body || {};

  if (!q) {
    return res.status(400).json({ error: 'Se requiere q' });
  }

  const query = String(q).slice(0, MAX_QUERY_LENGTH);
  const topK = clamp(Number(requestedTopK) || 15, 1, MAX_EMBEDDING_CANDIDATES);

  try {
    const catalog = getCatalog();
    const catalogById = new Map(catalog.map(item => [String(item.id), item]));
    const search = await searchWithEmbeddings(query, topK);
    const resultados = (search.resultados || [])
      .map(item => normalizeEmbeddingResult(item, catalogById))
      .filter(Boolean)
      .slice(0, topK);

    res.json({
      query,
      searchQuery: search.searchQuery || query,
      resultados,
      total: resultados.length,
    });
  } catch (error) {
    res.status(503).json({
      error: 'No se pudo ejecutar la busqueda por embeddings',
      detail: error.message,
    });
  }
});

// Consulta Gemini con candidatos ya filtrados por Fuse.js y/o embeddings.
app.post('/api/ai', async (req, res) => {
  const { q, candidatos } = req.body || {};

  if (!q || !Array.isArray(candidatos) || candidatos.length === 0) {
    return res.status(400).json({ error: 'Se requiere q y candidatos[]' });
  }

  const query = String(q).slice(0, MAX_QUERY_LENGTH);
  const candidates = candidatos.slice(0, MAX_AI_CANDIDATES);

  try {
    res.json(await findProcedureWithGemini(query, candidates));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicia el servidor y precarga el catalogo para detectar errores de datos al arrancar.
app.listen(PORT, () => {
  const total = getCatalog().length;
  console.log(`[tadi-search] ${total} tramites cargados`);
  console.log(`[tadi-search] http://localhost:${PORT}`);
});
