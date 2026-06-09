# Desarrollo del flujo del buscador

Este documento describe el flujo actual del buscador TADI Search dividido en tres capas:

1. Busqueda predictiva.
2. Busqueda semantica/textual por embeddings y refuerzo de coincidencia.
3. Sugerencia con IA.

La idea central es que cada capa tenga un rol distinto. La busqueda predictiva da respuesta inmediata mientras se escribe. La busqueda semantica/textual es la busqueda principal cuando se presiona `Enter` o `Buscar`. La IA no busca en todo el catalogo: solo interpreta y recomienda entre los candidatos que ya encontraron Fuse y la busqueda semantica/textual.

Resumen actualizado y compartible: `BUSQUEDA_RANKING.md`.

## Datos base

El catalogo fuente es:

```text
data/Listado_tramites_PRD.json
```

Campos usados:

```text
ID
NOMBRE_TRAMITE
DESCRIPCION_CORTA
```

El campo `DESCRIPCION_HTML` no se usa en ninguna capa del buscador.

En el backend, `server.js` normaliza el catalogo a este formato:

```js
{
  id: item.id ?? item.ID,
  nombre: cleanText(item.nombre ?? item.NOMBRE_TRAMITE),
  descripcion: cleanText(item.descripcion ?? item.DESCRIPCION_CORTA),
}
```

Ese formato normalizado es el contrato comun que usan el frontend, la busqueda semantica/textual y la IA.

## 1. Busqueda predictiva

La busqueda predictiva ocurre mientras la persona escribe en el input. No espera a que se presione `Enter` ni el boton `Buscar`.

Archivo principal:

```text
public/js/app.js
```

El frontend carga el catalogo con:

```text
GET /api/catalog
```

Ese endpoint esta definido en:

```text
server.js
```

El backend lee `data/Listado_tramites_PRD.json`, normaliza los campos y devuelve el catalogo completo al navegador.

La busqueda predictiva usa la libreria:

```text
Fuse.js
```

Configuracion principal:

```js
state.fuse = new Fuse(items, {
  keys: [
    { name: 'nombre', weight: 0.55 },
    { name: 'descripcion', weight: 0.45 },
  ],
  threshold: 0.42,
  minMatchCharLength: 2,
  includeScore: true,
  ignoreLocation: true,
});
```

Campos usados por Fuse.js:

```text
nombre
descripcion
```

Esos campos vienen de:

```text
NOMBRE_TRAMITE
DESCRIPCION_CORTA
```

La busqueda predictiva no usa embeddings, no usa Gemini y no llama a ningun servicio externo. Trabaja en memoria dentro del navegador con el catalogo ya cargado.

Flujo:

```text
Usuario escribe
-> handleInput()
-> searchLocal()
-> Fuse.js busca en nombre y descripcion
-> se muestran los resultados predictivos segun SEARCH_CONFIG.predictiveVisibleLimit
```

Fragmento clave:

```js
function searchLocal(query) {
  if (state.fuse) {
    return state.fuse.search(query).slice(0, 15).map(result => result.item);
  }

  const normalized = normalize(query);
  return (state.catalog || [])
    .filter(item => normalize(item.nombre).includes(normalized) || normalize(item.descripcion).includes(normalized))
    .slice(0, 15);
}
```

El fallback simple se usa solo si Fuse.js no esta disponible.

## 2. Busqueda semantica/textual

La busqueda semantica/textual ocurre cuando la persona confirma la busqueda presionando `Enter` o haciendo clic en `Buscar`.

Archivos principales:

```text
public/js/app.js
server.js
src/semantic-search.js
data/embeddings_tramites.json
```

El frontend envia:

```text
POST /api/search
```

Con un cuerpo como:

```json
{
  "q": "Partida",
  "top_k": 50
}
```

En `public/js/app.js`, el envio se hace desde:

```js
async function searchByEmbedding(query) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, top_k: SEARCH_CONFIG.embeddingVisibleLimit }),
  });

  const data = await response.json();
  return data.resultados || [];
}
```

