// Estado compartido de la aplicacion. Se importa como referencia viva: las mutaciones
// de sus propiedades son visibles desde todos los modulos.

export const state = {
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
