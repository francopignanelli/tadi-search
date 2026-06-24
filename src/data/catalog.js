const config = require('../config');
const { readJsonCached } = require('./json-store');
const { cleanText, normalizeKeywords } = require('../text-utils');

// Repositorio del catalogo de tramites: lee data/Listado_tramites_PRD.json y lo
// normaliza al contrato minimo usado por frontend, embeddings e IA.

// Devuelve el catalogo normalizado, recargandolo si el archivo cambio en disco.
function getCatalog() {
  try {
    return readJsonCached(config.catalogPath, normalizeCatalog);
  } catch (error) {
    console.error(`[tadi-search] Error leyendo ${config.catalogPath}:`, error.message);
    return [];
  }
}

// Convierte el JSON PRD al contrato minimo { id, nombre, descripcion, keywords }.
function normalizeCatalog(rawCatalog) {
  if (!Array.isArray(rawCatalog)) return [];

  return rawCatalog
    .map(item => ({
      id: item.id ?? item.ID,
      nombre: cleanText(item.nombre ?? item.NOMBRE_TRAMITE),
      descripcion: cleanText(item.descripcion ?? item.DESCRIPCION_CORTA),
      keywords: normalizeKeywords(item.keywords),
    }))
    .filter(item => item.id !== undefined && item.id !== null && item.nombre);
}

module.exports = {
  getCatalog,
  normalizeCatalog,
};
