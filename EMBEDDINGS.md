# Busqueda por embeddings en TADI Search

## Resumen

La busqueda por embeddings permite encontrar tramites aunque la consulta del usuario no coincida exactamente con el nombre del tramite.

En una busqueda tradicional, si una persona escribe:

```text
quiero anotar a mi perro
```

el sistema busca coincidencias de palabras. Si el tramite oficial usa otra forma de nombrarlo, puede no aparecer bien posicionado.

Con embeddings, el texto se transforma en una representacion numerica del significado. Eso permite comparar la consulta con los tramites por cercania semantica.

## Que es un embedding

Un embedding es un vector: una lista de numeros que representa el significado aproximado de un texto.

Ejemplo conceptual:

```text
"renovar licencia de conducir" -> [0.12, -0.04, 0.88, ...]
"actualizar registro de conductor" -> [0.10, -0.02, 0.81, ...]
```

Si dos textos hablan de cosas parecidas, sus vectores tienden a quedar cerca. Si hablan de cosas distintas, quedan mas lejos.

No se compara palabra por palabra. Se compara una representacion matematica del contenido.

## Para que sirve en este mockup

En TADI Search se usa para mejorar el ranking de tramites.

Sirve especialmente cuando:

- El usuario no conoce el nombre exacto del tramite.
- Usa palabras distintas a las del catalogo.
- Escribe una necesidad en lenguaje natural.
- Hay varios tramites parecidos y se necesita ordenar por relevancia.

Ejemplos:

```text
quiero renovar mi licencia
registrar un perro peligroso
permiso para construir
actualizar datos de un tramite
```

## Herramienta utilizada

La implementacion actual usa:

```text
@huggingface/transformers
```

Modelo configurado:

```text
Xenova/paraphrase-multilingual-MiniLM-L12-v2
```

Donde esta configurado:

```js
// src/semantic-search.js
const MODEL_ID = process.env.EMBEDDING_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
```

Tambien puede configurarse desde `.env`:

```env
EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2
```

Este modelo corre localmente desde Node.js. Ya no hace falta levantar un servicio Python/FastAPI separado.

## Cuanto consume o cuanto cuesta

### Costo economico

La busqueda por embeddings de este proyecto no llama a una API paga para generar cada busqueda.

El modelo corre localmente con `@huggingface/transformers`, por lo que:

- No consume creditos de Gemini.
- No consume tokens de una API externa.
- No tiene costo por consulta.
- No envia la consulta del usuario a un servicio externo para calcular embeddings.

El costo real es computacional: CPU, memoria y tiempo de ejecucion en la maquina donde corre la app.

### Consumo tecnico

Hay dos momentos distintos:

1. Generacion de embeddings del catalogo.
2. Busqueda del usuario.

La generacion del catalogo es la parte mas pesada. Se ejecuta solo cuando cambia el archivo de tramites:

```bash
npm run generate:embeddings
```

Ese comando genera o actualiza:

```text
data/embeddings_tramites.json
```

Durante una busqueda normal, la app no vuelve a vectorizar todos los tramites. Solo:

1. Carga los embeddings ya guardados.
2. Genera el embedding de la consulta del usuario.
3. Compara esa consulta contra los embeddings existentes.
4. Ordena los resultados por similitud.

Esto hace que cada busqueda sea mucho mas liviana que recalcular todo el catalogo.

## Archivos involucrados

### Catalogo fuente

```text
data/Listado_tramites_PRD.json
```

Contiene los tramites originales.

Campos usados:

```json
{
  "ID": 3,
  "NOMBRE_TRAMITE": "...",
  "DESCRIPCION_CORTA": "..."
}
```

### Base de embeddings generada

```text
data/embeddings_tramites.json
```

Contiene los tramites ya vectorizados.

Estructura aproximada:

```json
{
  "id": 3,
  "nombre": "...",
  "descripcion": "...",
  "keywords": [],
  "embedding": [0.01, -0.02, 0.34]
}
```

