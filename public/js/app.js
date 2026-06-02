const SELECTORS = {
  input: '#search-input',
  clearButton: '#clear-btn',
  searchButton: '#search-btn',
  aiToggle: '#ai-toggle',
  suggestions: '#autocomplete-suggestions',
  emptyState: '#empty-state',
  aiCard: '#ai-card',
  resultsMeta: '#results-meta',
  results: '#results',
  pagination: '#pagination',
};

const ICONS = {
  brain: svg('<path d="M9.5 2a2.5 2.5 0 0 1 5 0v.5a2.5 2.5 0 0 1-5 0V2z"/><path d="M4.5 8a4 4 0 0 1 7.5-1.9A4 4 0 0 1 19.5 8"/><path d="M4.5 8v.5a4 4 0 0 0 4 4h7a4 4 0 0 0 4-4V8"/><path d="M8.5 12.5v4a2 2 0 0 0 4 0v-1"/><path d="M15.5 12.5v2a2 2 0 0 1-4 0"/>'),
  empty: svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>', '1.5'),
  error: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  loader: svg('<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>', '2.5'),
};

const state = {
  catalog: null,
  fuse: null,
  searchPending: false,
  aiEnabled: true,
  predictiveResults: [],
  embeddingResults: [],
  aiCandidates: [],
  aiSuggestedIds: new Set(),
  autocompleteSuggestions: [],
  autocompleteIndex: -1,
  skipAutocompleteOnce: false,
  initialResults: [],
  initialPage: 1,
};

const APP_MODE = document.body?.dataset?.appMode === 'production' ? 'production' : 'testing';
const IS_PRODUCTION_VIEW = APP_MODE === 'production';

const SEARCH_CONFIG = {
  // Cantidad de resultados que se muestran mientras se escribe, antes de presionar Buscar.
  // Usar null para mostrar todos los resultados que devuelva Fuse.js.
  predictiveVisibleLimit: null,

  // Porcentaje minimo de coincidencia Fuse para tomar un tramite como candidato al presionar Buscar.
  // Ejemplo: 46 significa "incluir tramites con Fuse 46% o mas".
  fuseCandidateMinPercent: 46,

  // Tambien toma como candidato los tramites cuyo nombre contiene todas las palabras exactas buscadas.
  // Solo revisa el nombre, no la descripcion, para evitar sumar demasiados tramites.
  includeExactNameWordsForAI: true,

  // Cantidad de resultados semanticos por embeddings que se piden al backend para visualizar/testear.
  // No implica que todos se envien a Gemini.
  embeddingVisibleLimit: 50,

  // Cantidad de resultados semanticos por embeddings que se suman como candidatos para Gemini.
  embeddingCandidatesForAI: 10,

  // Cantidad maxima de candidatos combinados que se mandan a Gemini.
  // Usar null para enviar todos los que pasen el umbral Fuse + los embeddings configurados.
  aiCandidatesSentLimit: null,

  // Cantidad de candidatos que se muestran en pantalla despues de presionar Buscar.
  // Usar null para mostrar todos los candidatos combinados.
  searchVisibleLimit: null,

  // Cantidad de tramites por pagina cuando todavia no hay texto escrito.
  initialPageSize: 10,
};

const MAX_AI_DESCRIPTION_LENGTH = 450;
const INITIAL_POPULAR_NAMES = [
  'solicitud de rubrica de documentacion laboral para pymes y empleadores hasta 49 empleados',
  'contrato locacion de servicios - clausula modificatoria',
  'solicitud de certificado de domicilio real en caba',
  'presentacion agregar',
  'actualizacion del registro de empleadores',
  'solicitud de certificado de deudor alimentario',
  'solicitud de licencia de inhumacion',
  'contrato locacion de servicios',
  'inscripcion en el registro de defuncion para hospitales privados',
  'reempadronamiento de consorcios',
];
const SEARCH_STOPWORDS = new Set([
  'quiero', 'necesito', 'tengo', 'hacer', 'realizar', 'iniciar', 'obtener', 'sacar', 'pedir',
  'tramite', 'tramites', 'tramitar', 'gestion', 'gestionar', 'solicitud', 'solicitar',
  'una', 'uno', 'unos', 'unas', 'para', 'por', 'con', 'sin', 'del', 'los', 'las', 'que',
  'como', 'donde', 'cuando', 'sobre', 'este', 'esta', 'esto', 'mis', 'tus', 'sus',
]);

