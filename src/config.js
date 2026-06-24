const path = require('path');

// Configuracion centralizada de la aplicacion.
// Es el UNICO lugar que lee process.env: el resto de los modulos importan desde aca
// para no dispersar variables de entorno ni redefinir constantes.

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

// Interpreta un valor de entorno booleano con un valor por defecto.
function readBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() !== 'false';
}

const config = {
  // Servidor
  port: Number(process.env.PORT || 3002),
  publicDir: path.join(ROOT_DIR, 'public'),
  sharedDir: path.join(ROOT_DIR, 'shared'),

  // Datos
  catalogPath: path.join(DATA_DIR, 'Listado_tramites_PRD.json'),
  embeddingsPath: path.join(DATA_DIR, 'embeddings_tramites.json'),

  // Modelos
  embeddingModel: process.env.EMBEDDING_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',

  // Auditoria de uso de IA
  usageLogEnabled: readBoolean(process.env.AI_USAGE_LOG_ENABLED, true),
  usageLogDir: process.env.AI_USAGE_LOG_DIR
    ? path.resolve(process.env.AI_USAGE_LOG_DIR)
    : path.join(ROOT_DIR, 'logs'),

  // Limites de las APIs HTTP
  maxQueryLength: 300,
  maxEmbeddingCandidates: 50,
  maxAiCandidates: 50,

  // Parametros de la llamada a Gemini
  requestTimeoutMs: 20000,
  maxAiDescriptionLength: 450,

  // Umbrales de evidencia minima para aceptar una sugerencia de IA.
  minAiFusePercent: 35,
  minAiSearchPercent: 45,
};

module.exports = config;
