require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = Number(process.env.PORT || 3002);
const PUBLIC_DIR = path.join(__dirname, 'public');
const CATALOG_PATH = path.join(__dirname, 'data', 'catalog_unificado.json');

// Configuracion de Gemini y limites para evitar requests demasiado grandes.
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_QUERY_LENGTH = 300;
const MAX_AI_CANDIDATES = 6;
const MAX_AI_DESCRIPTION_LENGTH = 450;

// Cache en memoria para no leer el catalogo en cada request.
let catalogCache;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(PUBLIC_DIR));

// Devuelve el catalogo completo al frontend para la busqueda local.
app.get('/api/catalog', (_req, res) => {
  const catalog = getCatalog();
  res.json({ tramites: catalog, total: catalog.length });
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

// Lee catalog_unificado.json una sola vez y reutiliza el resultado desde memoria.
function getCatalog() {
  if (catalogCache) return catalogCache;

  try {
    catalogCache = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch (error) {
    console.error('[tadi-search] Error leyendo data/catalog_unificado.json:', error.message);
    catalogCache = [];
  }

  return catalogCache;
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
    return `ID ${item.id}: ${item.nombre}${description}`;
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
- "alternativas" puede tener 0 a 3 tramites adicionales.
- Si ningun candidato es relevante, devolve "principal": null y "alternativas": [].
- Los IDs deben coincidir exactamente con la lista de candidatos.`;
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
