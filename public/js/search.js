// Orquestacion de la busqueda: reaccion al input (predictiva), busqueda confirmada
// (Fuse + embeddings), combinacion de candidatos y consulta a la IA.

import { SEARCH_CONFIG, IS_PRODUCTION_VIEW } from './config.js';
import { state } from './state.js';
import { ICONS, escapeHtml, getLimit } from './dom.js';
import { postSearch, postAI } from './api.js';
import { loadCatalog, searchLocal } from './catalog.js';
import {
  getFuseCandidatesForSearch,
  mergeCandidate,
  toAICandidate,
  enrichEmbeddingResult,
  findById,
  buildAISuggestedIds,
  getVisibleCandidates,
  getEmbeddingResultsForDisplay,
} from './candidates.js';
import {
  showResults,
  showResultsError,
  showInitialCatalog,
  showLoadingCatalog,
  showEmbeddingLoading,
  setSearchButton,
  hideAI,
  showAI,
  aiShell,
  renderCard,
} from './render.js';
import {
  logSearchSummary,
  logSearchInfo,
  logSearchTable,
  logAIUsageSummary,
  logSearchSeparator,
} from './logging.js';
import { renderAutocomplete, hideAutocomplete } from './autocomplete.js';

// Identifica la busqueda activa. Cada cambio de input o nueva busqueda incrementa el token,
// de modo que las respuestas asincronicas de una busqueda anterior se descartan y no pisan
// los resultados de la consulta mas reciente.
let activeSearchToken = 0;

// Reacciona a cambios en el input: limpia estados y muestra resultados predictivos.
export function handleInput(ui) {
  activeSearchToken += 1;
  const query = ui.input.value.trim();
  ui.clearButton.style.display = query ? 'inline-flex' : 'none';
  state.predictiveResults = [];
  state.embeddingResults = [];
  state.aiCandidates = [];
  state.aiSuggestedIds = new Set();
  state.autocompleteIndex = -1;
  state.initialPage = 1;
  hideAI(ui);

  if (!query) {
    hideAutocomplete(ui);
    showInitialCatalog(ui, 1);
    return;
  }

  if (!state.catalog) {
    hideAutocomplete(ui);
    showLoadingCatalog(ui);
    loadCatalog().then(() => handleInput(ui));
    return;
  }

  state.predictiveResults = searchLocal(query, SEARCH_CONFIG.predictiveVisibleLimit);
  if (state.skipAutocompleteOnce) {
    state.skipAutocompleteOnce = false;
    hideAutocomplete(ui);
  } else {
    renderAutocomplete(ui, state.predictiveResults);
  }
  showResults(ui, state.predictiveResults, { mode: 'predictive' });
}

// Ejecuta Fuse por umbral + embeddings top N y, si esta activo, pide la sugerencia de IA.
export async function runSearch(ui) {
  const query = ui.input.value.trim();
  if (!query || state.searchPending) return;

  const token = (activeSearchToken += 1);
  const catalog = await loadCatalog();
  if (token !== activeSearchToken) return;
  if (!catalog.length) {
    showResultsError(ui, 'No se pudo cargar el catálogo.');
    return;
  }

  hideAI(ui);
  state.predictiveResults = searchLocal(query, SEARCH_CONFIG.predictiveVisibleLimit);
  state.embeddingResults = [];
  state.aiCandidates = [];
  state.aiSuggestedIds = new Set();
  logSearchSummary(query, state.predictiveResults);
  setSearchButton(ui, true);
  showEmbeddingLoading(ui);

  try {
    const embeddingResults = await searchByEmbedding(query);
    if (token !== activeSearchToken) return;

    state.embeddingResults = embeddingResults;
    state.aiCandidates = buildAICandidates(query, state.predictiveResults, state.embeddingResults);
    logSearchTable('Candidatos combinados para IA', state.aiCandidates);

    if (state.aiEnabled && state.aiCandidates.length) {
      showResults(ui, state.aiCandidates, { mode: 'candidate' });
      await requestAISuggestion(ui, query, state.aiCandidates, token);
    } else {
      showResults(ui, getEmbeddingResultsForDisplay(), { mode: 'embedding' });
    }
  } catch (error) {
    if (token !== activeSearchToken) return;
    state.embeddingResults = [];
    state.aiCandidates = state.predictiveResults.map((item, index) => ({ ...item, aiCandidateRank: index + 1 }));
    showResultsError(ui, error.message || 'No se pudo completar la búsqueda por embeddings.');
  } finally {
    // Siempre se libera el boton: solo hay una busqueda en vuelo a la vez y es responsable
    // de limpiar su propio estado, sea o no la busqueda vigente.
    setSearchButton(ui, false);
    logSearchSeparator();
  }
}

// Llama al backend Node, que calcula la busqueda semantica integrada.
async function searchByEmbedding(query) {
  const requestPayload = { q: query, top_k: SEARCH_CONFIG.embeddingVisibleLimit };
  logSearchInfo('Request búsqueda semántica/textual', {
    endpoint: '/api/search',
    payload: requestPayload,
  });

  const data = await postSearch(query, SEARCH_CONFIG.embeddingVisibleLimit);

  const results = (data.resultados || [])
    .map((item, index) => enrichEmbeddingResult(item, index + 1));
  logSearchInfo('Respuesta búsqueda semántica/textual', {
    queryOriginal: data.query,
    queryLimpia: data.searchQuery,
    total: data.total,
  });
  logSearchTable('Top búsqueda semántica/textual', results);
  return results;
}

