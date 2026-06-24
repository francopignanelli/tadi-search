const config = require('../config');
const { normalizeKeywords, truncateText } = require('../text-utils');
const { appendAIUsageLog, normalizeGeminiUsage } = require('./ai-usage-log');

const NOT_FOUND_EXPLANATION = 'No se encontraron tramites relacionados con tu busqueda. Intenta nuevamente con otras palabras.';

// Consulta Gemini para elegir el tramite mas relevante entre candidatos ya filtrados.
async function findProcedureWithGemini(query, candidates) {
  if (!config.geminiApiKey) {
    return { error: 'GEMINI_API_KEY no configurada', fallback: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const startedAt = new Date();
  const requestPayload = buildGeminiRequest(query, candidates);

  try {
    const response = await fetch(`${config.geminiEndpoint}/${config.geminiModel}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': config.geminiApiKey,
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      const geminiError = new Error(payload?.error?.message || `HTTP ${response.status}`);
      geminiError.responsePayload = payload;
      throw geminiError;
    }

    const result = validateGeminiSelection(normalizeGeminiResponse(payload), candidates);
    await safeAppendAIUsageLog({
      query,
      model: config.geminiModel,
      candidates,
      requestPayload,
      responsePayload: payload,
      startedAt,
      finishedAt: new Date(),
      ok: true,
    });

    return {
      ...result,
      usage: normalizeGeminiUsage(payload.usageMetadata),
    };
  } catch (error) {
    console.error('[gemini] Error:', error.message);
    await safeAppendAIUsageLog({
      query,
      model: config.geminiModel,
      candidates,
      requestPayload,
      responsePayload: error.responsePayload,
      startedAt,
      finishedAt: new Date(),
      ok: false,
      error: error.message,
    });
    return { error: error.message, fallback: true };
  } finally {
    clearTimeout(timer);
  }
}

// Registra el consumo de IA sin romper la respuesta al usuario si falla la escritura del log.
async function safeAppendAIUsageLog(input) {
  try {
    await appendAIUsageLog(input);
  } catch (error) {
    console.error('[ai-usage-log] Error:', error.message);
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
    'Los candidatos pueden venir de busqueda predictiva por texto, busqueda semantica/textual o ambos metodos.',
    'No penalices un candidato solo porque viene de busqueda semantica/textual: puede ser relevante aunque no comparta todas las palabras exactas con la consulta.',
    'Usa un criterio estricto de relevancia: solo sugeri un tramite si resuelve directamente la intencion expresada por el usuario.',
    'No sugieras tramites por asociaciones indirectas, coincidencias vagas o palabras sueltas si el tramite no permite hacer lo que el usuario pide.',
    'Si la consulta no parece relacionada con un tramite TAD o ningun candidato resuelve directamente la necesidad, responde que no se encontraron tramites relacionados.',
    'Adapta la explicacion al tipo de consulta original: palabra clave, pregunta o caso/necesidad expresada por el usuario.',
    'Usa la consulta original para redactar la explicacion de forma natural. Si el usuario dice "Necesito hacer..." o "Quiero...", responde con una frase del estilo "Si necesitas..." o "Si queres...".',
    'Responde solo con JSON valido, sin markdown, sin bloques de codigo y sin texto adicional.',
  ].join('\n');
}

// Arma el mensaje de usuario con la consulta y la metadata de cada tramite candidato.
function buildUserPrompt(query, candidates) {
  const candidateText = candidates.map((item, index) => {
    const description = item.descripcion
      ? `\nDescripcion: ${truncateText(item.descripcion, config.maxAiDescriptionLength)}`
      : '';
    const score = Number.isFinite(Number(item.scorePercent))
      ? `\nAcierto busqueda: ${item.scorePercent}%`
      : '';
    const fusePercent = Number.isFinite(Number(item.fusePercent))
      ? `\nAcierto Fuse: ${item.fusePercent}%`
      : '';
    const fuseRank = Number.isFinite(Number(item.fuseRank))
      ? `\nRanking predictivo Fuse: #${item.fuseRank}`
      : '';
    const fuseScore = Number.isFinite(Number(item.fuseScore))
      ? `\nScore Fuse: ${Number(item.fuseScore).toFixed(4)} (mas bajo es mejor)`
      : '';
    const embeddingRank = Number.isFinite(Number(item.embeddingRank))
      ? `\nRanking busqueda semantica/textual: #${item.embeddingRank}`
      : '';
    const source = Array.isArray(item.sources) && item.sources.length
      ? `\nOrigen: ${item.sources.join(', ')}`
      : '';
    const keywords = normalizeKeywords(item.keywords);
    const keywordsText = keywords.length
      ? `\nPalabras clave: ${keywords.join(', ')}`
      : '';
    const exactNameWords = item.exactNameWords
      ? '\nCoincidencia exacta en nombre: si'
      : '';
    return `Candidato IA #${index + 1}\nID ${item.id}: ${item.nombre}${source}${fuseRank}${fuseScore}${fusePercent}${embeddingRank}${score}${exactNameWords}${keywordsText}${description}`;
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
- Selecciona un tramite solo si su nombre y descripcion coinciden de forma directa con la accion que quiere hacer el usuario.
- No alcanza con que exista una palabra parecida o una relacion tematica general.
- Trata los porcentajes bajos como evidencia debil. Si un candidato tiene Fuse 0% y acierto de busqueda bajo, no lo sugieras salvo que la descripcion resuelva exactamente la necesidad.
- Si el usuario quiere participar, anotarse o inscribirse en una actividad, no sugieras un tramite para organizar, autorizar o registrar esa actividad salvo que el tramite diga explicitamente que sirve para participantes.
- Si el usuario pide algo privado, comercial, recreativo o fuera del alcance de tramites gubernamentales, devolve "principal": null y "alternativas": [].
- Si el usuario escribio una palabra clave, responde en "explicacion" con una frase del estilo: "Si estas buscando tramites sobre ...".
- Si el usuario hizo una pregunta, responde directamente la pregunta en "explicacion" antes de sugerir.
- Si el usuario planteo un caso o necesidad, reconoce esa necesidad en "explicacion" antes de sugerir usando la consulta original, no la consulta limpia.
- Considera especialmente los candidatos que aparecen por ambos metodos, pero tambien evalua los que vienen solo de busqueda semantica/textual si semanticamente son buenos.
- Si ningun candidato es claramente relevante, devolve "principal": null, "alternativas": [] y una "explicacion" amable como: "${NOT_FOUND_EXPLANATION}".
- Los IDs deben coincidir exactamente con la lista de candidatos.`;
}

// Rechaza selecciones con evidencia de busqueda demasiado baja, aunque Gemini haya elegido un candidato.
function validateGeminiSelection(result, candidates) {
  if (!result.principal) return result;

  const principal = findCandidateById(candidates, result.principal.id);
  if (!principal || !hasStrongSearchEvidence(principal)) {
    return {
      principal: null,
      alternativas: [],
      explicacion: NOT_FOUND_EXPLANATION,
      rejectedPrincipal: result.principal,
    };
  }

  return {
    ...result,
    alternativas: result.alternativas
      .filter(alternative => hasStrongSearchEvidence(findCandidateById(candidates, alternative.id))),
  };
}

// Busca el candidato original para revisar sus metricas antes de aceptar la sugerencia final.
function findCandidateById(candidates, id) {
  return candidates.find(candidate => String(candidate.id) === String(id));
}

// Define una evidencia minima para evitar que la IA sugiera tramites por asociaciones vagas.
function hasStrongSearchEvidence(candidate) {
  if (!candidate) return false;
  if (candidate.exactNameWords) return true;

  const fusePercent = Number(candidate.fusePercent);
  if (Number.isFinite(fusePercent) && fusePercent >= config.minAiFusePercent) return true;

  const searchPercent = Number(candidate.scorePercent);
  if (Number.isFinite(searchPercent) && searchPercent >= config.minAiSearchPercent) return true;

  return false;
}

// Extrae el texto devuelto por Gemini, lo parsea como JSON y normaliza su forma final.
function normalizeGeminiResponse(payload) {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map(part => part.text)
    .filter(Boolean)
    .join('\n')
    .trim();

  const parsed = JSON.parse(text || '{}');
  const principal = parsed.principal || null;
  return {
    principal,
    alternativas: principal && Array.isArray(parsed.alternativas) ? parsed.alternativas.slice(0, 3) : [],
    explicacion: parsed.explicacion || (
      principal
        ? ''
        : NOT_FOUND_EXPLANATION
    ),
  };
}

module.exports = {
  buildGeminiRequest,
  buildSystemPrompt,
  buildUserPrompt,
  findProcedureWithGemini,
  hasStrongSearchEvidence,
  normalizeGeminiResponse,
  validateGeminiSelection,
};
