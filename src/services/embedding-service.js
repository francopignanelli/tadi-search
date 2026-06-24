const config = require('../config');
const { vectorNorm } = require('../data/embeddings');
const {
  cleanText,
  normalizeForSearch,
  normalizeKeywords,
  tokenizeSearchTerms,
} = require('../text-utils');

// Servicio de embeddings: genera vectores con el modelo local de Hugging Face y provee
// las metricas de similitud (coseno + score lexical) usadas para rankear tramites.

let extractorPromise;

// Genera el vector numerico de un texto usando el modelo local de Hugging Face.
async function createEmbedding(text) {
  const extractor = await getExtractor();
  const output = await extractor(cleanText(text), {
    pooling: 'mean',
    normalize: true,
  });

  return Array.from(output.data || []);
}

// Carga una unica instancia del pipeline de embeddings para reutilizarla entre busquedas.
async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers')
      .then(({ pipeline }) => pipeline('feature-extraction', config.embeddingModel));
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

module.exports = {
  buildEmbeddingText,
  calculateLexicalScore,
  cosineSimilarity,
  createEmbedding,
  getExtractor,
};
