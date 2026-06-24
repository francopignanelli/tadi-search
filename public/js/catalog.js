// Catalogo del lado del cliente: carga desde el backend, indice Fuse.js para busqueda
// predictiva, busqueda local y armado del listado inicial paginado.

import { SEARCH_CONFIG, INITIAL_POPULAR_NAMES } from './config.js';
import { buildSearchQuery, normalize } from './text.js';
import { state } from './state.js';
import { getLimit } from './dom.js';
import { fetchCatalog } from './api.js';
import { enrichPredictiveResult } from './candidates.js';

// Carga el catalogo desde el backend y prepara el indice de busqueda local.
export async function loadCatalog() {
  if (state.catalog) return state.catalog;

  try {
    const data = await fetchCatalog();
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

// Busca tramites localmente usando Fuse.js o una coincidencia simple como respaldo.
export function searchLocal(query, limit = SEARCH_CONFIG.predictiveVisibleLimit) {
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

// Ordena el catalogo inicial: primeros los tramites mas usados, luego el resto por nombre.
export function buildInitialCatalogResults() {
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
export function getSafePage(page, totalItems) {
  const totalPages = getTotalPages(totalItems);
  const current = Number(page);
  if (!Number.isFinite(current)) return 1;
  return Math.max(1, Math.min(totalPages, Math.trunc(current)));
}

// Calcula paginas totales para el listado inicial.
export function getTotalPages(totalItems) {
  return Math.max(1, Math.ceil(totalItems / SEARCH_CONFIG.initialPageSize));
}
