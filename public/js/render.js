// Renderizado de la interfaz: listado de resultados, tarjetas de tramite, paginacion,
// estados transitorios y contenedor de la respuesta de IA.

import { SEARCH_CONFIG, IS_PRODUCTION_VIEW } from './config.js';
import { state } from './state.js';
import { ICONS, escapeHtml, getLimit } from './dom.js';
import { tokenizeExactWords } from './text.js';
import { getScorePercent, getFusePercent } from './candidates.js';
import { loadCatalog, buildInitialCatalogResults, getSafePage, getTotalPages } from './catalog.js';

// Muestra el catalogo completo paginado cuando todavia no hay busqueda escrita.
export function showInitialCatalog(ui, page = state.initialPage) {
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

// Renderiza la lista de resultados o el mensaje de ausencia de resultados.
export function showResults(ui, results, context = {}) {
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
export function hidePagination(ui) {
  ui.pagination.style.display = 'none';
  ui.pagination.innerHTML = '';
}

// Cambia de pagina en el catalogo inicial.
export function handlePaginationClick(ui, event) {
  const button = event.target.closest('button[data-page]');
  if (!button || button.disabled) return;
  showInitialCatalog(ui, Number(button.dataset.page));
}

// Renderiza errores de busqueda dentro del area de resultados.
export function showResultsError(ui, message) {
  ui.emptyState.style.display = 'none';
  ui.resultsMeta.style.display = 'none';
  hidePagination(ui);
  ui.results.innerHTML = `<div class="state-no-results">${ICONS.error} ${escapeHtml(message)}</div>`;
}

// Muestra un estado transitorio mientras se carga el catalogo.
export function showLoadingCatalog(ui) {
  ui.emptyState.style.display = 'none';
  ui.resultsMeta.style.display = 'none';
  hidePagination(ui);
  ui.results.innerHTML = `<div class="ai-loading">${ICONS.loader} Cargando catálogo...</div>`;
}

// Muestra un estado transitorio mientras se consultan candidatos predictivos y semanticos.
export function showEmbeddingLoading(ui) {
  ui.emptyState.style.display = 'none';
  ui.resultsMeta.style.display = 'none';
  hidePagination(ui);
  ui.results.innerHTML = `<div class="ai-loading">${ICONS.loader} Buscando candidatos...</div>`;
}

// Inserta y muestra el bloque de respuesta asistida por IA.
export function showAI(ui, html) {
  ui.aiCard.innerHTML = html;
  ui.aiCard.style.display = 'block';
}

// Oculta el bloque de IA cuando el usuario vuelve a editar la busqueda o apaga el toggle.
export function hideAI(ui) {
  ui.aiCard.style.display = 'none';
  ui.aiCard.innerHTML = '';
}

// Activa o desactiva el estado visual de carga del boton Buscar.
export function setSearchButton(ui, loading) {
  state.searchPending = loading;
  ui.searchButton.classList.toggle('loading', loading);
  ui.searchButton.disabled = loading;
  ui.searchButton.querySelector('span').textContent = loading ? 'Buscando...' : 'Buscar con IA';
}

// Envuelve contenido de IA con el encabezado estandar de sugerencia.
export function aiShell(content) {
  if (IS_PRODUCTION_VIEW) {
    return `<div class="ai-header"><img src="/production/assets/bi_stars.svg" alt="" aria-hidden="true"> Mejor resultado según IA</div>${content}`;
  }

  return `<div class="ai-header">${ICONS.brain} Sugerencia IA</div>${content}`;
}

// Construye el HTML de una tarjeta de tramite.
export function renderCard(item, options = {}) {
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
    badges.push(`<span class="badge badge-score">Búsqueda #${Number(item.embeddingRank)}</span>`);
  }

  if (options.showEmbeddingPercent) {
    badges.push(`<span class="badge badge-score">Coincidencia ${getScorePercent(item, true)}%</span>`);
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
