# TADI Search Mockup

Mockup funcional para probar una mejora del buscador de tramites TAD. La app combina tres capas:

1. Busqueda predictiva con Fuse.js.
2. Busqueda semantica/textual con embeddings y refuerzo por coincidencia.
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
- `/produccion`: vista limpia, sin etiquetas visibles de Fuse, busqueda semantica/textual ni ranking IA.

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

Si `GEMINI_API_KEY` no esta configurada, la busqueda predictiva y la busqueda semantica/textual siguen funcionando. La sugerencia con IA muestra un aviso.

`AI_USAGE_LOG_ENABLED` activa el registro local de consumo de IA. Al buscar con IA, la app genera `logs/ai-usage.md` y `logs/ai-usage.ndjson` con fecha, candidatos enviados y tokens reportados por Gemini.

## Configuracion de busqueda

Los valores principales estan en `public/js/config.js`, dentro de `SEARCH_CONFIG`:

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
- `embeddingVisibleLimit`: resultados de busqueda semantica/textual que se piden para visualizar y testear.
- `embeddingCandidatesForAI`: primeros resultados de busqueda semantica/textual que se suman como candidatos IA.
- `aiCandidatesSentLimit`: maximo de candidatos enviados a Gemini. `null` no corta despues de aplicar filtros.
- `searchVisibleLimit`: resultados visibles despues de presionar Buscar. `null` muestra todos los candidatos/resultados del modo activo.

## Flujo resumido

La version detallada y compartible esta en `BUSQUEDA_RANKING.md`.

### 1. Fuse.js

Se ejecuta en el navegador mientras la persona escribe.
Antes de buscar, la app quita palabras de intencion como `quiero`, `busco`, `hacer`, `necesito` o `tramite`, para que frases naturales busquen los terminos importantes.

La limpieza convierte a minusculas, quita acentos, separa palabras, elimina tokens menores a 3 caracteres y remueve stopwords genericas. Ejemplo: `Necesito hacer una partida urgente` se busca como `partida urgente`.

Stopwords principales:

```text
quiero, quisiera, deseo, necesito, necesitaria, tengo, busco, buscar, buscando,
hacer, realizar, iniciar, obtener, sacar, pedir, conseguir, ver, saber,
tramite, tramites, tramitar, gestion, gestionar, solicitud, solicitar,
una, uno, unos, unas, para, por, del, los, las, que,
como, donde, cuando, sobre, este, esta, esto, mis, tus, sus
```

Nota: `con` y `sin` se quitaron a proposito de las stopwords porque invierten la intencion (por ejemplo, "certificado sin deuda" no debe reducirse a "certificado deuda").

No deben agregarse como stopwords palabras de dominio que cambian la intencion, como `alta`, `baja`, `urgente`, `licencia`, `certificado`, `partida` o `domicilio`.

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

### 2. Busqueda semantica/textual

Se ejecuta desde Node.js contra `data/embeddings_tramites.json`.

Campos usados para generar embeddings:

- `nombre`
- `descripcion`
- `keywords`, si existen

Orden:

- El backend limpia la consulta con las mismas stopwords usadas por Fuse.
- Genera el embedding de la consulta limpia.
- Calcula similitud coseno contra los vectores guardados.
- Suma un refuerzo textual si las palabras relevantes aparecen en `nombre`, `keywords` o `descripcion`.
- Ordena por el mejor score combinado de coincidencia semantica/textual.

Uso:

- Con IA apagada, se muestran hasta `embeddingVisibleLimit` resultados.
- Con IA encendida, se suman como candidatos IA los primeros `embeddingCandidatesForAI`.

### 3. IA

Gemini recibe solamente candidatos filtrados, no todo el catalogo.

La IA recibe la consulta original completa, no la consulta limpia. La consulta limpia se usa para recuperar candidatos; la original se usa para redactar una respuesta contextual. Ejemplo: si el usuario escribe `Necesito hacer una partida`, la IA recibe esa frase completa y puede responder con una explicacion del estilo `Si necesitas hacer una partida...`.

Candidatos IA:

- Fuse: resultados con `Fuse >= fuseCandidateMinPercent` o coincidencia exacta de palabras en nombre.
- Busqueda semantica/textual: top `embeddingCandidatesForAI`.
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

- El frontend arma la lista con candidatos Fuse primero y luego suma resultados de busqueda semantica/textual no repetidos.
- Gemini elige el tramite principal y hasta 3 alternativas.

## Debug en consola

Al presionar Buscar, la app registra en la consola del navegador el flujo completo, tanto en `/` como en `/produccion`.

Grupos principales:

```text
[TADI Search] Busqueda iniciada
[TADI Search] Resultados Fuse
[TADI Search] Candidatos Fuse que pasan filtro IA
[TADI Search] Request busqueda semantica/textual
[TADI Search] Top busqueda semantica/textual
[TADI Search] Candidatos combinados para IA
[TADI Search] Request IA
[TADI Search] Candidatos enviados a IA
[TADI Search] Respuesta IA
[TADI Search] Resumen tokens IA
============================== FIN BUSQUEDA TADI ==============================
```

