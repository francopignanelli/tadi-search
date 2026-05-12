# Paquete de busqueda semantica por embeddings

Este paquete contiene el servicio local necesario para sumar busqueda por embeddings a la app TADI Search.

## Que incluye

- `backend/app.py`: API FastAPI con `POST /buscar`.
- `backend/embeddings_tramites.json`: base ya vectorizada.
- `backend/search_core.py`: ranking por similitud coseno.
- `backend/modelo.py`: modelo `paraphrase-multilingual-MiniLM-L12-v2`.
- `backend/generar_embeddings.py`: regeneracion de embeddings desde `../data/Listado_tramites_PRD.json`.

La busqueda semantica usa `nombre` y `descripcion` corta. No usa `DESCRIPCION_HTML`.

## Ejecutar localmente

Desde esta carpeta:

```powershell
.\start-api.ps1
```

La API queda en:

```text
http://127.0.0.1:8000
```

Probar estado:

```text
GET http://127.0.0.1:8000/health
```

## Endpoint principal

```http
POST http://127.0.0.1:8000/buscar
Content-Type: application/json
```

Body:

```json
{
  "query": "quiero renovar licencia de conducir",
  "top_k": 50
}
```

Respuesta:

```json
{
  "query": "quiero renovar licencia de conducir",
  "resultados": [
    {
      "id": 1748,
      "nombre": "Renovacion de Conductores de Remises",
      "descripcion": "...",
      "score": 0.61
    }
  ]
}
```

## Integracion con la app

1. Mantener la busqueda predictiva JS para resultados mientras se escribe.
2. Cuando el usuario presiona Buscar o Enter, llamar a la busqueda por embeddings.
3. Usar esos resultados como candidatos.
4. Si el toggle IA esta activo, pasar hasta 6 candidatos a Gemini para que elija el tramite principal y hasta 3 alternativas.

## Regenerar embeddings

Si cambia `data/Listado_tramites_PRD.json`, ejecutar:

```powershell
cd paquete-embeddings-buscador
.\.venv\Scripts\python.exe backend\generar_embeddings.py
```

Tambien se puede indicar otra fuente con `TRAMITES_SOURCE`.

No se incluye ninguna clave de IA. Este paquete solo resuelve la busqueda semantica.