`SEARCH_CONFIG.embeddingVisibleLimit` vale:

```js
embeddingVisibleLimit: 50
```

### Embeddings integrados en Node

Antes habia un servicio Python/FastAPI separado. Ahora no hay servicio externo para embeddings.

La busqueda semantica esta integrada en Node usando:

```text
@huggingface/transformers
```

Modelo usado:

```text
Xenova/paraphrase-multilingual-MiniLM-L12-v2
```

Configuracion:

```js
const MODEL_ID = process.env.EMBEDDING_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const EMBEDDINGS_PATH = path.join(__dirname, '..', 'data', 'embeddings_tramites.json');
```

La libreria carga el modelo asi:

```js
extractorPromise = import('@huggingface/transformers')
  .then(({ pipeline }) => pipeline('feature-extraction', MODEL_ID));
```

Cuando llega una consulta, Node genera el embedding de ese texto:

```js
const output = await extractor(cleanText(text), {
  pooling: 'mean',
  normalize: true,
});
```

Luego compara ese vector contra los vectores ya guardados en:

```text
data/embeddings_tramites.json
```

Ese archivo contiene los embeddings precalculados de todos los tramites. Cada registro tiene:

```json
{
  "id": 1857,
  "nombre": "Solicitud de Partida",
  "descripcion": "...",
  "keywords": [],
  "embedding": []
}
```

El texto que se usa para generar cada embedding combina nombre, descripcion corta y palabras clave:

```js
function buildEmbeddingText(item) {
  const nombre = cleanText(item.nombre);
  const descripcion = cleanText(item.descripcion);
  const keywords = normalizeKeywords(item.keywords);
  const keywordsText = keywords.length
    ? `\n\nPalabras clave:\n${keywords.join(', ')}`
    : '';

  return `\nNombre:\n${nombre}\n\nDescripcion:\n${descripcion}${keywordsText}\n`;
}
```

Por lo tanto, los embeddings se basan en:

```text
NOMBRE_TRAMITE + DESCRIPCION_CORTA + keywords
```

No se usa `DESCRIPCION_HTML`.

### Comparacion semantica

La comparacion se hace con similitud coseno:

```js
score: cosineSimilarity(queryEmbedding, item.embedding, item.norm)
```

El resultado es un valor entre 0 y 1. Luego se transforma en porcentaje para mostrarlo en las tarjetas:

```js
function scoreToPercent(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return 0;
  return Math.round(clamp(numericScore, 0, 1) * 100);
}
```

Ese porcentaje hoy se mantiene como ayuda para testeo. No representa una certeza absoluta, sino una medida de coincidencia semantica/textual.

### Ranking semantico/textual

`src/semantic-search.js` calcula un ranking combinado.

Ese ranking combina:

```text
similitud semantica por embeddings
+
coincidencia textual sobre nombre, descripcion corta y keywords
```

La coincidencia textual se calcula en el backend, dentro de `src/semantic-search.js`, con `calculateLexicalScore()`.

No viene de Fuse.js. Fuse.js solo se usa para la busqueda predictiva del frontend.

Esta capa textual ayuda a corregir busquedas literales. Por ejemplo, si la persona busca `Partida`, el backend puede subir tramites cuyo nombre contiene `Partida`, aunque el score semantico puro no los haya dejado primeros. Tambien permite que una keyword curada, como `animal`, suba un tramite aunque esa palabra no este en el titulo.

Las keywords tienen peso alto dentro de esta capa textual, igual que las coincidencias fuertes en nombre y descripcion:

```text
nombre con todos los terminos relevantes
keywords con todos los terminos relevantes
descripcion con todos los terminos relevantes
combinacion de nombre + keywords + descripcion
```

Flujo completo de embeddings:

```text
Usuario presiona Enter o Buscar
-> public/js/app.js llama POST /api/search
-> server.js recibe q y top_k
-> src/semantic-search.js limpia la consulta y genera embedding de la consulta limpia
-> Node compara contra data/embeddings_tramites.json
-> server.js cruza resultados con Listado_tramites_PRD.json
-> src/semantic-search.js aplica ranking semantico/textual
-> frontend muestra resultados segun SEARCH_CONFIG
```

