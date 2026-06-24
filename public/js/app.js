// Punto de entrada de la interfaz. Solo arma las referencias del DOM, conecta los
// eventos y precarga el catalogo. La logica vive en los modulos importados.

import { SELECTORS } from './config.js';
import { loadCatalog } from './catalog.js';
import { showInitialCatalog, handlePaginationClick } from './render.js';
import { handleInput, runSearch, toggleAI, updateAIToggle } from './search.js';
import {
  handleAutocompleteKeydown,
  applyAutocompleteSelection,
  hideAutocomplete,
} from './autocomplete.js';

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
