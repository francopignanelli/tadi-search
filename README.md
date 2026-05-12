# TADI Search Mockup

Mockup funcional para probar un buscador inteligente de tramites TAD. Combina busqueda predictiva en el navegador, ranking semantico por embeddings y una sugerencia opcional de IA.

No es una implementacion productiva ni reemplaza el buscador oficial. Esta pensado como material de validacion y presentacion.

## Que hace

- Carga el listado PRD desde `data/Listado_tramites_PRD.json`.
- Mantiene busqueda predictiva con Fuse.js mientras se escribe.
- Al presionar Enter o Buscar, consulta el ranking por embeddings.
- Muestra el porcentaje de acierto semantico en cada tarjeta del resultado por embeddings.
- Si el toggle `IA` esta activo, envia candidatos filtrados por embeddings a Gemini.
- Gemini devuelve un tramite principal y hasta 3 alternativas.

## Datos

El unico catalogo de tramites es `data/Listado_tramites_PRD.json`. Solo se leen estos campos:

```json
{
  "ID": 3,
  "NOMBRE_TRAMITE": "...",
  "DESCRIPCION_CORTA": "..."
}
```

`DESCRIPCION_HTML` no se usa para busqueda predictiva, embeddings ni sugerencias de IA.

## Como esta construida

- Servidor Node.js con Express.
- Interfaz estatica en `public/`.
- Servicio local FastAPI para embeddings en `paquete-embeddings-buscador/`.
- Fuse.js para resultados predictivos en el navegador.
- Google Gemini para la sugerencia opcional.

El servidor Node expone:

- `GET /api/catalog`: devuelve el listado PRD normalizado.
- `POST /api/search`: consulta el servicio local de embeddings y devuelve resultados con `score` y `scorePercent`.
- `POST /api/ai`: recibe la consulta y candidatos ya filtrados por embeddings, consulta Gemini y devuelve una recomendacion estructurada.

## Variables de entorno

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash-lite
EMBEDDING_SEARCH_URL=http://127.0.0.1:8000/buscar
PORT=3002
```

Si `GEMINI_API_KEY` no esta configurada, la busqueda por embeddings sigue funcionando y la sugerencia de IA muestra el aviso correspondiente.

## Ejecutar

1. Instalar dependencias Node:

```bash
npm install
```

2. Iniciar el servicio de embeddings en una terminal:

```powershell
npm run start:embeddings
```

3. Iniciar la app en otra terminal:

```bash
npm start
```

4. Abrir:

```text
http://localhost:3002
```

## Flujo de busqueda

1. Mientras se escribe, Fuse.js muestra coincidencias predictivas desde el listado PRD.
2. Al presionar Enter o Buscar, Node llama al servicio local de embeddings.
3. La app muestra los tramites ordenados por similitud semantica y el porcentaje de acierto.
4. Si `IA` esta activo, la app envia hasta 6 resultados por embeddings a Gemini.
5. Gemini elige el tramite principal y hasta 3 alternativas, siempre dentro de esos candidatos.

## Regenerar embeddings

Si cambia `data/Listado_tramites_PRD.json`, regenerar la base vectorizada:

```powershell
cd paquete-embeddings-buscador
.\.venv\Scripts\python.exe backend\generar_embeddings.py
```

El generador usa `NOMBRE_TRAMITE` y `DESCRIPCION_CORTA`; ignora `DESCRIPCION_HTML`.