### Regeneracion de embeddings

Si cambia `data/Listado_tramites_PRD.json`, se regeneran los embeddings con:

```bash
npm run generate:embeddings
```

Script:

```text
scripts/generate-embeddings.js
```

Ese script usa el mismo modelo Node y vuelve a generar `data/embeddings_tramites.json`.

### Tutorial simple para agregar keywords y regenerar embeddings

1. Abrir:

```text
data/embeddings_tramites.json
```

2. Buscar el tramite por `id` o por `nombre`.

3. Completar el campo `keywords` con palabras o frases que una persona podria usar para encontrar ese tramite.

Ejemplo:

```json
{
  "id": 1856,
  "nombre": "Solicitud de Partida Urgentes",
  "descripcion": "...",
  "keywords": ["acta", "nacimiento", "defuncion", "matrimonio", "registro civil"],
  "embedding": []
}
```

Otro ejemplo:

```json
{
  "id": 1581,
  "nombre": "Inscripción en el Registro de Propietarios de Perros Potencialmente Peligrosos",
  "descripcion": "...",
  "keywords": ["animal", "mascota", "perro", "raza peligrosa"],
  "embedding": []
}
```

No hay que editar el array `embedding` manualmente.

4. Guardar el archivo.

5. Ejecutar:

```bash
npm run generate:embeddings
```

6. Reiniciar la app si estaba corriendo:

```bash
npm run search
```

El generador conserva las `keywords` que cargaste y recalcula los embeddings usando:

```text
nombre + descripcion + keywords
```

Despues de eso, las keywords ayudan por dos caminos:

```text
1. forman parte del embedding semantico;
2. refuerzan el ranking textual del backend.
```

## 3. Sugerencia con IA

La IA se ejecuta solo si el toggle `IA` esta activo.

La IA no reemplaza la busqueda por embeddings. La IA no recibe todo el catalogo. La IA no busca directamente en `Listado_tramites_PRD.json`.

La IA recibe solamente los mejores candidatos que ya devolvio `/api/search`.

Archivos principales:

```text
public/js/app.js
server.js
```

Servicio externo usado:

```text
Google Gemini API
```

Modelo por defecto:

```text
gemini-2.5-flash-lite
```

Configuracion:

```js
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
```

### Candidatos enviados a la IA

Despues de recibir los resultados de `/api/search`, el frontend toma los primeros `embeddingCandidatesForAI` para sumarlos como candidatos IA:

```js
const semanticCandidates = embeddingResults.slice(0, SEARCH_CONFIG.embeddingCandidatesForAI);
```

Donde:

```js
embeddingCandidatesForAI: 10
```

Cada candidato se reduce a lo minimo necesario:

```js
function toAICandidate(item) {
  return {
    id: item.id,
    nombre: item.nombre,
    descripcion: truncateForAI(item.descripcion, MAX_AI_DESCRIPTION_LENGTH),
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    scorePercent: getScorePercent(item, true),
    fusePercent: getFusePercent(item, true),
    embeddingRank: Number.isFinite(Number(item.embeddingRank)) ? Number(item.embeddingRank) : null,
    fuseRank: Number.isFinite(Number(item.fuseRank)) ? Number(item.fuseRank) : null,
    sources: Array.isArray(item.sources) ? item.sources : [],
  };
}
```

La descripcion enviada a la IA viene de:

```text
DESCRIPCION_CORTA
```

Y se recorta a:

```js
const MAX_AI_DESCRIPTION_LENGTH = 450;
```

No se envia `DESCRIPCION_HTML`.

Payload enviado al backend:

```json
{
  "q": "Partida",
  "candidatos": [
    {
      "id": 1857,
      "nombre": "Solicitud de Partida",
      "descripcion": "...",
      "keywords": ["acta", "registro civil"],
      "scorePercent": 99,
      "fusePercent": 88,
      "embeddingRank": 1,
      "fuseRank": 2,
      "sources": ["fuse", "embedding"]
    }
  ]
}
```

