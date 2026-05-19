require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = Number(process.env.PORT || 3002);
const PUBLIC_DIR = path.join(__dirname, 'public');
const CATALOG_PATH = path.join(__dirname, 'data', 'Listado_tramites_PRD.json');

// Configuracion de servicios y limites para evitar requests demasiado grandes.
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const EMBEDDING_SEARCH_URL = process.env.EMBEDDING_SEARCH_URL || 'http://127.0.0.1:8000/buscar';
const REQUEST_TIMEOUT_MS = 20000;
const EMBEDDING_TIMEOUT_MS = 30000;
const MAX_QUERY_LENGTH = 300;
const MAX_EMBEDDING_CANDIDATES = 600;
const MAX_AI_CANDIDATES = 6;
const MAX_AI_DESCRIPTION_LENGTH = 450;
const EMBEDDING_WEIGHT = 0.55;
const LEXICAL_WEIGHT = 0.45;

// Cache en memoria para no leer el catalogo en cada request.
let catalogCache;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(PUBLIC_DIR));

// Devuelve el catalogo completo al frontend para la busqueda local.
app.get('/api/catalog', (_req, res) => {
  const catalog = getCatalog();
  res.json({ tramites: catalog, total: catalog.length });
});

// Ejecuta la busqueda semantica por embeddings y devuelve resultados normalizados.
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
    const search = await searchWithEmbeddings(query, Math.min(catalog.length, MAX_EMBEDDING_CANDIDATES));
    const embeddingResults = (search.resultados || [])
      .map(item => normalizeEmbeddingResult(item, catalogById))
      .filter(Boolean);
    const resultados = buildHybridResults(query, embeddingResults, catalog, topK);

    res.json({ query, resultados, total: resultados.length });
  } catch (error) {
    res.status(503).json({
      error: 'No se pudo consultar la búsqueda por embeddings',
      detail: error.message,
    });
  }
});

// Recibe una consulta y candidatos prefiltrados, y devuelve la sugerencia de Gemini.
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

// Inicia el servidor y precarga el catalogo para detectar problemas al arrancar.
app.listen(PORT, () => {
  const total = getCatalog().length;
  console.log(`[tadi-search] ${total} tramites cargados`);
  console.log(`[tadi-search] http://localhost:${PORT}`);
});

// Lee Listado_tramites_PRD.json una sola vez y reutiliza el resultado desde memoria.
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

// Convierte el listado PRD al contrato minimo que usan frontend, embeddings e IA.
function normalizeCatalog(rawCatalog) {
  if (!Array.isArray(rawCatalog)) return [];

  return rawCatalog
    .map(item => ({
      id: item.id ?? item.ID,
      nombre: cleanText(item.nombre ?? item.NOMBRE_TRAMITE),
      descripcion: cleanText(item.descripcion ?? item.DESCRIPCION_CORTA),
    }))
    .filter(item => item.id !== undefined && item.id !== null && item.nombre);
}

// Consulta el servicio local de busqueda semantica.
async function searchWithEmbeddings(query, topK) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

  try {
    const response = await fetch(EMBEDDING_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, top_k: topK }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.detail || payload?.error || `HTTP ${response.status}`);
    }

    return payload;
  } catch (error) {
    console.error('[embeddings] Error:', error.message);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Asegura que los resultados semanticos usen el texto oficial del listado PRD.
function normalizeEmbeddingResult(result, catalogById) {
  const id = result.id;
  const catalogItem = catalogById.get(String(id));
  if (!catalogItem) return null;

  const score = Number(result.score);

  return {
    id: catalogItem.id,
    nombre: catalogItem.nombre,
    descripcion: catalogItem.descripcion,
    score: Number.isFinite(score) ? score : 0,
    scorePercent: scoreToPercent(score),
  };
}

// Combina similitud semantica con coincidencia textual exacta sobre el PRD.
function buildHybridResults(query, embeddingResults, catalog, topK) {
  const byId = new Map();

  for (const item of catalog) {
    const lexicalScore = scoreLexicalMatch(query, item);
    if (lexicalScore > 0) {
      byId.set(String(item.id), {
        ...item,
        score: 0,
        scorePercent: 0,
        lexicalScore,
      });
    }
  }

  for (const item of embeddingResults) {
    const id = String(item.id);
    const existing = byId.get(id);
    byId.set(id, {
      ...item,
      lexicalScore: existing?.lexicalScore ?? scoreLexicalMatch(query, item),
    });
  }

  return [...byId.values()]
    .map(item => ({
      ...item,
      hybridScore: (item.score * EMBEDDING_WEIGHT) + (item.lexicalScore * LEXICAL_WEIGHT),
    }))
    .sort((a, b) => b.hybridScore - a.hybridScore || b.score - a.score)
    .slice(0, topK)
    .map(({ lexicalScore, hybridScore, ...item }) => item);
}

// Puntua coincidencias por frase y tokens en nombre/descripcion corta.
function scoreLexicalMatch(query, item) {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return 0;

  const name = normalizeForSearch(item.nombre);
  const description = normalizeForSearch(item.descripcion);
  const tokens = normalizedQuery.split(/\s+/).filter(token => token.length >= 2);

  let phraseScore = 0;
  if (name === normalizedQuery) phraseScore = 1;
  else if (name.includes(normalizedQuery)) phraseScore = 0.9;
  else if (description.includes(normalizedQuery)) phraseScore = 0.65;

  if (!tokens.length) return phraseScore;

  if (tokens.length === 1) {
    const solicitud = `solicitud de ${tokens[0]}`;
    if (name === solicitud) phraseScore = Math.max(phraseScore, 1);
    else if (name.startsWith(solicitud)) phraseScore = Math.max(phraseScore, 0.98);
    else if (name.includes(solicitud)) phraseScore = Math.max(phraseScore, 0.95);
  }

  const tokenScore = tokens.reduce((total, token) => {
    if (name.includes(token)) return total + 1;
    if (description.includes(token)) return total + 0.6;
    return total;
  }, 0) / tokens.length;

  return clamp(Math.max(phraseScore, tokenScore * 0.85), 0, 1);
}

// Consulta Gemini para elegir el tramite mas relevante entre los candidatos recibidos.
async function findProcedureWithGemini(query, candidates) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: 'GEMINI_API_KEY no configurada', fallback: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify(buildGeminiRequest(query, candidates)),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || `HTTP ${response.status}`);
    }

    return normalizeGeminiResponse(payload);
  } catch (error) {
    console.error('[gemini] Error:', error.message);
    return { error: error.message, fallback: true };
  } finally {
    clearTimeout(timer);
  }
}