document.addEventListener('DOMContentLoaded', initApp);

// Inicializa la aplicacion, conecta eventos y precarga el catalogo.
function initApp() {
  const ui = getUi();

  ui.input.addEventListener('input', () => handleInput(ui));
  ui.input.addEventListener('keydown', event => {
    if (handleAutocompleteKeydown(ui, event)) return;
    if (event.key === 'Enter') runSearch(ui);
  });
  ui.input.addEventListener('blur', () => {
    window.setTimeout(() => hideAutocomplete(ui), 120);
  });
  ui.clearButton.addEventListener('click', () => {
    ui.input.value = '';
    ui.input.focus();
    handleInput(ui);
  });
  ui.searchButton.addEventListener('click', () => runSearch(ui));
  ui.aiToggle.addEventListener('click', () => toggleAI(ui));
  ui.suggestions.addEventListener('mousedown', event => applyAutocompleteSelection(ui, event));
  ui.pagination.addEventListener('click', event => handlePaginationClick(ui, event));

  updateAIToggle(ui);
  loadCatalog().then(() => {
    if (!ui.input.value.trim()) showInitialCatalog(ui, 1);
  });
  ui.input.focus();
}

// Obtiene y agrupa las referencias a elementos principales de la interfaz.
function getUi() {
  return Object.fromEntries(
    Object.entries(SELECTORS).map(([name, selector]) => [name, document.querySelector(selector)])
  );
}

// Carga el catalogo desde el backend y prepara el indice de busqueda local.
async function loadCatalog() {
  if (state.catalog) return state.catalog;

  try {
    const response = await fetch('/api/catalog');
    const data = await response.json();
    state.catalog = data.tramites || [];
    initFuse(state.catalog);
  } catch (error) {
    console.error('[TADI Search] Error cargando catalogo:', error);
    state.catalog = [];
  }

  return state.catalog;
}

// Inicializa Fuse.js para hacer busqueda aproximada por nombre y descripcion corta.
function initFuse(items) {
  if (typeof Fuse === 'undefined') return;

  state.fuse = new Fuse(items, {
    keys: [
      { name: 'nombre', weight: 0.55 },
      { name: 'descripcion', weight: 0.45 },
    ],
    threshold: 0.42,
    minMatchCharLength: 2,
    includeScore: true,
    ignoreLocation: true,
  });
}

// Reacciona a cambios en el input: limpia estados y muestra resultados predictivos.
function handleInput(ui) {
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

// Muestra el catalogo completo paginado cuando todavia no hay busqueda escrita.
function showInitialCatalog(ui, page = state.initialPage) {
  if (!state.catalog) {
    showLoadingCatalog(ui);
    loadCatalog().then(() => showInitialCatalog(ui, page));
    return;
  }

  state.initialResults = buildInitialCatalogResults();
  state.initialPage = getSafePage(page, state.initialResults.length);

  const pageSize = SEARCH_CONFIG.initialPageSize;
  const start = (state.initialPage - 1) * pageSize;
  const pageResults = state.initialResults.slice(start, start + pageSize);

  showResults(ui, pageResults, {
    mode: 'initial',
    page: state.initialPage,
    total: state.initialResults.length,
    totalPages: getTotalPages(state.initialResults.length),
  });
}

// Ordena el catalogo inicial: primeros los tramites mas usados, luego el resto por nombre.
function buildInitialCatalogResults() {
  const catalog = [...(state.catalog || [])];
  const byName = new Map(catalog.map(item => [normalize(item.nombre).trim(), item]));
  const pinned = [];
  const pinnedIds = new Set();

  for (const popularName of INITIAL_POPULAR_NAMES) {
    const item = byName.get(popularName);
    if (!item || pinnedIds.has(String(item.id))) continue;
    pinned.push(item);
    pinnedIds.add(String(item.id));
  }

  const rest = catalog
    .filter(item => !pinnedIds.has(String(item.id)))
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));

  return [...pinned, ...rest];
}

