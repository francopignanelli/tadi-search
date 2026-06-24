const fs = require('fs');

const config = require('../src/config');
const { buildEmbeddingText, createEmbedding } = require('../src/services/embedding-service');
const { cleanText, normalizeKeywords } = require('../src/text-utils');

const CATALOG_PATH = config.catalogPath;
const EMBEDDINGS_PATH = config.embeddingsPath;
const MODEL_ID = config.embeddingModel;

main().catch(error => {
  console.error('[embeddings] Error generando embeddings:', error);
  process.exitCode = 1;
});

// Regenera el archivo data/embeddings_tramites.json a partir del catalogo PRD.
async function main() {
  const rawCatalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const catalog = normalizeCatalog(rawCatalog);
  const previous = loadPreviousEmbeddings();
  const output = [];

  console.log(`[embeddings] Modelo: ${MODEL_ID}`);
  console.log(`[embeddings] Tramites a procesar: ${catalog.length}`);

  for (const item of catalog) {
    const previousItem = previous.get(String(item.id));
    const catalogKeywords = normalizeKeywords(item.keywords);
    const previousKeywords = normalizeKeywords(previousItem?.keywords);
    const keywords = catalogKeywords.length ? catalogKeywords : previousKeywords;
    const embeddingInput = { ...item, keywords };

    console.log(`[embeddings] Generando ID ${item.id}: ${item.nombre}`);
    output.push({
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      keywords,
      embedding: await createEmbedding(buildEmbeddingText(embeddingInput)),
    });
  }

  const nextContent = `${JSON.stringify(output, null, 4)}\n`;
  const currentContent = fs.existsSync(EMBEDDINGS_PATH)
    ? fs.readFileSync(EMBEDDINGS_PATH, 'utf8')
    : '';

  if (currentContent === nextContent) {
    console.log('[embeddings] Sin cambios para guardar');
    return;
  }

  fs.writeFileSync(EMBEDDINGS_PATH, nextContent, 'utf8');
  console.log(`[embeddings] Archivo actualizado: ${EMBEDDINGS_PATH}`);
}

// Carga embeddings previos para conservar palabras clave manuales si ya existian.
function loadPreviousEmbeddings() {
  if (!fs.existsSync(EMBEDDINGS_PATH)) return new Map();

  const items = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, 'utf8'));
  return new Map(items.map(item => [String(item.id), item]));
}

// Convierte el catalogo PRD al formato minimo usado para vectorizar tramites.
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
