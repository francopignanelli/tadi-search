const config = require('../config');
const { readJsonCached } = require('./json-store');
const { cleanText, normalizeKeywords } = require('../text-utils');

// Repositorio de la base vectorizada: lee data/embeddings_tramites.json, descarta
// registros invalidos y precalcula la norma de cada vector para la similitud coseno.
// La cache se invalida por mtime, asi que regenerar el archivo no exige reiniciar.

// Devuelve los embeddings normalizados y listos para comparar.
function loadEmbeddings() {
  return readJsonCached(config.embeddingsPath, normalizeEmbeddings);
}

// Normaliza cada registro y agrega su norma; descarta los que no tienen vector util.
function normalizeEmbeddings(rawEmbeddings) {
  if (!Array.isArray(rawEmbeddings)) return [];

  return rawEmbeddings
    .map(item => ({
      id: item.id,
      nombre: cleanText(item.nombre),
      descripcion: cleanText(item.descripcion),
      keywords: normalizeKeywords(item.keywords),
      embedding: Array.isArray(item.embedding) ? item.embedding.map(Number) : [],
    }))
    .filter(item => item.id !== undefined && item.id !== null && item.embedding.length)
    .map(item => ({ ...item, norm: vectorNorm(item.embedding) }))
    .filter(item => item.norm > 0);
}

// Calcula la norma de un vector para reutilizarla en la similitud coseno.
function vectorNorm(values) {
  return Math.sqrt(values.reduce((total, value) => total + ((Number(value) || 0) ** 2), 0));
}

module.exports = {
  loadEmbeddings,
  normalizeEmbeddings,
  vectorNorm,
};