// Garantiza que la pagina pedida exista para el total actual.
function getSafePage(page, totalItems) {
  const totalPages = getTotalPages(totalItems);
  const current = Number(page);
  if (!Number.isFinite(current)) return 1;
  return Math.max(1, Math.min(totalPages, Math.trunc(current)));
}

// Calcula paginas totales para el listado inicial.
function getTotalPages(totalItems) {
  return Math.max(1, Math.ceil(totalItems / SEARCH_CONFIG.initialPageSize));
}

// Muestra hasta cinco nombres de tramites como sugerencias de autocompletado.
function renderAutocomplete(ui, results) {
  state.autocompleteSuggestions = buildAutocompleteSuggestions(results);
  state.autocompleteIndex = -1;

  if (!state.autocompleteSuggestions.length) {
    hideAutocomplete(ui);
    return;
  }

  ui.suggestions.innerHTML = state.autocompleteSuggestions
    .map((suggestion, index) => `
      <button class="autocomplete-item" type="button" role="option" data-index="${index}" aria-selected="false">
        <span>${renderAutocompleteSuggestionText(suggestion, ui.input.value)}</span>
      </button>`)
    .join('');
  ui.suggestions.classList.add('visible');
}

// Resalta en azul la parte de la sugerencia que coincide con lo escrito.
function renderAutocompleteSuggestionText(suggestion, query) {
  const range = findNormalizedTextRange(suggestion, query);
  if (!range) return escapeHtml(suggestion);

  return `${escapeHtml(suggestion.slice(0, range.start))}<span class="autocomplete-match">${escapeHtml(suggestion.slice(range.start, range.end))}</span>${escapeHtml(suggestion.slice(range.end))}`;
}

// Encuentra una coincidencia ignorando mayusculas y acentos, pero conserva indices del texto original.
function findNormalizedTextRange(value, query) {
  const needle = normalize(query).trim();
  if (!needle) return null;

  let haystack = '';
  const indexMap = [];

  for (let index = 0; index < value.length; index += 1) {
    const normalizedChar = normalize(value[index]);
    for (let charIndex = 0; charIndex < normalizedChar.length; charIndex += 1) {
      haystack += normalizedChar[charIndex];
      indexMap.push(index);
    }
  }

  const matchIndex = haystack.indexOf(needle);
  if (matchIndex < 0) return null;

  return {
    start: indexMap[matchIndex],
    end: indexMap[matchIndex + needle.length - 1] + 1,
  };
}

// Toma resultados predictivos y arma una lista corta sin nombres repetidos.
function buildAutocompleteSuggestions(results) {
  const seen = new Set();
  const suggestions = [];

  for (const item of results) {
    const name = String(item.nombre || '').trim();
    const key = normalize(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    suggestions.push(name);
    if (suggestions.length >= 5) break;
  }

  return suggestions;
}

// Oculta el panel de sugerencias y reinicia su seleccion interna.
function hideAutocomplete(ui) {
  state.autocompleteSuggestions = [];
  state.autocompleteIndex = -1;
  ui.suggestions.classList.remove('visible');
  ui.suggestions.innerHTML = '';
}

// Permite recorrer sugerencias con teclado y aceptar una con Enter.
function handleAutocompleteKeydown(ui, event) {
  if (!state.autocompleteSuggestions.length) return false;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveAutocompleteSelection(ui, 1);
    return true;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveAutocompleteSelection(ui, -1);
    return true;
  }

  if (event.key === 'Enter' && state.autocompleteIndex >= 0) {
    event.preventDefault();
    applyAutocompleteValue(ui, state.autocompleteSuggestions[state.autocompleteIndex]);
    return true;
  }

  if (event.key === 'Escape') {
    hideAutocomplete(ui);
    return true;
  }

  return false;
}