### Logica principal de embeddings

```text
src/semantic-search.js
```

Responsabilidades:

- Cargar el modelo.
- Generar embeddings de textos.
- Leer `data/embeddings_tramites.json`.
- Calcular similitud entre vectores.
- Devolver resultados ordenados.

### Script de generacion

```text
scripts/generate-embeddings.js
```

Responsabilidades:

- Leer `data/Listado_tramites_PRD.json`.
- Normalizar los campos del tramite.
- Construir el texto que se va a vectorizar.
- Generar el embedding de cada tramite.
- Guardar `data/embeddings_tramites.json`.

### Endpoint de busqueda

```text
server.js
```

Endpoint:

```http
POST /api/search
```

Responsabilidades:

- Recibir la busqueda del frontend.
- Ejecutar `searchWithEmbeddings()`.
- Combinar score semantico con coincidencia textual.
- Devolver resultados al navegador.

## Como se generan los embeddings

Comando:

```bash
npm run generate:embeddings
```

Implementacion:

```js
// scripts/generate-embeddings.js
const {
  EMBEDDINGS_PATH,
  MODEL_ID,
  buildEmbeddingText,
  createEmbedding,
  normalizeKeywords,
} = require('../src/semantic-search');
```

El script lee el catalogo:

```js
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'Listado_tramites_PRD.json');
const rawCatalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const catalog = normalizeCatalog(rawCatalog);
```

Luego, por cada tramite, arma el texto y genera el vector:

```js
output.push({
  id: item.id,
  nombre: item.nombre,
  descripcion: item.descripcion,
  keywords,
  embedding: await createEmbedding(buildEmbeddingText(embeddingInput)),
});
```

Finalmente guarda el archivo:

```js
fs.writeFileSync(EMBEDDINGS_PATH, nextContent, 'utf8');
```

## Que texto se vectoriza

El texto de cada tramite se arma en:

