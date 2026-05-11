# TADI Search Mockup

Este proyecto es un mockup funcional para una propuesta de buscador inteligente de la plataforma TAD (Tramites a Distancia). El objetivo es mostrar como una persona podria escribir una necesidad en lenguaje natural y recibir tramites sugeridos a partir del catalogo disponible.

No es una implementacion productiva ni reemplaza el buscador oficial. Esta pensado como material de validacion y presentacion.

## Que hace

- Carga un catalogo unificado de tramites preparado en JSON.
- Permite buscar coincidencias mientras se escribe.
- Permite pedir una sugerencia asistida por IA para interpretar mejor la intencion del usuario.
- Devuelve un tramite principal y, cuando aplica, alternativas relacionadas.

## Como esta construida

La aplicacion tiene dos partes principales:

- Un servidor Node.js con Express.
- Una interfaz estatica servida desde la carpeta `public`.

El servidor expone dos endpoints:

- `GET /api/catalog`: lee `data/catalog_unificado.json` y devuelve el catalogo unificado.
- `POST /api/ai`: recibe la consulta del usuario y una lista corta de candidatos, consulta Google Gemini y devuelve una recomendacion estructurada.

El catalogo queda versionado directamente como JSON para simplificar la demo y evitar procesos de transformacion durante la ejecucion. El archivo Excel puede quedar en `data/` como respaldo o fuente original de referencia, pero la aplicacion no lo lee al iniciar ni durante las busquedas.

## Estructura del proyecto

```text
tadi-search/
  data/
    catalog_unificado.json
    Listado tramites HML.xlsx
  public/
    index.html
    css/app.css
    js/app.js
  .env.example
  package-lock.json
  package.json
  server.js
```

## Integracion con Google Gemini

La busqueda asistida por IA usa la API de Google Gemini. La clave se configura por variable de entorno:

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash-lite
PORT=3002
```

Si `GEMINI_API_KEY` no esta configurada, la aplicacion sigue funcionando con busqueda local, pero la sugerencia por IA devuelve un aviso de configuracion.

## Como funciona la sugerencia con IA

Para no enviar todo el catalogo a Gemini, la aplicacion hace primero una preseleccion local:

1. Busca coincidencias en el catalogo usando el texto ingresado.
2. Toma hasta 6 tramites candidatos.
3. Envia a Gemini solo la consulta del usuario y esos candidatos, con la descripcion recortada para reducir el consumo de tokens.
4. Gemini responde con JSON.
5. La aplicacion muestra el tramite principal y hasta 3 alternativas.

## Estructura del prompt

El prompt interno esta dividido en dos partes:

- Instruccion de sistema: define el rol de Gemini como asistente del sistema TAD y le pide responder unicamente con JSON valido.
- Mensaje de usuario: incluye la consulta escrita por la persona y la lista de tramites candidatos.

La respuesta esperada tiene esta forma:

```json
{
  "principal": {
    "id": "...",
    "razon": "explicacion breve para el usuario"
  },
  "alternativas": [
    {
      "id": "...",
      "razon": "..."
    }
  ],
  "explicacion": "texto breve para explicar la sugerencia"
}
```

Reglas principales del prompt:

- El tramite principal debe ser el mas relevante para la consulta.
- Las alternativas son opcionales y estan limitadas a 3.
- Si no hay un candidato relevante, `principal` debe ser `null`.
- Los IDs devueltos deben coincidir exactamente con los candidatos enviados.

El ID se usa solo como identificador tecnico para mapear la respuesta de Gemini contra el catalogo. No se muestra como dato relevante para el usuario.

## Datos del catalogo

El archivo principal de datos es `data/catalog_unificado.json`. Cada tramite contiene los campos minimos que necesita el mockup:

```json
{
  "id": "...",
  "nombre": "...",
  "descripcion": "..."
}
```

La descripcion corresponde a una version limpia del contenido HTML original. Se usa para mejorar la busqueda local y para darle mas contexto a Gemini, pero antes de enviarla a la API se recorta para mantener bajo el consumo.

## Como ejecutarlo

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env` a partir de `.env.example` y completar la clave de Gemini si se quiere probar la sugerencia por IA.

3. Iniciar la aplicacion:

```bash
npm start
```

4. Abrir:

```text
http://localhost:3002
```

## Notas para presentacion

Este mockup prioriza demostrar la experiencia de busqueda y la logica de recomendacion. La integracion con Gemini esta encapsulada en el servidor para no exponer la clave de API en el navegador.

## Notas para GitHub

El archivo `.env` no debe subirse al repositorio porque contiene configuracion local y puede incluir claves privadas. Para compartir la configuracion esperada se incluye `.env.example`.