// Construye el payload esperado por la API generateContent de Gemini.
function buildGeminiRequest(query, candidates) {
  return {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt() }],
    },
    contents: [{
      role: 'user',
      parts: [{ text: buildUserPrompt(query, candidates) }],
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}

// Define el rol y las restricciones globales de respuesta para Gemini
function buildSystemPrompt() {
  return [
    'Sos un asistente de la plataforma TAD (Tramites a Distancia) del Gobierno de la Ciudad de Buenos Aires.',
    'Tu tarea es identificar que tramite gubernamental necesita el usuario basandote en su consulta en lenguaje natural.',
    'Responde solo con JSON valido, sin markdown, sin bloques de codigo y sin texto adicional.',
  ].join('\n');
}

// Construye el mensaje con la busqueda del usuario y los tramites candidatos.
function buildUserPrompt(query, candidates) {
  const candidateText = candidates.map(item => {
    const description = item.descripcion
      ? `\nDescripcion: ${truncateForAI(item.descripcion, MAX_AI_DESCRIPTION_LENGTH)}`
      : '';
    const score = Number.isFinite(Number(item.scorePercent))
      ? `\nAcierto embedding: ${item.scorePercent}%`
      : '';
    return `ID ${item.id}: ${item.nombre}${score}${description}`;
  }).join('\n');

  return `El usuario busca: "${query}"

Tramites candidatos:
${candidateText}

Responde con este JSON:
{
  "principal": { "id": "...", "razon": "explicacion breve para el usuario" },
  "alternativas": [{ "id": "...", "razon": "..." }],
  "explicacion": "Texto breve para mostrarle al usuario por que sugeris este tramite"
}

Reglas:
- "principal" debe ser el tramite mas relevante.
- "alternativas" puede tener 0 a 3 tramites adicionales entre los candidatos.
- Si ningun candidato es relevante, devolve "principal": null y "alternativas": [].
- Los IDs deben coincidir exactamente con la lista de candidatos.`;
}

// Limpia espacios sin transformar ni leer contenido HTML.
function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// Normaliza texto para ranking textual sin depender de mayusculas o acentos.
function normalizeForSearch(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Limita un numero al rango esperado.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Convierte similitud coseno en un porcentaje legible de acierto.
function scoreToPercent(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return 0;
  return Math.round(clamp(numericScore, 0, 1) * 100);
}

// Recorta texto largo para controlar tokens enviados a Gemini.
function truncateForAI(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

// Extrae el texto devuelto por Gemini, lo parsea como JSON y normaliza su forma.
function normalizeGeminiResponse(payload) {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map(part => part.text)
    .filter(Boolean)
    .join('\n')
    .trim();

  const parsed = JSON.parse(text || '{}');
  return {
    principal: parsed.principal || null,
    alternativas: Array.isArray(parsed.alternativas) ? parsed.alternativas.slice(0, 3) : [],
    explicacion: parsed.explicacion || '',
  };
}