// Cambia la sugerencia resaltada cuando se navega con flechas.
function moveAutocompleteSelection(ui, direction) {
  const count = state.autocompleteSuggestions.length;
  state.autocompleteIndex = (state.autocompleteIndex + direction + count) % count;

  ui.suggestions.querySelectorAll('.autocomplete-item').forEach((item, index) => {
    const isActive = index === state.autocompleteIndex;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-selected', String(isActive));
  });
}

// Aplica la sugerencia clickeada sin ejecutar la busqueda con IA.
function applyAutocompleteSelection(ui, event) {
  const button = event.target.closest('.autocomplete-item');
  if (!button) return;

  event.preventDefault();
  const suggestion = state.autocompleteSuggestions[Number(button.dataset.index)];
  applyAutocompleteValue(ui, suggestion);
}

// Copia una sugerencia al input y recalcula los resultados predictivos.
function applyAutocompleteValue(ui, suggestion) {
  if (!suggestion) return;

  ui.input.value = suggestion;
  ui.input.focus();
  state.skipAutocompleteOnce = true;
  hideAutocomplete(ui);
  handleInput(ui);
}

// Busca tramites localmente usando Fuse.js o una coincidencia simple como respaldo.
function searchLocal(query, limit = SEARCH_CONFIG.predictiveVisibleLimit) {
  const searchQuery = buildSearchQuery(query);

  if (state.fuse) {
    return state.fuse.search(searchQuery)
      .slice(0, getLimit(limit))
      .map((result, index) => enrichPredictiveResult(result.item, result.score, index + 1));
  }

  const normalized = normalize(searchQuery);
  return (state.catalog || [])
    .filter(item => normalize(item.nombre).includes(normalized) || normalize(item.descripcion).includes(normalized))
    .slice(0, getLimit(limit))
    .map((item, index) => enrichPredictiveResult(item, null, index + 1));
}

// Ejecuta Fuse por umbral + embeddings top N y, si esta activo, pide la sugerencia de IA.
async function runSearch(ui) {
  const query = ui.input.value.trim();
  if (!query || state.searchPending) return;

  const catalog = await loadCatalog();
  if (!catalog.length) {
    showResultsError(ui, 'No se pudo cargar el catálogo.');
    return;
  }

  hideAI(ui);
  state.predictiveResults = searchLocal(query, SEARCH_CONFIG.predictiveVisibleLimit);
  state.embeddingResults = [];
  state.aiCandidates = [];
  state.aiSuggestedIds = new Set();
  setSearchButton(ui, true);
  showEmbeddingLoading(ui);

  try {
    state.embeddingResults = await searchByEmbedding(query);
    state.aiCandidates = buildAICandidates(query, state.predictiveResults, state.embeddingResults);

    if (state.aiEnabled && state.aiCandidates.length) {
      showResults(ui, state.aiCandidates, { mode: 'candidate' });
      await requestAISuggestion(ui, query, state.aiCandidates);
    } else {
      showResults(ui, getEmbeddingResultsForDisplay(), { mode: 'embedding' });
    }
  } catch (error) {
    state.embeddingResults = [];
    state.aiCandidates = state.predictiveResults.map((item, index) => ({ ...item, aiCandidateRank: index + 1 }));
    showResultsError(ui, error.message || 'No se pudo completar la búsqueda por embeddings.');
  } finally {
    setSearchButton(ui, false);
  }
}

