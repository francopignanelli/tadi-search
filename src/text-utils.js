// Punto de entrada del servidor para las primitivas de texto/scoring.
// La implementacion vive en shared/text-search.js (modulo UMD, carpeta neutral) para que
// servidor y navegador compartan exactamente la misma logica sin duplicarla.
module.exports = require('../shared/text-search.js');
