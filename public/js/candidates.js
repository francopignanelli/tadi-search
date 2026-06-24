// Logica de dominio sobre candidatos: scoring para mostrar, filtrado para IA, fusion de
// metadata entre metodos (Fuse + embeddings) y busqueda de tramites por ID.

import { SEARCH_CONFIG, MAX_AI_DESCRIPTION_LENGTH } from './config.js';
import { tokenizeExactWords } from './text.js';
import { state } from './state.js';

// Obtiene el porcentaje combinado de coincidencia semantica/textual para mostrarlo como acierto.
export function getScorePercent(item, fallbackToZero = false) {
  const directPercent = Number(item?.scorePercent);
  if (Number.isFinite(directPercent)) return Math.max(0, Math.min(100, Math.round(directPercent)));

  const score = Number(item?.score);
  if (!Number.isFinite(score)) return fallbackToZero ? 0 : null;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

// Convierte el score de Fuse en una precision visual: en Fuse, mas bajo es mejor.
export function getFusePercent(item, fallbackToZero = false) {
  const score = Number(item?.fuseScore);
  if (!Number.isFinite(score)) return fallbackToZero ? 0 : null;
  return Math.round(Math.max(0, Math.min(1, 1 - score)) * 100);
}

// Detecta si el nombre del tramite contiene todas las palabras relevantes de la busqueda.
export function hasExactNameWords(query, item) {
  const queryTokens = tokenizeExactWords(query);
  if (!queryTokens.length) return false;

  const nameTokens = new Set(tokenizeExactWords(item.nombre));
  return queryTokens.every(token => nameTokens.has(token));
}

// Agrega metadata de testing para resultados recuperados por Fuse.
export function enrichPredictiveResult(item, fuseScore, fuseRank) {
  return {
    ...item,
    fuseRank,
    fuseScore: Number.isFinite(Number(fuseScore)) ? Number(fuseScore) : null,
    sources: ['fuse'],
  };
}

// Agrega metadata de testing para resultados recuperados por embeddings.
export function enrichEmbeddingResult(item, embeddingRank) {
  return {
    ...item,
    embeddingRank,
    sources: ['embedding'],
  };
}

// Fusiona metadata cuando un tramite aparece por Fuse y embeddings.
export function mergeCandidate(left, right) {
  return {
    ...left,
    ...right,
    fuseRank: left.fuseRank ?? right.fuseRank,
    fuseScore: left.fuseScore ?? right.fuseScore,
    embeddingRank: left.embeddingRank ?? right.embeddingRank,
    score: right.score ?? left.score,
    scorePercent: right.scorePercent ?? left.scorePercent,
    sources: [...new Set([...(left.sources || []), ...(right.sources || [])])],
  };
}

// Recorta texto largo para evitar payloads innecesarios hacia Gemini.
function truncateForAI(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

// Reduce cada candidato al minimo necesario antes de enviarlo al backend/IA.
export function toAICandidate(item) {
  return {
    id: item.id,
    nombre: item.nombre,
    descripcion: truncateForAI(item.descripcion, MAX_AI_DESCRIPTION_LENGTH),
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    scorePercent: getScorePercent(item, true),
    fusePercent: getFusePercent(item, true),
    embeddingRank: Number.isFinite(Number(item.embeddingRank)) ? Number(item.embeddingRank) : null,
    fuseRank: Number.isFinite(Number(item.fuseRank)) ? Number(item.fuseRank) : null,
    fuseScore: Number.isFinite(Number(item.fuseScore)) ? Number(item.fuseScore) : null,
    sources: Array.isArray(item.sources) ? item.sources : [],
    aiCandidateRank: Number.isFinite(Number(item.aiCandidateRank)) ? Number(item.aiCandidateRank) : null,
    exactNameWords: Boolean(item.exactNameWords),
  };
}

// Devuelve resultados de Fuse por porcentaje o por palabras exactas en el nombre.
export function getFuseCandidatesForSearch(predictiveResults, query) {
  const minPercent = Number(SEARCH_CONFIG.fuseCandidateMinPercent);
  if (!Number.isFinite(minPercent) && !SEARCH_CONFIG.includeExactNameWordsForAI) return predictiveResults;

  return predictiveResults
    .filter(item => {
      const passesFuseThreshold = Number.isFinite(minPercent) && getFusePercent(item, true) >= minPercent;
      const passesExactName = SEARCH_CONFIG.includeExactNameWordsForAI && hasExactNameWords(query, item);
      if (passesExactName) item.exactNameWords = true;
      return passesFuseThreshold || passesExactName;
    });
}

// Busca un tramite por ID, priorizando candidatos enriquecidos para conservar metadata.
export function findById(id) {
  const candidateItem = (state.aiCandidates || []).find(item => String(item.id) === String(id));
  if (candidateItem) return candidateItem;
  const embeddingItem = (state.embeddingResults || []).find(item => String(item.id) === String(id));
  if (embeddingItem) return embeddingItem;
  const predictiveItem = (state.predictiveResults || []).find(item => String(item.id) === String(id));
  if (predictiveItem) return predictiveItem;
  return (state.catalog || []).find(item => String(item.id) === String(id));
}

// Arma el conjunto de IDs ya representados en la tarjeta de IA.
export function buildAISuggestedIds(principal, alternatives) {
  const ids = new Set();

  if (principal) ids.add(String(principal.id));
  for (const alternative of alternatives) {
    ids.add(String(alternative.id));
  }

  return ids;
}

// Devuelve los candidatos sin los tramites ya mostrados por IA.
export function getVisibleCandidates() {
  if (!state.aiSuggestedIds.size) return state.aiCandidates;

  return state.aiCandidates
    .filter(item => !state.aiSuggestedIds.has(String(item.id)));
}

// Devuelve todos los resultados de embeddings, agregando datos de Fuse cuando el tramite tambien matcheo en predictiva.
export function getEmbeddingResultsForDisplay() {
  const predictiveById = new Map(
    (state.predictiveResults || []).map(item => [String(item.id), item])
  );

  return (state.embeddingResults || []).map(item => {
    const predictiveItem = predictiveById.get(String(item.id));
    return predictiveItem ? mergeCandidate(predictiveItem, item) : item;
  });
}