// Llama al backend Node, que calcula la busqueda semantica integrada.
async function searchByEmbedding(query) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, top_k: SEARCH_CONFIG.embeddingVisibleLimit }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'No se pudo consultar la búsqueda por embeddings.');
  }

  return (data.resultados || [])
    .map((item, index) => enrichEmbeddingResult(item, index + 1));
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

// Devuelve resultados de Fuse por porcentaje o por palabras exactas en el nombre.
function getFuseCandidatesForSearch(predictiveResults, query) {
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

// Pide a Gemini una sugerencia usando candidatos recuperados por Fuse y embeddings.
async function requestAISuggestion(ui, query, candidates) {
  const aiCandidates = candidates.slice(0, getLimit(SEARCH_CONFIG.aiCandidatesSentLimit));

  showAI(ui, aiShell(`<div class="ai-loading">${ICONS.loader} Analizando con IA...</div>`));

  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, candidatos: aiCandidates.map(toAICandidate) }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al consultar la IA.');
    }

    if (!state.aiEnabled) return;
    renderAISuggestion(ui, data);
  } catch (error) {
    if (!state.aiEnabled) return;
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

// Devuelve los candidatos sin los tramites ya mostrados por IA.
function getVisibleCandidates() {
  if (!state.aiSuggestedIds.size) return state.aiCandidates;

  return state.aiCandidates
    .filter(item => !state.aiSuggestedIds.has(String(item.id)));
}

// Devuelve todos los resultados de embeddings, agregando datos de Fuse cuando el tramite tambien matcheo en predictiva.
function getEmbeddingResultsForDisplay() {
  const predictiveById = new Map(
    (state.predictiveResults || []).map(item => [String(item.id), item])
  );

  return (state.embeddingResults || []).map(item => {
    const predictiveItem = predictiveById.get(String(item.id));
    return predictiveItem ? mergeCandidate(predictiveItem, item) : item;
  });
}

// Arma el conjunto de IDs ya representados en la tarjeta de IA.
function buildAISuggestedIds(principal, alternatives) {
  const ids = new Set();

  if (principal) ids.add(String(principal.id));
  for (const alternative of alternatives) {
    ids.add(String(alternative.id));
  }

  return ids;
}

// Activa o desactiva las respuestas de IA.
function toggleAI(ui) {
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
function updateAIToggle(ui) {
  ui.aiToggle.classList.toggle('active', state.aiEnabled);
  ui.aiToggle.setAttribute('aria-pressed', String(state.aiEnabled));
}

// Muestra el estado inicial cuando no hay una busqueda activa.
function showEmpty(ui) {
  ui.emptyState.style.display = 'flex';
  ui.resultsMeta.style.display = 'none';
  hidePagination(ui);
  ui.results.innerHTML = '';
}

// Muestra un estado transitorio mientras se carga el catalogo.
function showLoadingCatalog(ui) {
  ui.emptyState.style.display = 'none';
  ui.resultsMeta.style.display = 'none';
  hidePagination(ui);
  ui.results.innerHTML = `<div class="ai-loading">${ICONS.loader} Cargando catálogo...</div>`;
}

// Muestra un estado transitorio mientras se consultan candidatos predictivos y semanticos.
function showEmbeddingLoading(ui) {
  ui.emptyState.style.display = 'none';
  ui.resultsMeta.style.display = 'none';
  hidePagination(ui);
  ui.results.innerHTML = `<div class="ai-loading">${ICONS.loader} Buscando candidatos...</div>`;
}

// Renderiza la lista de resultados o el mensaje de ausencia de resultados.
function showResults(ui, results, context = {}) {
  ui.emptyState.style.display = 'none';
  if (context.mode !== 'initial') hidePagination(ui);

  if (!results.length) {
    ui.resultsMeta.style.display = 'none';
    hidePagination(ui);
    const message = context.mode === 'candidate'
      ? 'Sin candidatos. Intentá con otras palabras.'
      : 'Sin resultados. Intentá con otras palabras o presioná Buscar.';
    ui.results.innerHTML = `<div class="state-no-results">${ICONS.empty} ${message}</div>`;
    return;
  }

  const suffix = context.mode === 'candidate'
    ? (IS_PRODUCTION_VIEW ? '' : ' candidatos para IA')
    : context.mode === 'predictive'
      ? (IS_PRODUCTION_VIEW ? '' : ' predictivos')
      : context.mode === 'embedding'
        ? (IS_PRODUCTION_VIEW ? '' : ' por embeddings')
      : '';
  ui.resultsMeta.style.display = 'block';
  const visibleResults = getVisibleResults(results, context);
  ui.resultsMeta.textContent = buildResultsMetaText(visibleResults, context, suffix);
  ui.results.innerHTML = visibleResults.map(item => renderCard(item, {
    showDebug: !IS_PRODUCTION_VIEW && (context.mode === 'candidate' || context.mode === 'predictive' || context.mode === 'embedding'),
    showFusePercent: !IS_PRODUCTION_VIEW && (context.mode === 'candidate' || context.mode === 'predictive' || context.mode === 'embedding'),
    showEmbeddingPercent: !IS_PRODUCTION_VIEW && (context.mode === 'candidate' || context.mode === 'embedding'),
  })).join('');
  if (context.mode === 'initial') renderPagination(ui, context);
}

// Define el texto del contador/listado segun la vista activa.
function buildResultsMetaText(visibleResults, context, suffix) {
  if (IS_PRODUCTION_VIEW) {
    if (context.mode === 'initial') {
      return `${context.total} trámite${context.total !== 1 ? 's' : ''} disponible${context.total !== 1 ? 's' : ''}`;
    }
    if (context.mode === 'candidate' && state.aiSuggestedIds.size) return 'Resultados más aproximados';
    return `${visibleResults.length} trámite${visibleResults.length !== 1 ? 's' : ''} disponible${visibleResults.length !== 1 ? 's' : ''}`;
  }

  if (context.mode === 'initial') {
    return `${context.total} trámite${context.total !== 1 ? 's' : ''} cargado${context.total !== 1 ? 's' : ''} - página ${context.page} de ${context.totalPages}`;
  }

  return `${visibleResults.length} resultado${visibleResults.length !== 1 ? 's' : ''} encontrado${visibleResults.length !== 1 ? 's' : ''}${suffix}`;
}

// Renderiza los controles de paginacion del catalogo inicial.
function renderPagination(ui, context) {
  const totalPages = Number(context.totalPages) || 1;
  const page = Number(context.page) || 1;

  if (totalPages <= 1) {
    hidePagination(ui);
    return;
  }

  ui.pagination.innerHTML = `
    <button type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Anterior</button>
    <span>Página ${page} de ${totalPages}</span>
    <button type="button" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>Siguiente</button>
  `;
  ui.pagination.style.display = 'flex';
}

// Oculta la paginacion cuando hay busqueda activa.
function hidePagination(ui) {
  ui.pagination.style.display = 'none';
  ui.pagination.innerHTML = '';
}

// Cambia de pagina en el catalogo inicial.
function handlePaginationClick(ui, event) {
  const button = event.target.closest('button[data-page]');
  if (!button || button.disabled) return;
  showInitialCatalog(ui, Number(button.dataset.page));
}

// Renderiza errores de busqueda dentro del area de resultados.
function showResultsError(ui, message) {
  ui.emptyState.style.display = 'none';
  ui.resultsMeta.style.display = 'none';
  hidePagination(ui);
  ui.results.innerHTML = `<div class="state-no-results">${ICONS.error} ${escapeHtml(message)}</div>`;
}

// Inserta y muestra el bloque de respuesta asistida por IA.
function showAI(ui, html) {
  ui.aiCard.innerHTML = html;
  ui.aiCard.style.display = 'block';
}

// Oculta el bloque de IA cuando el usuario vuelve a editar la busqueda o apaga el toggle.
function hideAI(ui) {
  ui.aiCard.style.display = 'none';
  ui.aiCard.innerHTML = '';
}

// Activa o desactiva el estado visual de carga del boton Buscar.
function setSearchButton(ui, loading) {
  state.searchPending = loading;
  ui.searchButton.classList.toggle('loading', loading);
  ui.searchButton.disabled = loading;
  ui.searchButton.querySelector('span').textContent = loading ? 'Buscando...' : 'Buscar con IA';
}

// Envuelve contenido de IA con el encabezado estandar de sugerencia.
function aiShell(content) {
  if (IS_PRODUCTION_VIEW) {
    return `<div class="ai-header"><img src="/production/assets/bi_stars.svg" alt="" aria-hidden="true"> Mejor resultado según IA</div>${content}`;
  }

  return `<div class="ai-header">${ICONS.brain} Sugerencia IA</div>${content}`;
}

// Construye el HTML de una tarjeta de tramite.
function renderCard(item, options = {}) {
  const classes = ['card'];
  if (options.principal) classes.push('card-principal');
  if (options.alt) classes.push('card-alt');

  const badges = [];
  if (options.showDebug && Number.isFinite(Number(item.fuseRank))) {
    badges.push(`<span class="badge badge-fuse">Predictiva #${Number(item.fuseRank)}</span>`);
  }

  if (options.showFusePercent) {
    badges.push(`<span class="badge badge-fuse-score">Fuse ${getFusePercent(item, true)}%</span>`);
  }

  if (options.showDebug && Number.isFinite(Number(item.embeddingRank))) {
    badges.push(`<span class="badge badge-score">Embedding #${Number(item.embeddingRank)}</span>`);
  }

  if (options.showEmbeddingPercent) {
    badges.push(`<span class="badge badge-score">Embedding ${getScorePercent(item, true)}%</span>`);
  }

  if (options.showDebug && Number.isFinite(Number(item.aiCandidateRank))) {
    badges.push(`<span class="badge badge-candidate">IA cand. #${Number(item.aiCandidateRank)}</span>`);
  }

  if (options.showDebug && item.exactNameWords) {
    badges.push('<span class="badge badge-text-match">Nombre exacto</span>');
  }

  if (options.principal && !IS_PRODUCTION_VIEW) {
    badges.push('<span class="badge badge-suggested">Sugerido</span>');
  }

  return `
    <article class="${classes.join(' ')}">
      ${badges.length ? `<div class="card-meta">${badges.join('')}</div>` : ''}
      ${IS_PRODUCTION_VIEW ? renderProductionTags(item, { suggested: options.principal }) : ''}
      <h2 class="card-title">${escapeHtml(item.nombre)}</h2>
      ${item.descripcion ? `<p class="card-desc">${escapeHtml(item.descripcion)}</p>` : ''}
      ${IS_PRODUCTION_VIEW ? renderProductionAccessLine() : ''}
    </article>`;
}

// Genera chips visuales simples para la vista produccion a partir del nombre del tramite.
function renderProductionTags(item, options = {}) {
  const terms = tokenizeExactWords(item.nombre)
    .filter(token => token.length >= 4)
    .slice(0, 3);

  if (!terms.length && !options.suggested) return '';

  const tags = terms.map(term => `<span>${escapeHtml(term.toUpperCase())}</span>`).join('');
  const suggested = options.suggested ? '<span class="badge-suggested">Sugerido</span>' : '';
  return `<div class="production-tags">${tags}${suggested}</div>`;
}

// Agrega la linea de nivel minimo visible en las tarjetas de produccion.
function renderProductionAccessLine() {
  return `<div class="production-access">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="7" cy="12" r="3"></circle>
      <path d="M10 12h10"></path>
      <path d="M16 12v3"></path>
      <path d="M19 12v2"></path>
    </svg>
    Nivel mínimo de acceso requerido: NIVEL 1
  </div>`;
}

// Agrega metadata de testing para resultados recuperados por Fuse.
function enrichPredictiveResult(item, fuseScore, fuseRank) {
  return {
    ...item,
    fuseRank,
    fuseScore: Number.isFinite(Number(fuseScore)) ? Number(fuseScore) : null,
    sources: ['fuse'],
  };
}

// Agrega metadata de testing para resultados recuperados por embeddings.
function enrichEmbeddingResult(item, embeddingRank) {
  return {
    ...item,
    embeddingRank,
    sources: ['embedding'],
  };
}

// Fusiona metadata cuando un tramite aparece por Fuse y embeddings.
function mergeCandidate(left, right) {
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

// Reduce cada candidato al minimo necesario antes de enviarlo al backend/IA.
function toAICandidate(item) {
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

// Busca un tramite por ID, priorizando candidatos enriquecidos para conservar metadata.
function findById(id) {
  const candidateItem = (state.aiCandidates || []).find(item => String(item.id) === String(id));
  if (candidateItem) return candidateItem;
  const embeddingItem = (state.embeddingResults || []).find(item => String(item.id) === String(id));
  if (embeddingItem) return embeddingItem;
  const predictiveItem = (state.predictiveResults || []).find(item => String(item.id) === String(id));
  if (predictiveItem) return predictiveItem;
  return (state.catalog || []).find(item => String(item.id) === String(id));
}

// Obtiene el porcentaje de similitud semantica para mostrarlo como acierto.
function getScorePercent(item, fallbackToZero = false) {
  const directPercent = Number(item?.scorePercent);
  if (Number.isFinite(directPercent)) return Math.max(0, Math.min(100, Math.round(directPercent)));

  const score = Number(item?.score);
  if (!Number.isFinite(score)) return fallbackToZero ? 0 : null;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

// Convierte el score de Fuse en una precision visual: en Fuse, mas bajo es mejor.
function getFusePercent(item, fallbackToZero = false) {
  const score = Number(item?.fuseScore);
  if (!Number.isFinite(score)) return fallbackToZero ? 0 : null;
  return Math.round(Math.max(0, Math.min(1, 1 - score)) * 100);
}

// Detecta si el nombre del tramite contiene todas las palabras relevantes de la busqueda.
function hasExactNameWords(query, item) {
  const queryTokens = tokenizeExactWords(query);
  if (!queryTokens.length) return false;

  const nameTokens = new Set(tokenizeExactWords(item.nombre));
  return queryTokens.every(token => nameTokens.has(token));
}

// Tokeniza palabras exactas para la regla sobre nombre, ignorando palabras muy cortas.
function tokenizeExactWords(value) {
  return normalize(value)
    .split(/[^a-z0-9]+/i)
    .filter(token => token.length >= 3 && !SEARCH_STOPWORDS.has(token));
}

// Reduce una frase natural a terminos utiles para Fuse, quitando palabras de intencion.
function buildSearchQuery(value) {
  const terms = tokenizeExactWords(value);
  return terms.length ? terms.join(' ') : String(value || '').trim();
}

// Aplica el limite visual segun el modo actual de resultados.
function getVisibleResults(results, context) {
  if (context.mode === 'candidate') {
    return results.slice(0, getLimit(SEARCH_CONFIG.searchVisibleLimit));
  }

  if (context.mode === 'predictive') {
    return results.slice(0, getLimit(SEARCH_CONFIG.predictiveVisibleLimit));
  }

  return results;
}

// Convierte null/undefined en "sin limite" para centralizar la configuracion.
function getLimit(value) {
  if (value === null || value === undefined) return Infinity;
  return Number.isFinite(Number(value)) ? Number(value) : Infinity;
}

// Normaliza texto para comparar sin mayusculas ni acentos.
function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Escapa texto dinamico antes de insertarlo como HTML.
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Recorta texto largo para evitar payloads innecesarios hacia Gemini.
function truncateForAI(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

// Genera iconos SVG inline con el grosor indicado.
function svg(content, strokeWidth = '2') {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}
