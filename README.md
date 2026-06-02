# TADI Search Mockup

Mockup funcional para probar una mejora del buscador de tramites TAD. La app combina tres capas:

1. Busqueda predictiva con Fuse.js.
2. Busqueda semantica por embeddings.
3. Analisis y respuesta con IA usando Gemini.

No es una implementacion productiva ni reemplaza el buscador oficial. Esta pensado para validacion, testing y presentacion.

## Ejecutar localmente

```bash
npm install
npm start
```

Abrir:

```text
http://localhost:3002
```

Vistas disponibles:

```text
http://localhost:3002
http://localhost:3002/produccion
```

- `/`: vista de testing, con etiquetas de ranking y metricas.
- `/produccion`: vista limpia, sin etiquetas de Fuse, embeddings ni ranking IA.

Ya no hace falta levantar un servicio Python/FastAPI separado. Los embeddings corren desde Node.js.

## Variables de entorno

Crear `.env` a partir de `.env.example`:

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash-lite
EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2
PORT=3002
AI_USAGE_LOG_ENABLED=true
```

Si `GEMINI_API_KEY` no esta configurada, la busqueda predictiva y la busqueda por embeddings siguen funcionando. La sugerencia con IA muestra un aviso.

`AI_USAGE_LOG_ENABLED` activa el registro local de consumo de IA. Al buscar con IA, la app genera `logs/ai-usage.md` y `logs/ai-usage.ndjson` con fecha, candidatos enviados y tokens reportados por Gemini.

## Configuracion de busqueda

Los valores principales estan en `public/js/app.js`, dentro de `SEARCH_CONFIG`:

```js
const SEARCH_CONFIG = {
  predictiveVisibleLimit: null,
  fuseCandidateMinPercent: 46,
  includeExactNameWordsForAI: true,
  embeddingVisibleLimit: 50,
  embeddingCandidatesForAI: 10,
  aiCandidatesSentLimit: null,
  searchVisibleLimit: null,
};
```

- `predictiveVisibleLimit`: resultados visibles mientras se escribe. `null` muestra todos.
- `fuseCandidateMinPercent`: porcentaje minimo de Fuse para entrar como candidato al presionar Buscar.
- `includeExactNameWordsForAI`: tambien incluye tramites cuyo nombre contiene todas las palabras exactas de la busqueda.
- `embeddingVisibleLimit`: resultados de embeddings que se piden para visualizar y testear.
- `embeddingCandidatesForAI`: primeros resultados de embeddings que se suman como candidatos IA.
- `aiCandidatesSentLimit`: maximo de candidatos enviados a Gemini. `null` no corta despues de aplicar filtros.
- `searchVisibleLimit`: resultados visibles despues de presionar Buscar. `null` muestra todos los candidatos/resultados del modo activo.

## Flujo resumido

### 1. Fuse.js

Se ejecuta en el navegador mientras la persona escribe.
Antes de buscar, la app quita palabras de intencion como `quiero`, `hacer`, `necesito` o `tramite`, para que frases naturales busquen los terminos importantes.

Campos usados:

- `nombre`
- `descripcion`

Orden:

- Fuse.js ordena por menor score interno.
- En pantalla se muestra como `Fuse XX%`, donde mayor porcentaje es mejor.

Uso:

- Muestra resultados predictivos.
- Al presionar Buscar, aporta candidatos si `Fuse >= 46%`.
- Tambien aporta candidatos si `includeExactNameWordsForAI` esta activo y el nombre contiene todas las palabras exactas buscadas.

### 2. Embeddings

Se ejecuta desde Node.js contra `data/embeddings_tramites.json`.

Campos usados para generar embeddings:

- `nombre`
- `descripcion`
- `keywords`, si existen

Orden:

- Similitud coseno descendente.
- En pantalla se muestra como `Embedding XX%`.

Uso:

- Con IA apagada, se muestran hasta `embeddingVisibleLimit` resultados.
- Con IA encendida, se suman como candidatos IA los primeros `embeddingCandidatesForAI`.

### 3. IA

Gemini recibe solamente candidatos filtrados, no todo el catalogo.

Candidatos IA:

- Fuse: resultados con `Fuse >= fuseCandidateMinPercent` o coincidencia exacta de palabras en nombre.
- Embeddings: top `embeddingCandidatesForAI`.
- Se eliminan duplicados por `id`.

Gemini recibe por candidato:

- `id`
- `nombre`
- `descripcion` recortada
- `fuseRank`
- `fuseScore`
- `embeddingRank`
- `scorePercent`
- `sources`
- `keywords`

Orden:

- El frontend arma la lista con candidatos Fuse primero y luego suma embeddings no repetidos.
- Gemini elige el tramite principal y hasta 3 alternativas.

## Estructura

```text
server.js
src/catalog.js
src/gemini-service.js
src/semantic-search.js
src/text-utils.js
src/ai-usage-log.js
scripts/generate-embeddings.js
public/index.html
public/css/app.css
public/js/app.js
public/production/index.html
public/production/styles.css
public/production/assets/
data/Listado_tramites_PRD.json
data/embeddings_tramites.json
```

## Consumo de IA

La documentacion del registro de tokens esta en `AI_USAGE_LOGGING.md`.

La comparativa de proveedores pagos esta en `PROVEEDORES_IA.md`.

## Regenerar embeddings

Si cambia `data/Listado_tramites_PRD.json`:

```bash
npm run generate:embeddings
```

El generador usa `NOMBRE_TRAMITE` y `DESCRIPCION_CORTA`. No usa `DESCRIPCION_HTML`.
