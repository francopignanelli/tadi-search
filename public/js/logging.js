// Logging del flujo de busqueda en la consola del navegador. Sirve tambien en la vista
// /produccion para inspeccionar predictiva, embeddings y candidatos enviados a IA.

import { SEARCH_CONFIG, APP_MODE } from './config.js';
import { buildSearchQuery, tokenizeExactWords, estimateTokenCount } from './text.js';
import { getFusePercent, getScorePercent, getFuseCandidatesForSearch } from './candidates.js';

// Registra en consola el resumen de una busqueda confirmada.
export function logSearchSummary(query, predictiveResults) {
  const cleanedQuery = buildSearchQuery(query);
  const terms = tokenizeExactWords(query);
  const fuseCandidates = getFuseCandidatesForSearch(predictiveResults, query);

  logSearchInfo('Búsqueda iniciada', {
    vista: APP_MODE,
    queryOriginal: query,
    queryLimpia: cleanedQuery,
    terminosRelevantes: terms,
    fuseResultados: predictiveResults.length,
    fuseUmbralMinimo: `${SEARCH_CONFIG.fuseCandidateMinPercent}%`,
    fuseCandidatosParaIA: fuseCandidates.length,
    embeddingVisibleLimit: SEARCH_CONFIG.embeddingVisibleLimit,
    embeddingCandidatesForAI: SEARCH_CONFIG.embeddingCandidatesForAI,
    aiCandidatesSentLimit: SEARCH_CONFIG.aiCandidatesSentLimit,
  });
  logSearchTable('Resultados Fuse', predictiveResults);
  logSearchTable('Candidatos Fuse que pasan filtro IA', fuseCandidates);
}

export function logSearchInfo(label, data) {
  if (!window.console) return;
  console.groupCollapsed(`[TADI Search] ${label}`);
  console.log(data);
  console.groupEnd();
}

export function logSearchTable(label, items, maxItems = 30) {
  if (!window.console || typeof console.table !== 'function') return;
  const rows = (items || []).slice(0, maxItems).map((item, index) => summarizeSearchItem(item, index));
  console.groupCollapsed(`[TADI Search] ${label} (${rows.length}${items?.length > maxItems ? ` de ${items.length}` : ''})`);
  console.table(rows);
  console.groupEnd();
}

export function logAIUsageSummary(data, aiPayloadCandidates) {
  const usage = data?.usage || {};
  logSearchInfo('Resumen tokens IA', {
    tokensTramitesEnviadosEstimados: estimateTokenCount(JSON.stringify(aiPayloadCandidates || [])),
    tokensTotalesConsumidos: usage.totalTokenCount ?? 'No informado',
  });
}

export function logSearchSeparator() {
  if (!window.console) return;
  console.log('============================== FIN BUSQUEDA TADI ==============================');
}

function summarizeSearchItem(item, index) {
  return {
    '#': index + 1,
    id: item.id,
    nombre: item.nombre,
    origen: Array.isArray(item.sources) ? item.sources.join(', ') : '',
    fuseRank: item.fuseRank ?? '',
    fusePercent: getFusePercent(item, true),
    busquedaRank: item.embeddingRank ?? '',
    coincidenciaPercent: getScorePercent(item, true),
    semanticaPercent: Number.isFinite(Number(item.semanticScore)) ? Math.round(Number(item.semanticScore) * 100) : '',
    textualPercent: Number.isFinite(Number(item.lexicalScore)) ? Math.round(Number(item.lexicalScore) * 100) : '',
    nombreExacto: Boolean(item.exactNameWords),
    keywords: Array.isArray(item.keywords) ? item.keywords.join(', ') : '',
  };
}
