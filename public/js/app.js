const SELECTORS = {
  input: '#search-input',
  clearButton: '#clear-btn',
  searchButton: '#search-btn',
  aiToggle: '#ai-toggle',
  emptyState: '#empty-state',
  aiCard: '#ai-card',
  resultsMeta: '#results-meta',
  results: '#results',
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
  aiPending: false,
  aiEnabled: true,
  embeddingResults: [],
  aiSuggestedIds: new Set(),
};

const MAX_EMBEDDING_RESULTS = 15;
const MAX_AI_CANDIDATES = 6;
const MAX_AI_DESCRIPTION_LENGTH = 450;

document.addEventListener('DOMContentLoaded', initApp);

// Inicializa la aplicacion, conecta eventos y precarga el catalogo.
function initApp() {
  const ui = getUi();

  ui.input.addEventListener('input', () => handleInput(ui));
  ui.input.addEventListener('keydown', event => {
    if (event.key === 'Enter') runSearch(ui);
  });
  ui.clearButton.addEventListener('click', () => {
    ui.input.value = '';
    ui.input.focus();
    handleInput(ui);
  });
  ui.searchButton.addEventListener('click', () => runSearch(ui));
  ui.aiToggle.addEventListener('click', () => toggleAI(ui));

  updateAIToggle(ui);
  loadCatalog();
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
  state.embeddingResults = [];
  state.aiSuggestedIds = new Set();
  hideAI(ui);

  if (!query) {
    showEmpty(ui);
    return;
  }

  if (!state.catalog) {
    showLoadingCatalog(ui);
    loadCatalog().then(() => handleInput(ui));
    return;
  }

  showResults(ui, searchLocal(query), { mode: 'predictive' });
}

// Busca tramites localmente usando Fuse.js o una coincidencia simple como respaldo.
function searchLocal(query) {
  if (state.fuse) {
    return state.fuse.search(query).slice(0, 15).map(result => result.item);
  }

  const normalized = normalize(query);
  return (state.catalog || [])
    .filter(item => normalize(item.nombre).includes(normalized) || normalize(item.descripcion).includes(normalized))
    .slice(0, 15);
}

// Ejecuta la busqueda por embeddings y, si esta activo, pide la sugerencia de IA.
async function runSearch(ui) {
  const query = ui.input.value.trim();
  if (!query || state.searchPending) return;

  const catalog = await loadCatalog();
  if (!catalog.length) {
    showResultsError(ui, 'No se pudo cargar el catálogo.');
    return;
  }

  hideAI(ui);
  state.aiSuggestedIds = new Set();
  setSearchButton(ui, true);
  showEmbeddingLoading(ui);

  try {
    const results = await searchByEmbedding(query);
    state.embeddingResults = results;
    showResults(ui, results, { mode: 'embedding' });

    if (state.aiEnabled && results.length) {
      await requestAISuggestion(ui, query, results);
    }
  } catch (error) {
    state.embeddingResults = [];
    showResultsError(ui, error.message || 'No se pudo completar la búsqueda por embeddings.');
  } finally {
    setSearchButton(ui, false);
  }
}

// Llama al backend Node, que a su vez consulta el servicio local de embeddings.
async function searchByEmbedding(query) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, top_k: MAX_EMBEDDING_RESULTS }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'No se pudo consultar la búsqueda por embeddings.');
  }

  return data.resultados || [];
}

// Pide a Gemini una sugerencia limitada a los resultados filtrados por embeddings.
async function requestAISuggestion(ui, query, results) {
  const candidates = results.slice(0, MAX_AI_CANDIDATES);

  setAIPending(true);
  showAI(ui, aiShell(`<div class="ai-loading">${ICONS.loader} Analizando con IA...</div>`));

  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, candidatos: candidates.map(toAICandidate) }),
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
  } finally {
    setAIPending(false);
  }
}

// Interpreta la respuesta de Gemini y construye la tarjeta de sugerencia.
function renderAISuggestion(ui, data) {
  if (data.error && data.fallback) {
    showAI(ui, aiShell(`<div class="ai-error">${ICONS.error} ${escapeHtml(data.error)}</div>`));
    return;
  }

  if (!data.principal) {
    showAI(ui, aiShell(`<div class="ai-notfound">${ICONS.empty} No encontré un trámite relevante. Intentá con más detalle.</div>`));
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
    content += `<div class="ai-principal-wrap">${renderCard(principal, { principal: true, showScore: true })}</div>`;
  }
  if (alternatives.length) {
    content += '<div class="alts-label">También puede ser:</div><div class="alts-list">';
    content += alternatives.map(alternative => renderCard(alternative, { alt: true, showScore: true })).join('');
    content += '</div>';
  }

  state.aiSuggestedIds = suggestedIds;
  showAI(ui, aiShell(content));
  showResults(ui, getVisibleEmbeddingResults(), { mode: 'embedding' });
}

