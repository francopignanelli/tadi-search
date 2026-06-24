// Helpers de bajo nivel para el DOM: generacion de SVG inline, escape de HTML,
// normalizacion de limites e iconos reutilizables.

// Genera iconos SVG inline con el grosor indicado.
export function svg(content, strokeWidth = '2') {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}

// Escapa texto dinamico antes de insertarlo como HTML.
export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Convierte null/undefined en "sin limite" para centralizar la configuracion.
export function getLimit(value) {
  if (value === null || value === undefined) return Infinity;
  return Number.isFinite(Number(value)) ? Number(value) : Infinity;
}

export const ICONS = {
  brain: svg('<path d="M9.5 2a2.5 2.5 0 0 1 5 0v.5a2.5 2.5 0 0 1-5 0V2z"/><path d="M4.5 8a4 4 0 0 1 7.5-1.9A4 4 0 0 1 19.5 8"/><path d="M4.5 8v.5a4 4 0 0 0 4 4h7a4 4 0 0 0 4-4V8"/><path d="M8.5 12.5v4a2 2 0 0 0 4 0v-1"/><path d="M15.5 12.5v2a2 2 0 0 1-4 0"/>'),
  empty: svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>', '1.5'),
  error: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  loader: svg('<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>', '2.5'),
};
