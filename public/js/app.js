const SELECTORS = {
  input: '#search-input',
  clearButton: '#clear-btn',
  aiButton: '#ai-btn',
  emptyState: '#empty-state',
  aiCard: '#ai-card',
  resultsMeta: '#results-meta',
  results: '#results',
};

const ICONS = {
  brain: svg('<path d="M9.5 2a2.5 2.5 0 0 1 5 0v.5a2.5 2.5 0 0 1-5 0V2z"/><path d="M4.5 8a4 4 0 0 1 7.5-1.9A4 4 0 0 1 19.5 8"/><path d="M4.5 8v.5a4 4 0 0 0 4 4h7a4 4 0 0 0 4-4V8"/><path d="M8.5 12.5v4a2 2 0 0 0 4 0v-1"/><path d="M15.5 12.5v2a2 2 0 0 1-4 0"/>'),
  bulb: svg('<line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>'),
  empty: svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>', '1.5'),
  error: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  loader: svg('<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>', '2.5'),
};

const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'a', 'de', 'del', 'en', 'para', 'por',
  'con', 'sin', 'que', 'quiero', 'necesito', 'tengo', 'hacer', 'iniciar', 'realizar', 'obtener',
  'presentar', 'se', 'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'este', 'esta', 'esto', 'muy', 'mas', 'más',
  'pero', 'como', 'cómo', 'si', 'no', 'soy', 'es', 'son', 'ser', 'estar', 'algun', 'alguna', 'algún',
  'le', 'me', 'te', 'lo', 'al', 'sobre', 'entre', 'desde', 'hasta', 'hay', 'cuando', 'cuándo', 'donde',
  'dónde', 'tramite', 'tramites', 'tramitar', 'solicitud', 'solicitar', 'registro', 'registrar',
  'gestion', 'gestionar', 'permiso', 'permisos',
]);

const state = {
  catalog: null,
  fuse: null,
  aiPending: false,
};

const MAX_AI_CANDIDATES = 6;
const MAX_AI_DESCRIPTION_LENGTH = 450;

document.addEventListener('DOMContentLoaded', initApp);

