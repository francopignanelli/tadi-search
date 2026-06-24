// Autocompletado del buscador: sugerencias mientras se escribe, navegacion por teclado
// y aplicacion de una sugerencia al input.

import { state } from './state.js';
import { normalize } from './text.js';
import { escapeHtml } from './dom.js';

// Muestra hasta cinco nombres de tramites como sugerencias de autocompletado.
export function renderAutocomplete(ui, results) {
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
export function hideAutocomplete(ui) {
  state.autocompleteSuggestions = [];
  state.autocompleteIndex = -1;
  ui.suggestions.classList.remove('visible');
  ui.suggestions.innerHTML = '';
}

// Permite recorrer sugerencias con teclado y aceptar una con Enter.
export function handleAutocompleteKeydown(ui, event) {
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
export function applyAutocompleteSelection(ui, event) {
  const button = event.target.closest('.autocomplete-item');
  if (!button) return;

  event.preventDefault();
  const suggestion = state.autocompleteSuggestions[Number(button.dataset.index)];
  applyAutocompleteValue(ui, suggestion);
}

// Copia una sugerencia al input y dispara el flujo predictivo via evento input.
function applyAutocompleteValue(ui, suggestion) {
  if (!suggestion) return;

  ui.input.value = suggestion;
  ui.input.focus();
  state.skipAutocompleteOnce = true;
  hideAutocomplete(ui);
  ui.input.dispatchEvent(new Event('input'));
}
