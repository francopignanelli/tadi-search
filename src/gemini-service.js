const { normalizeKeywords, truncateText } = require('./text-utils');

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_AI_DESCRIPTION_LENGTH = 450;

// Consulta Gemini para elegir el tramite mas relevante entre candidatos ya filtrados.
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

// Construye el payload que espera la API generateContent de Gemini.
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

// Define el rol, el alcance y las restricciones de respuesta para Gemini.
function buildSystemPrompt() {
  return [
    'Sos un asistente de la plataforma TAD (Tramites a Distancia) del Gobierno de la Ciudad de Buenos Aires.',
    'Tu tarea es identificar que tramite gubernamental necesita el usuario basandote en su consulta en lenguaje natural.',
    'Los candidatos pueden venir de busqueda predictiva por texto, embeddings semanticos o ambos metodos.',
    'No penalices un candidato solo porque viene de embeddings: puede ser relevante aunque no comparta palabras exactas con la consulta.',
    'Adapta la explicacion al tipo de consulta: palabra clave, pregunta o caso/necesidad expresada por el usuario.',
    'Responde solo con JSON valido, sin markdown, sin bloques de codigo y sin texto adicional.',
  ].join('\n');
}

// Arma el mensaje de usuario con la consulta y la metadata de cada tramite candidato.
function buildUserPrompt(query, candidates) {
  const candidateText = candidates.map((item, index) => {
    const description = item.descripcion
      ? `\nDescripcion: ${truncateText(item.descripcion, MAX_AI_DESCRIPTION_LENGTH)}`
      : '';
    const score = Number.isFinite(Number(item.scorePercent))
      ? `\nAcierto embedding: ${item.scorePercent}%`
      : '';
    const fuseRank = Number.isFinite(Number(item.fuseRank))
      ? `\nRanking predictivo Fuse: #${item.fuseRank}`
      : '';
    const fuseScore = Number.isFinite(Number(item.fuseScore))
      ? `\nScore Fuse: ${Number(item.fuseScore).toFixed(4)} (mas bajo es mejor)`
      : '';
    const embeddingRank = Number.isFinite(Number(item.embeddingRank))
      ? `\nRanking embeddings: #${item.embeddingRank}`
      : '';
    const source = Array.isArray(item.sources) && item.sources.length
      ? `\nOrigen: ${item.sources.join(', ')}`
      : '';
    const keywords = normalizeKeywords(item.keywords);
    const keywordsText = keywords.length
      ? `\nPalabras clave: ${keywords.join(', ')}`
      : '';
    return `Candidato IA #${index + 1}\nID ${item.id}: ${item.nombre}${source}${fuseRank}${fuseScore}${embeddingRank}${score}${keywordsText}${description}`;
  }).join('\n');

  return `El usuario busca: "${query}"

Tramites candidatos:
${candidateText}

Responde con este JSON:
{
  "principal": { "id": "...", "razon": "explicacion breve para el usuario" },
  "alternativas": [{ "id": "...", "razon": "..." }],
  "explicacion": "Texto breve y contextual para responder al usuario antes de sugerir el tramite"
}

Reglas:
- "principal" debe ser el tramite mas relevante.
- "alternativas" puede tener 0 a 3 tramites adicionales entre los candidatos.
- Si el usuario escribio una palabra clave, responde en "explicacion" con una frase del estilo: "Si estas buscando tramites sobre ...".
- Si el usuario hizo una pregunta, responde directamente la pregunta en "explicacion" antes de sugerir.
- Si el usuario planteo un caso o necesidad, reconoce esa necesidad en "explicacion" antes de sugerir.
- Considera especialmente los candidatos que aparecen por ambos metodos, pero tambien evalua los que vienen solo de embeddings si semanticamente son buenos.
- Si ningun candidato es relevante, devolve "principal": null y "alternativas": [].
- Los IDs deben coincidir exactamente con la lista de candidatos.`;
}

// Extrae el texto devuelto por Gemini, lo parsea como JSON y normaliza su forma final.
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

module.exports = {
  buildGeminiRequest,
  buildSystemPrompt,
  buildUserPrompt,
  findProcedureWithGemini,
  normalizeGeminiResponse,
};
