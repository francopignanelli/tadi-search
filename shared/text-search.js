// Primitivas de texto y scoring compartidas entre el servidor (Node/CommonJS) y el
// navegador. Es la fuente unica de verdad: cualquier cambio de stopwords, normalizacion
// o tokenizacion se hace solo aca.
//
// Vive en una carpeta neutral (shared/) para no acoplar el backend al frontend. El server
// la sirve en /shared y el navegador la carga como script clasico que expone window.TadiText.
//
// Patron UMD: en Node se exporta por module.exports; en el navegador se expone como
// window.TadiText. No requiere build step.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TadiText = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Palabras de intencion que no aportan a la busqueda y se descartan al tokenizar.
  const SEARCH_STOPWORDS = new Set([
    'quiero', 'quisiera', 'deseo', 'necesito', 'necesitaria', 'tengo', 'busco', 'buscar', 'buscando',
    'hacer', 'realizar', 'iniciar', 'obtener', 'sacar', 'pedir', 'conseguir', 'ver', 'saber',
    'tramite', 'tramites', 'tramitar', 'gestion', 'gestionar', 'solicitud', 'solicitar',
    'una', 'uno', 'unos', 'unas', 'para', 'por', 'del', 'los', 'las', 'que',
    'como', 'donde', 'cuando', 'sobre', 'este', 'esta', 'esto', 'mis', 'tus', 'sus',
  ]);

  // Limpia espacios repetidos y convierte valores vacios en texto seguro.
  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  // Normaliza listas de palabras clave curatoriales, eliminando vacios y duplicados.
  function normalizeKeywords(value) {
    if (!Array.isArray(value)) return [];

    return [...new Set(
      value
        .map(item => cleanText(item))
        .filter(Boolean)
    )];
  }

  // Limita un numero al rango indicado.
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // Convierte un score de 0 a 1 en porcentaje legible de 0 a 100.
  function scoreToPercent(score) {
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore)) return 0;
    return Math.round(clamp(numericScore, 0, 1) * 100);
  }

  // Recorta textos largos para limitar el tamano del prompt enviado a IA.
  function truncateText(value, maxLength) {
    const text = cleanText(value);
    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
  }

  // Normaliza texto para comparar sin mayusculas ni acentos.
  function normalizeForSearch(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Tokeniza palabras relevantes de una consulta natural, quitando palabras de intencion.
  function tokenizeSearchTerms(value) {
    return normalizeForSearch(value)
      .split(/[^a-z0-9]+/i)
      .filter(token => token.length >= 3 && !SEARCH_STOPWORDS.has(token));
  }

  // Reduce una frase natural a terminos utiles para busquedas textuales o semanticas.
  function buildSearchQuery(value) {
    const terms = tokenizeSearchTerms(value);
    return terms.length ? terms.join(' ') : cleanText(value);
  }

  // Estimacion local de tokens para un texto, combinando heuristicas por caracteres y palabras.
  function estimateTokenCount(value) {
    const text = String(value || '').trim();
    if (!text) return 0;

    const words = text.split(/\s+/).filter(Boolean).length;
    const charsEstimate = Math.ceil(text.length / 4);
    const wordsEstimate = Math.ceil(words * 1.35);
    return Math.max(1, charsEstimate, wordsEstimate);
  }

  return {
    SEARCH_STOPWORDS,
    buildSearchQuery,
    cleanText,
    clamp,
    estimateTokenCount,
    normalizeForSearch,
    normalizeKeywords,
    scoreToPercent,
    tokenizeSearchTerms,
    truncateText,
  };
});
