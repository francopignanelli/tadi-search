// Adaptador de las primitivas de texto/scoring compartidas con el servidor.
// La implementacion vive en shared/text-search.js (UMD) y se expone como window.TadiText.
// Se accede en tiempo de ejecucion para no depender del orden de carga de scripts.

export const normalize = value => window.TadiText.normalizeForSearch(value);
export const tokenizeExactWords = value => window.TadiText.tokenizeSearchTerms(value);
export const buildSearchQuery = value => window.TadiText.buildSearchQuery(value);
export const estimateTokenCount = value => window.TadiText.estimateTokenCount(value);