// Devuelve los resultados de embeddings sin los tramites ya mostrados por IA.
function getVisibleEmbeddingResults() {
  if (!state.aiSuggestedIds.size) return state.embeddingResults;

  return state.embeddingResults
    .filter(item => !state.aiSuggestedIds.has(String(item.id)));
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
      showResults(ui, state.embeddingResults, { mode: 'embedding' });
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
  ui.results.innerHTML = '';
}

// Muestra un estado transitorio mientras se carga el catalogo.
function showLoadingCatalog(ui) {
  ui.emptyState.style.display = 'none';
  ui.resultsMeta.style.display = 'none';
  ui.results.innerHTML = `<div class="ai-loading">${ICONS.loader} Cargando catálogo...</div>`;
}

// Muestra un estado transitorio mientras se consulta el ranking semantico.
function showEmbeddingLoading(ui) {
  ui.emptyState.style.display = 'none';
  ui.resultsMeta.style.display = 'none';
  ui.results.innerHTML = `<div class="ai-loading">${ICONS.loader} Buscando por embeddings...</div>`;
}

// Renderiza la lista de resultados o el mensaje de ausencia de resultados.
function showResults(ui, results, context = {}) {
  ui.emptyState.style.display = 'none';

  if (!results.length) {
    ui.resultsMeta.style.display = 'none';
    const message = context.mode === 'embedding'
      ? 'Sin resultados por embeddings. Intentá con otras palabras.'
      : 'Sin resultados. Intentá con otras palabras o presioná Buscar.';
    ui.results.innerHTML = `<div class="state-no-results">${ICONS.empty} ${message}</div>`;
    return;
  }

  const suffix = context.mode === 'embedding' ? ' por embeddings' : '';
  ui.resultsMeta.style.display = 'block';
  ui.resultsMeta.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''} encontrado${results.length !== 1 ? 's' : ''}${suffix}`;
  ui.results.innerHTML = results.map(item => renderCard(item, { showScore: context.mode === 'embedding' })).join('');
}

// Renderiza errores de busqueda dentro del area de resultados.
function showResultsError(ui, message) {
  ui.emptyState.style.display = 'none';
  ui.resultsMeta.style.display = 'none';
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
  ui.searchButton.querySelector('span').textContent = loading ? 'Buscando...' : 'Buscar';
}

// Guarda el estado de carga de la IA.
function setAIPending(loading) {
  state.aiPending = loading;
}

// Envuelve contenido de IA con el encabezado estandar de sugerencia.
function aiShell(content) {
  return `<div class="ai-header">${ICONS.brain} Sugerencia IA</div>${content}`;
}

// Construye el HTML de una tarjeta de tramite.
function renderCard(item, options = {}) {
  const classes = ['card'];
  if (options.principal) classes.push('card-principal');
  if (options.alt) classes.push('card-alt');

  const badges = [];
  const scorePercent = getScorePercent(item);
  if (options.showScore && scorePercent !== null) {
    badges.push(`<span class="badge badge-score">Acierto ${scorePercent}%</span>`);
  }
  if (options.principal) {
    badges.push('<span class="badge badge-suggested">Sugerido</span>');
  }

  return `
    <article class="${classes.join(' ')}">
      ${badges.length ? `<div class="card-meta">${badges.join('')}</div>` : ''}
      <h2 class="card-title">${escapeHtml(item.nombre)}</h2>
      ${item.descripcion ? `<p class="card-desc">${escapeHtml(item.descripcion)}</p>` : ''}
    </article>`;
}

// Reduce cada candidato al minimo necesario antes de enviarlo al backend/IA.
function toAICandidate(item) {
  return {
    id: item.id,
    nombre: item.nombre,
    descripcion: truncateForAI(item.descripcion, MAX_AI_DESCRIPTION_LENGTH),
    scorePercent: getScorePercent(item),
  };
}

// Busca un tramite por ID, priorizando el resultado de embedding para conservar el score.
function findById(id) {
  const embeddingItem = (state.embeddingResults || []).find(item => String(item.id) === String(id));
  if (embeddingItem) return embeddingItem;
  return (state.catalog || []).find(item => String(item.id) === String(id));
}

// Obtiene el porcentaje de similitud semantica para mostrarlo como acierto.
function getScorePercent(item) {
  const directPercent = Number(item?.scorePercent);
  if (Number.isFinite(directPercent)) return Math.max(0, Math.min(100, Math.round(directPercent)));

  const score = Number(item?.score);
  if (!Number.isFinite(score)) return null;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
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
