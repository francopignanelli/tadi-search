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

module.exports = {
  cleanText,
  clamp,
  normalizeKeywords,
  scoreToPercent,
  truncateText,
};