```js
// src/semantic-search.js
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

Es decir, el embedding de cada tramite se genera usando:

- Nombre del tramite.
- Descripcion corta.
- Palabras clave, si existieran.

Actualmente no se usa `DESCRIPCION_HTML`.

## Como se ejecuta una busqueda

Cuando el usuario presiona Buscar, el frontend llama al backend:

```js
// public/js/app.js
async function searchByEmbedding(query) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, top_k: MAX_EMBEDDING_RESULTS }),
  });

  const data = await response.json();
  return data.resultados || [];
}
```

El backend recibe esa consulta:

```js
// server.js
app.post('/api/search', async (req, res) => {
  const { q, top_k: requestedTopK } = req.body || {};
  const query = String(q).slice(0, MAX_QUERY_LENGTH);
  const topK = clamp(Number(requestedTopK) || 15, 1, MAX_EMBEDDING_CANDIDATES);

  const catalog = getCatalog();
  const catalogById = new Map(catalog.map(item => [String(item.id), item]));
  const search = await searchWithEmbeddings(query, topK);
  const resultados = (search.resultados || [])
    .map(item => normalizeEmbeddingResult(item, catalogById))
    .filter(Boolean)
    .slice(0, topK);

  res.json({ query, resultados, total: resultados.length });
});
```

La busqueda semantica real esta en:

```js
// src/semantic-search.js
async function searchWithEmbeddings(query, topK) {
  const records = loadEmbeddings();
  const queryEmbedding = await createEmbedding(query);

  const resultados = records
    .filter(item => item.embedding.length === queryEmbedding.length)
    .map(item => ({
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      keywords: item.keywords,
      score: cosineSimilarity(queryEmbedding, item.embedding, item.norm),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { query, resultados };
}
```

## Como se comparan los textos

La comparacion se hace con similitud coseno.

Implementacion:

```js
// src/semantic-search.js
function cosineSimilarity(left, right, rightNorm = vectorNorm(right)) {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNormSquared = 0;

  for (let index = 0; index < length; index += 1) {
    const a = Number(left[index]) || 0;
    const b = Number(right[index]) || 0;
    dot += a * b;
    leftNormSquared += a * a;
  }

  const leftNorm = Math.sqrt(leftNormSquared);
  if (!leftNorm || !rightNorm) return 0;

  return dot / (leftNorm * rightNorm);
}
```

En terminos simples:

- Score alto: el texto del usuario y el tramite estan cerca semanticamente.
- Score bajo: hablan de cosas menos parecidas.

## Como se combina con Fuse.js

La app ya no usa una formula de ranking hibrido con pesos globales. El flujo actual es mas explicito:

```text
Fuse.js por umbral de porcentaje
+ embeddings top 10
- duplicados
= candidatos para Gemini
```

Esto mantiene separadas las senales:

- Fuse.js aporta precision textual y predictiva.
- Embeddings aporta similitud semantica.
- Gemini decide entre candidatos reales del catalogo.

En el frontend se unifican los candidatos:

```js
// public/js/app.js
function buildAICandidates(predictiveResults, embeddingResults) {
  const byId = new Map();

  for (const item of predictiveResults.slice(0, MAX_PREDICTIVE_RESULTS)) {
    byId.set(String(item.id), { ...item });
  }

  for (const item of embeddingResults.slice(0, MAX_EMBEDDING_RESULTS)) {
    const id = String(item.id);
    const existing = byId.get(id);
    byId.set(id, existing ? mergeCandidate(existing, item) : { ...item });
  }

  return [...byId.values()]
    .slice(0, MAX_AI_CANDIDATES)
    .map((item, index) => ({ ...item, aiCandidateRank: index + 1 }));
}
```

Para testing, cada tarjeta puede mostrar:

- `Predictiva #N`
- `Fuse XX%`
- `Embedding #N`
- `Embedding XX%`
- `IA cand. #N`

## Relacion con Gemini

Embeddings y Gemini cumplen roles distintos.

Embeddings:

- Ordenan el catalogo por similitud.
- Corren localmente.
- No tienen costo por token.
- Sirven para elegir buenos candidatos.

Gemini:

- Recibe pocos candidatos.
- Decide cual parece ser el tramite principal.
- Redacta una explicacion breve.
- Si usa API externa y puede consumir tokens.

El flujo actual es:

```text
Consulta del usuario
  -> Fuse.js por umbral de porcentaje
  -> embeddings top 10
  -> union sin duplicados
  -> candidatos con metadata de origen
  -> Gemini
  -> tramite principal + alternativas
```

Esto es importante: Gemini no recibe todo el catalogo. Recibe una lista chica, ya filtrada.

## Ventajas

- Mejora resultados cuando el usuario no conoce el nombre exacto.
- Reduce dependencia de coincidencias literales.
- Puede correr localmente sin costo por consulta.
- Permite usar Gemini con menos tokens porque primero filtra candidatos.
- Mantiene control sobre el catalogo: la IA solo decide entre tramites existentes.

## Limitaciones

- El ranking semantico no garantiza que el primer resultado sea correcto.
- Si la descripcion del tramite es pobre, el embedding tambien puede ser pobre.
- Si cambia el catalogo, hay que regenerar `data/embeddings_tramites.json`.
- La primera carga del modelo puede tardar mas que las busquedas siguientes.
- El modelo local consume CPU y memoria de la maquina.

## Comandos utiles

Ejecutar la app:

```bash
npm start
```

Regenerar embeddings:

```bash
npm run generate:embeddings
```

Configurar modelo:

```env
EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2
```

## Resumen tecnico corto

La busqueda por embeddings esta implementada en Node.js usando `@huggingface/transformers`. El catalogo se vectoriza previamente y se guarda en `data/embeddings_tramites.json`. En cada busqueda, solo se vectoriza la consulta del usuario, se compara contra los vectores guardados con similitud coseno y se devuelve un ranking semantico. El frontend combina ese top semantico con el top predictivo de Fuse.js y envia los candidatos resultantes a Gemini.
