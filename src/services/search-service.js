const { getCatalog } = require('../data/catalog');
const { loadEmbeddings } = require('../data/embeddings');
const { calculateLexicalScore, cosineSimilarity, createEmbedding } = require('./embedding-service');
const {
  buildSearchQuery,
  normalizeKeywords,
  scoreToPercent,
  tokenizeSearchTerms,
} = require('../text-utils');

// Servicio de busqueda: orquesta la busqueda semantica/textual por embeddings y devuelve
// resultados ya mapeados a los textos oficiales del catalogo PRD.

// Ejecuta la busqueda completa para la API: rankea por embeddings y reemplaza los datos
// con los del catalogo oficial, devolviendo el contrato que consume el frontend.
async function search(query, topK) {
  const catalog = getCatalog();
  const catalogById = new Map(catalog.map(item => [String(item.id), item]));
  const { searchQuery, resultados } = await searchWithEmbeddings(query, topK);

  const mapeados = resultados
    .map(item => normalizeEmbeddingResult(item, catalogById))
    .filter(Boolean)
    .slice(0, topK);

  return {
    query,
    searchQuery,
    resultados: mapeados,
    total: mapeados.length,
  };
}

// Busca los tramites mas cercanos semanticamente a la consulta usando embeddings precalculados.
async function searchWithEmbeddings(query, topK) {
  const records = loadEmbeddings();
  const searchQuery = buildSearchQuery(query);
  const queryEmbedding = await createEmbedding(searchQuery);
  const queryTerms = tokenizeSearchTerms(query);

  const resultados = records
    .filter(item => item.embedding.length === queryEmbedding.length)
    .map(item => {
      const semanticScore = cosineSimilarity(queryEmbedding, item.embedding, item.norm);
      const lexicalScore = calculateLexicalScore(queryTerms, item);

      return {
        id: item.id,
        nombre: item.nombre,
        descripcion: item.descripcion,
        keywords: item.keywords,
        score: Math.max(semanticScore, lexicalScore),
        semanticScore,
        lexicalScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { query, searchQuery, resultados };
}

// Reemplaza datos devueltos por embeddings con los textos oficiales del catalogo PRD.
function normalizeEmbeddingResult(result, catalogById) {
  const catalogItem = catalogById.get(String(result.id));
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
  normalizeEmbeddingResult,
  search,
  searchWithEmbeddings,
};
