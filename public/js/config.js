// Constantes de configuracion de la interfaz: selectores del DOM, parametros de busqueda
// y modo de vista (testing vs produccion).

export const SELECTORS = {
  input: '#search-input',
  clearButton: '#clear-btn',
  searchButton: '#search-btn',
  aiToggle: '#ai-toggle',
  suggestions: '#autocomplete-suggestions',
  emptyState: '#empty-state',
  aiCard: '#ai-card',
  resultsMeta: '#results-meta',
  results: '#results',
  pagination: '#pagination',
};

export const APP_MODE = document.body?.dataset?.appMode === 'production' ? 'production' : 'testing';
export const IS_PRODUCTION_VIEW = APP_MODE === 'production';

export const SEARCH_CONFIG = {
  // Cantidad de resultados que se muestran mientras se escribe, antes de presionar Buscar.
  // Usar null para mostrar todos los resultados que devuelva Fuse.js.
  predictiveVisibleLimit: null,

  // Porcentaje minimo de coincidencia Fuse para tomar un tramite como candidato al presionar Buscar.
  // Ejemplo: 46 significa "incluir tramites con Fuse 46% o mas".
  fuseCandidateMinPercent: 46,

  // Tambien toma como candidato los tramites cuyo nombre contiene todas las palabras exactas buscadas.
  // Solo revisa el nombre, no la descripcion, para evitar sumar demasiados tramites.
  includeExactNameWordsForAI: true,

  // Cantidad de resultados semanticos por embeddings que se piden al backend para visualizar/testear.
  // No implica que todos se envien a Gemini.
  embeddingVisibleLimit: 50,

  // Cantidad de resultados semanticos por embeddings que se suman como candidatos para Gemini.
  embeddingCandidatesForAI: 10,

  // Cantidad maxima de candidatos combinados que se mandan a Gemini.
  // Usar null para enviar todos los que pasen el umbral Fuse + los embeddings configurados.
  aiCandidatesSentLimit: null,

  // Cantidad de candidatos que se muestran en pantalla despues de presionar Buscar.
  // Usar null para mostrar todos los candidatos combinados.
  searchVisibleLimit: null,

  // Cantidad de tramites por pagina cuando todavia no hay texto escrito.
  initialPageSize: 10,
};

export const MAX_AI_DESCRIPTION_LENGTH = 450;

export const INITIAL_POPULAR_NAMES = [
  'solicitud de rubrica de documentacion laboral para pymes y empleadores hasta 49 empleados',
  'contrato locacion de servicios - clausula modificatoria',
  'solicitud de certificado de domicilio real en caba',
  'presentacion agregar',
  'actualizacion del registro de empleadores',
  'solicitud de certificado de deudor alimentario',
  'solicitud de licencia de inhumacion',
  'contrato locacion de servicios',
  'inscripcion en el registro de defuncion para hospitales privados',
  'reempadronamiento de consorcios',
];
