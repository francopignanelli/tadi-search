const fs = require('fs');
const path = require('path');
const { cleanText, normalizeKeywords } = require('./text-utils');

const MODEL_ID = process.env.EMBEDDING_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const EMBEDDINGS_PATH = path.join(__dirname, '..', 'data', 'embeddings_tramites.json');

let extractorPromise;
let embeddingsCache;

// Busca los tramites mas cercanos semanticamente a la consulta usando embeddings precalculados.
async function searchWithEmbeddings(query, topK) {
  const records = loadEmbeddings();
  const queryEmbedding = await createEmbedding(query);

  const resultados = records
    .filter(item => item.embedding.length === queryEmbedding.length)
    .map(item => ({
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      keywords: item.keywords,
      score: cosineSimilarity(queryEmbedding, item.embedding, item.norm),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { query, resultados };
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

// Calcula la norma de un vector para reutilizarla en la similitud coseno.
function vectorNorm(values) {
  return Math.sqrt(values.reduce((total, value) => total + ((Number(value) || 0) ** 2), 0));
}

module.exports = {
  MODEL_ID,
  EMBEDDINGS_PATH,
  buildEmbeddingText,
  createEmbedding,
  loadEmbeddings,
  normalizeKeywords,
  searchWithEmbeddings,
};
