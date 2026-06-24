const fs = require('fs');

// Lectura de archivos JSON con cache invalidada por fecha de modificacion (mtime).
// Reemplaza el patron "leer una vez y cachear para siempre": si el archivo cambia en
// disco, la proxima lectura lo recarga sin necesidad de reiniciar el proceso.

const cache = new Map();

// Lee y parsea un JSON aplicando una transformacion opcional, reutilizando el resultado
// mientras el archivo no cambie en disco.
function readJsonCached(filePath, transform = value => value) {
  const { mtimeMs } = fs.statSync(filePath);
  const cached = cache.get(filePath);

  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.value;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const value = transform(raw);
  cache.set(filePath, { mtimeMs, value });

  return value;
}

// Limpia la cache (util en pruebas o recargas manuales).
function clearJsonCache() {
  cache.clear();
}

module.exports = {
  readJsonCached,
  clearJsonCache,
};
