// Cliente HTTP del backend. Funciones puras de red, sin logica de UI ni de estado.

// Trae el catalogo completo de tramites.
export async function fetchCatalog() {
  const response = await fetch('/api/catalog');
  return response.json();
}

// Ejecuta la busqueda semantica/textual por embeddings en el backend.
export async function postSearch(query, topK) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, top_k: topK }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'No se pudo consultar la búsqueda por embeddings.');
  }

  return data;
}

// Pide a Gemini la mejor sugerencia entre los candidatos ya filtrados.
export async function postAI(query, candidatos) {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, candidatos }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Error al consultar la IA.');
  }

  return data;
}