El backend vuelve a limitar candidatos por seguridad:

```js
const candidates = candidatos.slice(0, MAX_AI_CANDIDATES);
```

### Prompt enviado a Gemini

En `server.js`, `buildUserPrompt()` arma el texto que recibe Gemini.

Por cada candidato se envia:

```text
ID
Nombre
Acierto embedding
Palabras clave
Descripcion corta
```

Fragmento:

```js
return `ID ${item.id}: ${item.nombre}${score}${description}`;
```

La respuesta esperada es JSON:

```json
{
  "principal": { "id": "...", "razon": "explicacion breve para el usuario" },
  "alternativas": [{ "id": "...", "razon": "..." }],
  "explicacion": "Texto breve para mostrarle al usuario por que sugeris este tramite"
}
```

Reglas del prompt:

```text
- "principal" debe ser el tramite mas relevante.
- "alternativas" puede tener 0 a 3 tramites adicionales entre los candidatos.
- Si ningun candidato es relevante, devolve "principal": null y "alternativas": [].
- Los IDs deben coincidir exactamente con la lista de candidatos.
```

### Renderizado de IA

El frontend muestra:

```text
Sugerencia IA
-> tramite principal
-> hasta 3 alternativas
```

Luego evita repetir esos mismos tramites en la lista inferior de resultados por embeddings.

La deduplicacion se hace con IDs:

```js
return state.embeddingResults
  .filter(item => !state.aiSuggestedIds.has(String(item.id)));
```

Flujo completo de IA:

```text
/api/search devuelve resultados
-> si IA esta activa, frontend toma hasta 6 candidatos
-> frontend envia POST /api/ai
-> server.js arma prompt para Gemini
-> Gemini elige principal y alternativas
-> frontend muestra sugerencia IA
-> frontend oculta repetidos abajo
```

## Servicios y librerias usadas

### Node.js + Express

Usado como servidor principal. Expone:

```text
GET /api/catalog
POST /api/search
POST /api/ai
```

### Fuse.js

Usado solo en el navegador para busqueda predictiva rapida.

No participa en la busqueda por embeddings ni en la IA.

### @huggingface/transformers

Usado en Node para generar embeddings localmente.

No requiere levantar un servicio Python ni FastAPI.

Modelo:

```text
Xenova/paraphrase-multilingual-MiniLM-L12-v2
```

### Google Gemini API

Usado solo para la sugerencia opcional con IA.

La clave se toma desde:

```text
GEMINI_API_KEY
```

El navegador nunca recibe esa clave.

## Flujo resumido

```text
Usuario escribe
-> Fuse.js en frontend
-> resultados predictivos

Usuario presiona Enter o Buscar
-> POST /api/search
-> Node limpia la consulta y genera embedding de la consulta limpia
-> Node compara contra data/embeddings_tramites.json
-> Node aplica ranking semantico/textual
-> frontend muestra resultados

Si IA esta activa
-> frontend combina candidatos Fuse + top 10 de busqueda semantica/textual
-> POST /api/ai
-> Gemini elige principal y alternativas
-> frontend muestra sugerencia IA sin repetir tarjetas
```

## Decisiones importantes

- La busqueda predictiva se mantiene separada porque es instantanea y barata.
- La busqueda semantica/textual es el motor principal al confirmar la busqueda.
- La IA no se usa como motor de busqueda, sino como capa de interpretacion sobre candidatos ya filtrados.
- `DESCRIPCION_HTML` queda fuera para evitar ruido, HTML innecesario y payloads mas grandes.
- El score visible en tarjetas es la coincidencia combinada semantica/textual.
- El servicio Python/FastAPI fue eliminado para simplificar ejecucion, mantenimiento y despliegue.

## Comandos utiles

Ejecutar la app:

```bash
npm run search
```

Regenerar embeddings:

```bash
npm run generate:embeddings
```

Probar busqueda en Postman:

```text
POST http://localhost:3002/api/search
```

Body:

```json
{
  "q": "tengo un animal",
  "top_k": 5
}
```
