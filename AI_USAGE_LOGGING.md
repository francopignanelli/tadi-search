# Registro de consumo de IA

La app registra cada llamado real a Gemini para entender que se envio y cuantos tokens informo la API.

## Donde se implementa

```text
src/gemini-service.js
  Ejecuta el llamado a Gemini y envia los datos de auditoria.

src/ai-usage-log.js
  Construye y guarda el registro de consumo.
```

## Archivos generados

Al usar la busqueda con IA, la app crea estos archivos:

```text
logs/ai-usage.md
logs/ai-usage.ndjson
```

`logs/ai-usage.md` esta pensado para lectura humana. Muestra fecha, modelo, consulta, candidatos enviados y tokens consumidos.
Al inicio incluye un diccionario de campos para entender que significa cada metrica. Los candidatos se muestran en una tabla compacta.

`logs/ai-usage.ndjson` esta pensado para analisis posterior. Cada linea es un JSON independiente con la misma informacion estructurada.

La carpeta `logs/` esta ignorada por Git porque cambia cada vez que se prueba la app.

## Que datos guarda

Por cada llamado se registra:

- Fecha y hora del llamado.
- Modelo usado.
- Si el llamado fue exitoso o fallo.
- Duracion aproximada.
- Consulta del usuario.
- Tokens estimados del texto que escribio el usuario.
- Cantidad total de candidatos enviados.
- Cantidad de candidatos que vienen de Fuse.
- Cantidad de candidatos que vienen de embeddings.
- Cantidad de candidatos que vienen de ambos metodos.
- Lista de candidatos enviados con `id`, `nombre`, origen y metricas de ranking disponibles.
- Cantidad de caracteres del prompt de sistema.
- Cantidad de caracteres del prompt de usuario.
- Tokens reportados por Gemini en `usageMetadata`.

## Tokens disponibles

Cuando Gemini lo informa, se guardan:

- `promptTokenCount`: tokens de entrada.
- `candidatesTokenCount`: tokens de salida.
- `totalTokenCount`: total consumido.
- `thoughtsTokenCount`: tokens internos de razonamiento, si el modelo los informa.
- `cachedContentTokenCount`: tokens leidos desde cache, si aplica.

`totalTokenCount` incluye prompt, razonamiento y respuesta. `cachedContentTokenCount` es parte de los tokens de entrada cacheados, por lo que no debe sumarse otra vez al total.

## Activar o desactivar el log

Por defecto el log esta activo.

Para desactivarlo:

```text
AI_USAGE_LOG_ENABLED=false
```

Para guardar los logs en otra carpeta:

```text
AI_USAGE_LOG_DIR=C:\ruta\personalizada\logs
```