// Unifica candidatos sin repetir segun SEARCH_CONFIG: Fuse por umbral y luego embeddings top N.
function buildAICandidates(query, predictiveResults, embeddingResults) {
  const byId = new Map();

  for (const item of getFuseCandidatesForSearch(predictiveResults, query)) {
    byId.set(String(item.id), { ...item });
  }

  for (const item of embeddingResults.slice(0, SEARCH_CONFIG.embeddingCandidatesForAI)) {
    const id = String(item.id);
    const existing = byId.get(id);
    byId.set(id, existing ? mergeCandidate(existing, item) : { ...item });
  }

  return [...byId.values()]
    .slice(0, getLimit(SEARCH_CONFIG.aiCandidatesSentLimit))
    .map((item, index) => ({ ...item, aiCandidateRank: index + 1 }));
}

// Pide a Gemini una sugerencia usando candidatos recuperados por Fuse y embeddings.
async function requestAISuggestion(ui, query, candidates, token) {
  const aiCandidates = candidates.slice(0, getLimit(SEARCH_CONFIG.aiCandidatesSentLimit));
  const aiPayloadCandidates = aiCandidates.map(toAICandidate);

  logSearchInfo('Request IA', {
    endpoint: '/api/ai',
    queryOriginal: query,
    candidatosEnviados: aiPayloadCandidates.length,
  });
  logSearchTable('Candidatos enviados a IA', aiPayloadCandidates);

  showAI(ui, aiShell(`<div class="ai-loading">${ICONS.loader} Analizando con IA...</div>`));

  try {
    const data = await postAI(query, aiPayloadCandidates);

    if (token !== activeSearchToken || !state.aiEnabled) return;
    logSearchInfo('Respuesta IA', data);
    logAIUsageSummary(data, aiPayloadCandidates);
    renderAISuggestion(ui, data);
  } catch (error) {
    if (token !== activeSearchToken || !state.aiEnabled) return;
    showAI(ui, aiShell(`<div class="ai-error">${ICONS.error} ${escapeHtml(error.message || 'Error al consultar la IA.')}</div>`));
  }
}

// Interpreta la respuesta de Gemini y construye la tarjeta de sugerencia.
function renderAISuggestion(ui, data) {
  if (data.error && data.fallback) {
    showAI(ui, aiShell(`<div class="ai-error">${ICONS.error} ${escapeHtml(data.error)}</div>`));
    return;
  }

  if (!data.principal) {
    const message = data.explicacion || 'No se encontraron tramites relacionados con tu busqueda. Intenta nuevamente con otras palabras.';
    showAI(ui, aiShell(`<div class="ai-notfound">${ICONS.empty} ${escapeHtml(message)}</div>`));
    return;
  }

  const principal = findById(data.principal.id);
  const alternatives = (data.alternativas || [])
    .map(alternative => findById(alternative.id))
    .filter(Boolean);
  const suggestedIds = buildAISuggestedIds(principal, alternatives);

  let content = '';
  if (data.explicacion) {
    content += `<div class="ai-exp">${ICONS.info} ${escapeHtml(data.explicacion)}</div>`;
  }
  if (principal) {
    content += `<div class="ai-principal-wrap">${renderCard(principal, {
      principal: true,
      showDebug: !IS_PRODUCTION_VIEW,
      showFusePercent: !IS_PRODUCTION_VIEW,
      showEmbeddingPercent: !IS_PRODUCTION_VIEW,
    })}</div>`;
  }
  if (alternatives.length) {
    content += '<div class="alts-label">También puede ser:</div><div class="alts-list">';
    content += alternatives.map(alternative => renderCard(alternative, {
      alt: true,
      showDebug: !IS_PRODUCTION_VIEW,
      showFusePercent: !IS_PRODUCTION_VIEW,
      showEmbeddingPercent: !IS_PRODUCTION_VIEW,
    })).join('');
    content += '</div>';
  }

  state.aiSuggestedIds = suggestedIds;
  showAI(ui, aiShell(content));
  showResults(ui, getVisibleCandidates(), { mode: 'candidate' });
}

// Activa o desactiva las respuestas de IA.
export function toggleAI(ui) {
  state.aiEnabled = !state.aiEnabled;
  updateAIToggle(ui);
  if (!state.aiEnabled) {
    state.aiSuggestedIds = new Set();
    hideAI(ui);
    if (state.embeddingResults.length) {
      showResults(ui, getEmbeddingResultsForDisplay(), { mode: 'embedding' });
    }
  }
}

// Actualiza el estado visual del toggle IA.
export function updateAIToggle(ui) {
  ui.aiToggle.classList.toggle('active', state.aiEnabled);
  ui.aiToggle.setAttribute('aria-pressed', String(state.aiEnabled));
}