// Inicializa la aplicacion, conecta eventos y precarga el catalogo.
function initApp() {
  const ui = getUi();

  ui.input.addEventListener('input', () => handleInput(ui));
  ui.input.addEventListener('keydown', event => {
    if (event.key === 'Enter') searchWithAI(ui);
  });
  ui.clearButton.addEventListener('click', () => {
    ui.input.value = '';
    ui.input.focus();
    handleInput(ui);
  });
  ui.aiButton.addEventListener('click', () => searchWithAI(ui));

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

// Inicializa Fuse.js para hacer busqueda aproximada por nombre y descripcion.
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

// Reacciona a cambios en el input: limpia estados y muestra resultados locales.
function handleInput(ui) {
  const query = ui.input.value.trim();
  ui.clearButton.style.display = query ? 'inline-flex' : 'none';
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

  showResults(ui, searchLocal(query));
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

// Arma una lista corta de candidatos para enviar a Gemini en vez del catalogo completo.
function buildAICandidates(query) {
  const fuzzyHits = searchLocal(query);
  const seenIds = new Set(fuzzyHits.map(item => item.id));
  const tokens = tokenize(query);

  if (!tokens.length) return fuzzyHits.slice(0, MAX_AI_CANDIDATES);

  const tokenHits = [];
  for (const item of state.catalog || []) {
    if (seenIds.has(item.id)) continue;

    const name = normalize(item.nombre);
    const description = normalize(item.descripcion);
    let score = 0;

    for (const token of tokens) {
      const stem = token.length >= 6 ? token.slice(0, 5) : token;
      if (name.includes(token)) score += 5;
      else if (name.includes(stem)) score += 4;
      else if (description.includes(token)) score += 3;
      else if (description.includes(stem)) score += 2;
    }

    if (score > 0) tokenHits.push({ item, score });
  }

  tokenHits.sort((a, b) => b.score - a.score);
  return [...fuzzyHits.slice(0, 4), ...tokenHits.slice(0, 4).map(hit => hit.item)]
    .slice(0, MAX_AI_CANDIDATES);
}

// Ejecuta la busqueda asistida por IA y coordina sus estados de carga y error.
async function searchWithAI(ui) {
  const query = ui.input.value.trim();
  if (!query || state.aiPending) return;

  const catalog = await loadCatalog();
  if (!catalog.length) {
    showAI(ui, `<div class="ai-error">${ICONS.error} No se pudo cargar el catálogo.</div>`);
    return;
  }

  const candidates = buildAICandidates(query);
  if (!candidates.length) {
    showAI(ui, aiShell(`<div class="ai-notfound">${ICONS.empty} No encontré trámites candidatos. Intentá con más detalle.</div>`));
    return;
  }

  setAIButton(ui, true);
  showAI(ui, aiShell(`<div class="ai-loading">${ICONS.loader} Analizando con IA...</div>`));

  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, candidatos: candidates.map(toAICandidate) }),
    });
    renderAISuggestion(ui, await response.json());
  } catch {
    showAI(ui, aiShell(`<div class="ai-error">${ICONS.error} Error al consultar la IA. Verificá la conexión.</div>`));
  } finally {
    setAIButton(ui, false);
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
    .map(alternative => ({ item: findById(alternative.id), reason: alternative.razon }))
    .filter(alternative => alternative.item);

  let content = '';
  if (data.explicacion) {
    content += `<div class="ai-exp">${ICONS.info} ${escapeHtml(data.explicacion)}</div>`;
  }
  if (principal) {
    content += `<div class="ai-principal-wrap">${renderCard(principal, { principal: true, reason: data.principal.razon })}</div>`;
  }
  if (alternatives.length) {
    content += '<div class="alts-label">También puede ser:</div><div class="alts-list">';
    content += alternatives.map(alternative => renderCard(alternative.item, { alt: true, reason: alternative.reason })).join('');
    content += '</div>';
  }

  showAI(ui, aiShell(content));
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

// Renderiza la lista de resultados locales o el mensaje de ausencia de resultados.
function showResults(ui, results) {
  ui.emptyState.style.display = 'none';

  if (!results.length) {
    ui.resultsMeta.style.display = 'none';
    ui.results.innerHTML = `<div class="state-no-results">${ICONS.empty} Sin resultados. Intentá con otras palabras o usá <strong>Buscar con IA</strong>.</div>`;
    return;
  }

  ui.resultsMeta.style.display = 'block';
  ui.resultsMeta.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''} encontrado${results.length !== 1 ? 's' : ''}`;
  ui.results.innerHTML = results.map(item => renderCard(item)).join('');
}

// Inserta y muestra el bloque de respuesta asistida por IA.
function showAI(ui, html) {
  ui.aiCard.innerHTML = html;
  ui.aiCard.style.display = 'block';
}

// Oculta el bloque de IA cuando el usuario vuelve a editar la busqueda.
function hideAI(ui) {
  ui.aiCard.style.display = 'none';
}

// Activa o desactiva el estado visual de carga del boton de IA.
function setAIButton(ui, loading) {
  state.aiPending = loading;
  ui.aiButton.classList.toggle('loading', loading);
  ui.aiButton.querySelector('span').textContent = loading ? 'Analizando...' : 'Buscar con IA';
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
  const suggestedBadge = options.principal
    ? '<div class="card-meta"><span class="badge badge-suggested">Sugerido</span></div>'
    : '';

  return `
    <article class="${classes.join(' ')}">
      ${suggestedBadge}
      <h2 class="card-title">${escapeHtml(item.nombre)}</h2>
      ${item.descripcion ? `<p class="card-desc">${escapeHtml(item.descripcion)}</p>` : ''}
      ${options.reason ? `<div class="card-reason">${ICONS.bulb} ${escapeHtml(options.reason)}</div>` : ''}
    </article>`;
}

// Reduce cada candidato al minimo necesario antes de enviarlo al backend/IA.
function toAICandidate(item) {
  return {
    id: item.id,
    nombre: item.nombre,
    descripcion: truncateForAI(item.descripcion, MAX_AI_DESCRIPTION_LENGTH),
  };
}

// Busca un tramite del catalogo por ID exacto.
function findById(id) {
  return (state.catalog || []).find(item => String(item.id) === String(id));
}

// Convierte una consulta en palabras utiles para ampliar la seleccion de candidatos.
function tokenize(query) {
  return normalize(query)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4 && !STOPWORDS.has(word));
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
