const fs = require('fs');
const path = require('path');
const { cleanText, normalizeKeywords, scoreToPercent } = require('./text-utils');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'Listado_tramites_PRD.json');

let catalogCache;

// Lee el catalogo PRD una sola vez y reutiliza el resultado normalizado en memoria.
function getCatalog() {
  if (catalogCache) return catalogCache;

  try {
    const rawCatalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    catalogCache = normalizeCatalog(rawCatalog);
  } catch (error) {
    console.error('[tadi-search] Error leyendo data/Listado_tramites_PRD.json:', error.message);
    catalogCache = [];
  }

  return catalogCache;
}

// Convierte el JSON PRD al contrato minimo usado por frontend, embeddings e IA.
function normalizeCatalog(rawCatalog) {
  if (!Array.isArray(rawCatalog)) return [];

  return rawCatalog
    .map(item => ({
      id: item.id ?? item.ID,
      nombre: cleanText(item.nombre ?? item.NOMBRE_TRAMITE),
      descripcion: cleanText(item.descripcion ?? item.DESCRIPCION_CORTA),
      keywords: normalizeKeywords(item.keywords),
    }))
    .filter(item => item.id !== undefined && item.id !== null && item.nombre);
}

// Reemplaza datos devueltos por embeddings con los textos oficiales del catalogo PRD.
function normalizeEmbeddingResult(result, catalogById) {
  const id = result.id;
  const catalogItem = catalogById.get(String(id));
  if (!catalogItem) return null;

  const score = Number(result.score);
  const semanticScore = Number(result.semanticScore);
  const lexicalScore = Number(result.lexicalScore);

  return {
    id: catalogItem.id,
    nombre: catalogItem.nombre,
    descripcion: catalogItem.descripcion,
    keywords: normalizeKeywords(result.keywords),
    score: Number.isFinite(score) ? score : 0,
    scorePercent: scoreToPercent(score),
    semanticScore: Number.isFinite(semanticScore) ? semanticScore : null,
    lexicalScore: Number.isFinite(lexicalScore) ? lexicalScore : null,
  };
}

module.exports = {
  getCatalog,
  normalizeCatalog,
  normalizeEmbeddingResult,
};
