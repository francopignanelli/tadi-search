const fs = require('fs');
const path = require('path');
const {
  buildSearchQuery,
  cleanText,
  normalizeForSearch,
  normalizeKeywords,
  tokenizeSearchTerms,
} = require('./text-utils');

const MODEL_ID = process.env.EMBEDDING_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const EMBEDDINGS_PATH = path.join(__dirname, '..', 'data', 'embeddings_tramites.json');

let extractorPromise;
let embeddingsCache;

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

// Genera el vector numerico de un texto usando el modelo local de Hugging Face.
async function createEmbedding(text) {
  const extractor = await getExtractor();
  const output = await extractor(cleanText(text), {
    pooling: 'mean',
    normalize: true,
  });

  return Array.from(output.data || []);
}

// Lee la base vectorizada desde disco y la cachea en memoria junto con la norma de cada vector.
function loadEmbeddings() {
  if (embeddingsCache) return embeddingsCache;

  const raw = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, 'utf8'));
  embeddingsCache = raw
    .map(item => ({
      id: item.id,
      nombre: cleanText(item.nombre),
      descripcion: cleanText(item.descripcion),
      keywords: normalizeKeywords(item.keywords),
      embedding: Array.isArray(item.embedding) ? item.embedding.map(Number) : [],
    }))
    .filter(item => item.id !== undefined && item.id !== null && item.embedding.length)
    .map(item => ({
      ...item,
      norm: vectorNorm(item.embedding),
    }))
    .filter(item => item.norm > 0);

  return embeddingsCache;
}

// Carga una unica instancia del pipeline de embeddings para reutilizarla entre busquedas.
async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers')
      .then(({ pipeline }) => pipeline('feature-extraction', MODEL_ID));
  }

  return extractorPromise;
}

// Arma el texto que representa un tramite antes de generar su embedding.
function buildEmbeddingText(item) {
  const nombre = cleanText(item.nombre);
  const descripcion = cleanText(item.descripcion);
  const keywords = normalizeKeywords(item.keywords);
  const keywordsText = keywords.length
    ? `\n\nPalabras clave:\n${keywords.join(', ')}`
    : '';

  return `\nNombre:\n${nombre}\n\nDescripcion:\n${descripcion}${keywordsText}\n`;
}

// Calcula similitud coseno entre el vector de la consulta y el vector de un tramite.
function cosineSimilarity(left, right, rightNorm = vectorNorm(right)) {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNormSquared = 0;

  for (let index = 0; index < length; index += 1) {
    const a = Number(left[index]) || 0;
    const b = Number(right[index]) || 0;
    dot += a * b;
    leftNormSquared += a * a;
  }

  const leftNorm = Math.sqrt(leftNormSquared);
  if (!leftNorm || !rightNorm) return 0;

  return dot / (leftNorm * rightNorm);
}

// Refuerza coincidencias textuales fuertes para que terminos exactos no queden tapados por ruido vectorial.
function calculateLexicalScore(queryTerms, item) {
  if (!queryTerms.length) return 0;

  const nameTokens = tokenizeSearchTerms(item.nombre);
  const descriptionTokens = tokenizeSearchTerms(item.descripcion);
  const keywordTokens = tokenizeSearchTerms((item.keywords || []).join(' '));

  const nameMatches = countTermMatches(queryTerms, nameTokens);
  const keywordMatches = countTermMatches(queryTerms, keywordTokens);
  const descriptionMatches = countTermMatches(queryTerms, descriptionTokens);
  const combinedTokens = [...nameTokens, ...keywordTokens, ...descriptionTokens];
  const combinedMatches = countTermMatches(queryTerms, combinedTokens);

  const allTerms = queryTerms.length;
  const nameCoverage = nameMatches / allTerms;
  const keywordCoverage = keywordMatches / allTerms;
  const descriptionCoverage = descriptionMatches / allTerms;
  const combinedCoverage = combinedMatches / allTerms;
  const bestCoverage = Math.max(nameCoverage, keywordCoverage, descriptionCoverage);
  if (bestCoverage <= 0) return 0;

  const allInName = nameMatches === allTerms;
  const allInKeywords = keywordMatches === allTerms;
  const allInDescription = descriptionMatches === allTerms;
  const allInCombinedText = combinedMatches === allTerms;
  const nameDensity = nameTokens.length ? nameMatches / nameTokens.length : 0;

  if (allInCombinedText && nameMatches > 0) {
    return clampLexicalScore(0.9 + (nameDensity * 0.05) + (keywordCoverage * 0.02) + (descriptionCoverage * 0.02));
  }
  if (allInName) return clampLexicalScore(0.92 + (nameDensity * 0.05) + (allInKeywords ? 0.03 : 0));
  if (allInKeywords) return clampLexicalScore(0.88 + (keywordCoverage * 0.04));
  if (allInDescription) return clampLexicalScore(0.78 + (descriptionCoverage * 0.05));

  return clampLexicalScore(0.45 + (Math.max(bestCoverage, combinedCoverage) * 0.25) + (nameCoverage * 0.15) + (keywordCoverage * 0.1));
}

function countTermMatches(queryTerms, targetTokens) {
  return queryTerms.filter(term => targetTokens.some(token => termsMatch(term, token))).length;
}

function termsMatch(left, right) {
  const a = normalizeToken(left);
  const b = normalizeToken(right);
  return a === b || singularize(a) === singularize(b);
}

function normalizeToken(value) {
  return normalizeForSearch(value).replace(/[^a-z0-9]/gi, '');
}

function singularize(value) {
  if (value.endsWith('es') && value.length > 4) return value.slice(0, -2);
  if (value.endsWith('s') && value.length > 3) return value.slice(0, -1);
  return value;
}

function clampLexicalScore(value) {
  return Math.max(0, Math.min(0.99, value));
}

// Calcula la norma de un vector para reutilizarla en la similitud coseno.
function vectorNorm(values) {
  return Math.sqrt(values.reduce((total, value) => total + ((Number(value) || 0) ** 2), 0));
}

module.exports = {
  MODEL_ID,
  EMBEDDINGS_PATH,
  buildEmbeddingText,
  createEmbedding,
  calculateLexicalScore,
  loadEmbeddings,
  normalizeKeywords,
  searchWithEmbeddings,
};