## Estructura

El backend sigue una separacion por capas (configuracion, datos, servicios, rutas) y el frontend esta dividido en modulos ES.

```text
shared/text-search.js             Primitivas de texto/scoring compartidas backend + frontend (UMD, servido en /shared).
server.js                         Bootstrap: arma Express, monta middleware y rutas, levanta el server.
src/config.js                     Unica lectura de process.env: env, paths, limites y umbrales.
src/text-utils.js                 Re-export del modulo de texto compartido (fuente unica de verdad).
src/data/json-store.js            Lectura de JSON cacheada con invalidacion por mtime.
src/data/catalog.js               Repositorio del catalogo PRD.
src/data/embeddings.js            Repositorio de la base vectorizada.
src/services/embedding-service.js Pipeline de embeddings + similitud coseno + score lexical.
src/services/search-service.js    Orquesta la busqueda semantica y la mapea al catalogo.
src/services/gemini-service.js    Construye prompts, llama a Gemini y valida la respuesta.
src/services/ai-usage-log.js      Registra que se envio a Gemini y los tokens reportados.
src/routes/api.js                 express.Router con /api/catalog, /api/search, /api/ai y /produccion.
scripts/generate-embeddings.js    Regenera data/embeddings_tramites.json.

public/index.html                 Vista de testing.
public/production/index.html      Vista de presentacion limpia.
public/css/app.css                Estilos base.
public/production/styles.css      Capa visual de la vista de presentacion.
public/production/assets/         Imagenes e iconos de la vista de presentacion.

public/js/app.js                  Punto de entrada del frontend: init y wiring de eventos.
public/js/config.js               Constantes de UI (SELECTORS, SEARCH_CONFIG, modo de vista).
public/js/text.js                 Adaptador de las primitivas compartidas como modulo ES.
public/js/state.js                Estado compartido de la app.
public/js/dom.js                  Helpers de DOM: svg, escapeHtml, getLimit, ICONS.
public/js/api.js                  Cliente HTTP del backend.
public/js/candidates.js           Scoring, filtrado y fusion de candidatos.
public/js/logging.js              Logs del flujo de busqueda en consola.
public/js/catalog.js              Carga de catalogo, Fuse.js, busqueda local y listado inicial.
public/js/render.js               Renderizado de tarjetas, resultados, paginacion y tarjeta IA.
public/js/autocomplete.js         Sugerencias mientras se escribe y navegacion por teclado.
public/js/search.js               Orquestacion de input, busqueda y consulta a IA.

data/Listado_tramites_PRD.json    Catalogo fuente.
data/embeddings_tramites.json     Base vectorizada generada.
```

## Modificaciones para añadir tramites

La app no lee el Excel en ejecucion. Para agregar un tramite nuevo, hay que sumarlo al catalogo JSON y regenerar la base de embeddings.

Archivo a modificar:

```text
data/Listado_tramites_PRD.json
```

El archivo es un array JSON. Agregar un objeto nuevo con este formato:

```json
{
  "ID": 9999,
  "NOMBRE_TRAMITE": "Nombre visible del tramite",
  "DESCRIPCION_CORTA": "Descripcion breve que explique para que sirve el tramite y cuando corresponde usarlo.",
  "DESCRIPCION_HTML": "Texto completo del tramite, requisitos, documentacion y pasos. Puede quedar vacio si no esta disponible.",
  "keywords": [
    "palabra clave principal",
    "sinonimo frecuente",
    "forma comun en que lo busca el usuario"
  ]
}
```

Campos:

- `ID`: identificador unico. No debe repetirse.
- `NOMBRE_TRAMITE`: nombre oficial que ve el usuario.
- `DESCRIPCION_CORTA`: texto principal usado por Fuse, busqueda semantica e IA.
- `DESCRIPCION_HTML`: contenido largo informativo. Hoy no se usa para generar embeddings.
- `keywords`: opcional, pero recomendado para sinonimos, nombres informales, abreviaturas o frases frecuentes que no aparecen claramente en el nombre.

Despues de editar el JSON, regenerar embeddings:

```bash
npm run generate:embeddings
```

Esto actualiza:

```text
data/embeddings_tramites.json
```

El generador toma `NOMBRE_TRAMITE`, `DESCRIPCION_CORTA` y `keywords`. Si el tramite no tiene `keywords` en el catalogo, conserva las keywords previas del archivo de embeddings cuando existan.

El catalogo y los embeddings se cachean en memoria con invalidacion por fecha de modificacion (`src/data/json-store.js`): al cambiar los archivos JSON en disco, la app los recarga sola en la siguiente consulta, sin necesidad de reiniciar el servidor.

## Consumo de IA

La documentacion del registro de tokens esta en `AI_USAGE_LOGGING.md`.

La comparativa de proveedores pagos esta en `PROVEEDORES_IA.md`.

## Regenerar embeddings

Si cambia `data/Listado_tramites_PRD.json`:

```bash
npm run generate:embeddings
```

El generador usa `NOMBRE_TRAMITE`, `DESCRIPCION_CORTA` y `keywords`. No usa `DESCRIPCION_HTML`.
