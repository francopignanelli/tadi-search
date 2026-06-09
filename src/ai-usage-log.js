const fs = require('fs/promises');
const path = require('path');
const { truncateText } = require('./text-utils');

const DEFAULT_LOG_DIR = path.join(__dirname, '..', 'logs');
const MARKDOWN_LOG_FILE = 'ai-usage.md';
const JSON_LOG_FILE = 'ai-usage.ndjson';

// Indica si el registro de consumo IA esta habilitado por variables de entorno.
function isUsageLogEnabled() {
  return String(process.env.AI_USAGE_LOG_ENABLED || 'true').toLowerCase() !== 'false';
}

// Resuelve la carpeta donde se guardan los logs de consumo IA.
function getUsageLogDir() {
  return process.env.AI_USAGE_LOG_DIR
    ? path.resolve(process.env.AI_USAGE_LOG_DIR)
    : DEFAULT_LOG_DIR;
}

// Guarda una entrada de auditoria en formato humano y estructurado.
async function appendAIUsageLog(input) {
  if (!isUsageLogEnabled()) return null;

  const logDir = getUsageLogDir();
  const record = buildAIUsageRecord(input);

  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(path.join(logDir, JSON_LOG_FILE), `${JSON.stringify(record)}\n`, 'utf8');
  await appendMarkdownRecord(path.join(logDir, MARKDOWN_LOG_FILE), record);

  return record;
}

// Construye el objeto normalizado que se persiste en los logs.
function buildAIUsageRecord({
  query,
  model,
  candidates,
  requestPayload,
  responsePayload,
  startedAt,
  finishedAt,
  ok,
  error,
}) {
  const started = startedAt ? new Date(startedAt) : new Date();
  const finished = finishedAt ? new Date(finishedAt) : new Date();

  return {
    timestamp: finished.toISOString(),
    model,
    ok: Boolean(ok),
    durationMs: Math.max(0, finished.getTime() - started.getTime()),
    query,
    sent: summarizeSentData(query, candidates, requestPayload),
    usage: normalizeGeminiUsage(responsePayload?.usageMetadata),
    error: error ? String(error) : null,
  };
}

// Resume que datos se enviaron sin duplicar el payload completo ni guardar la API key.
function summarizeSentData(query, candidates = [], requestPayload = {}) {
  const systemPrompt = requestPayload?.systemInstruction?.parts
    ?.map(part => part.text || '')
    .join('\n') || '';
  const userPrompt = requestPayload?.contents
    ?.flatMap(content => content.parts || [])
    .map(part => part.text || '')
    .join('\n') || '';

  return {
    queryChars: String(query || '').length,
    queryEstimatedTokens: estimateTokenCount(query),
    systemPromptChars: systemPrompt.length,
    userPromptChars: userPrompt.length,
    payloadChars: JSON.stringify(requestPayload).length,
    candidatesCount: candidates.length,
    sourceBreakdown: summarizeCandidateSources(candidates),
    candidates: candidates.map(summarizeCandidate),
  };
}

// Calcula una estimacion local de tokens para el texto escrito por el usuario en el buscador.
function estimateTokenCount(value) {
  const text = String(value || '').trim();
  if (!text) return 0;

  const words = text.split(/\s+/).filter(Boolean).length;
  const charsEstimate = Math.ceil(text.length / 4);
  const wordsEstimate = Math.ceil(words * 1.35);
  return Math.max(1, charsEstimate, wordsEstimate);
}

// Cuenta de que metodo viene cada candidato enviado a Gemini.
function summarizeCandidateSources(candidates = []) {
  return candidates.reduce((summary, item) => {
    const sources = Array.isArray(item.sources) ? item.sources : [];
    const hasFuse = sources.includes('fuse');
    const hasEmbedding = sources.includes('embedding');

    if (hasFuse) summary.fuse += 1;
    if (hasEmbedding) summary.embedding += 1;
    if (hasFuse && hasEmbedding) summary.both += 1;
    if (!hasFuse && !hasEmbedding) summary.other += 1;

    return summary;
  }, { fuse: 0, embedding: 0, both: 0, other: 0 });
}

// Reduce cada candidato a los datos necesarios para entender el ranking enviado a IA.
function summarizeCandidate(item, index) {
  return {
    aiCandidateRank: index + 1,
    id: item.id,
    nombre: item.nombre,
    sources: Array.isArray(item.sources) ? item.sources : [],
    fuseRank: item.fuseRank ?? null,
    fuseScore: Number.isFinite(Number(item.fuseScore)) ? Number(item.fuseScore) : null,
    embeddingRank: item.embeddingRank ?? null,
    searchPercent: Number.isFinite(Number(item.scorePercent)) ? Number(item.scorePercent) : null,
    descriptionPreview: item.descripcion ? truncateText(item.descripcion, 160) : '',
  };
}

// Extrae los contadores de tokens que devuelve Gemini en usageMetadata.
function normalizeGeminiUsage(usageMetadata = {}) {
  return {
    promptTokenCount: usageMetadata.promptTokenCount ?? null,
    candidatesTokenCount: usageMetadata.candidatesTokenCount ?? null,
    totalTokenCount: usageMetadata.totalTokenCount ?? null,
    thoughtsTokenCount: usageMetadata.thoughtsTokenCount ?? null,
    cachedContentTokenCount: usageMetadata.cachedContentTokenCount ?? null,
  };
}

// Agrega la entrada en Markdown y crea el encabezado si el archivo no existe.
async function appendMarkdownRecord(filePath, record) {
  await ensureMarkdownHeader(filePath);
  await fs.appendFile(filePath, renderMarkdownRecord(record), 'utf8');
}

// Crea el encabezado o agrega el diccionario si el log ya existia con un formato anterior.
async function ensureMarkdownHeader(filePath) {
  try {
    const currentContent = await fs.readFile(filePath, 'utf8');
    if (!currentContent.trim()) {
      await fs.writeFile(filePath, buildMarkdownHeader(), 'utf8');
      return;
    }
    if (!currentContent.includes('## Diccionario de campos')) {
      await fs.writeFile(filePath, addDictionaryToExistingLog(currentContent), 'utf8');
    }
  } catch {
    await fs.writeFile(filePath, buildMarkdownHeader(), 'utf8');
  }
}

// Inserta el diccionario en logs creados con el formato anterior sin duplicar el titulo.
function addDictionaryToExistingLog(content) {
  const cleanContent = content.replace(/^\uFEFF/, '');

  if (!cleanContent.startsWith('# Registro de consumo IA')) {
    return `${buildMarkdownHeader()}\n${cleanContent}`;
  }

  const firstRecordIndex = cleanContent.indexOf('\n## ');
  if (firstRecordIndex === -1) {
    return `${cleanContent.trimEnd()}\n\n${buildMarkdownDictionary()}`;
  }

  const beforeRecords = cleanContent.slice(0, firstRecordIndex).trimEnd();
  const records = cleanContent.slice(firstRecordIndex).trimStart();
  return `${beforeRecords}\n\n${buildMarkdownDictionary()}\n${records}`;
}

// Devuelve el texto introductorio del log Markdown con una guia de lectura.
function buildMarkdownHeader() {
  return `# Registro de consumo IA

Este archivo se genera automaticamente al usar la busqueda con IA.

${buildMarkdownDictionary()}`;
}

// Explica el significado de cada metrica registrada en el log.
function buildMarkdownDictionary() {
  return `## Diccionario de campos

- **Modelo**: modelo de Gemini usado para responder.
- **Estado**: indica si Gemini respondio correctamente o si fallo el llamado.
- **Duracion**: tiempo aproximado que tardo el llamado a Gemini.
- **Consulta**: texto que escribio el usuario.
- **Tokens prompt usuario**: estimacion local de tokens del texto escrito en el buscador, sin candidatos ni instrucciones internas.
- **Candidatos enviados**: cantidad de tramites que se enviaron a Gemini para que elija.
- **Candidatos Fuse**: candidatos enviados que venian de la busqueda predictiva.
- **Candidatos embeddings**: candidatos enviados que venian de la busqueda semantica.
- **Candidatos por ambos**: candidatos enviados que aparecieron por Fuse y embeddings.
- **Caracteres prompt sistema**: longitud de las instrucciones internas que recibe Gemini.
- **Caracteres prompt usuario**: longitud del mensaje con consulta y candidatos.
- **Caracteres payload completo**: longitud total del cuerpo enviado a Gemini.
- **Tokens entrada**: tokens consumidos por lo enviado a Gemini.
- **Tokens salida**: tokens consumidos por la respuesta generada.
- **Tokens totales**: total reportado por Gemini. Incluye prompt, razonamiento y respuesta.
- **Tokens razonamiento**: tokens internos de razonamiento, si el modelo los informa. Ya estan incluidos en tokens totales.
- **Tokens cache**: parte del prompt que Gemini informa como cacheada. Ya esta incluida dentro de tokens entrada.
- **Origen**: metodo que recupero el tramite antes de llegar a IA. Puede ser Fuse, embeddings o ambos.
- **Fuse #**: posicion del tramite en la busqueda predictiva.
- **Busqueda #**: posicion del tramite en la busqueda semantica/textual.
- **Coincidencia %**: porcentaje combinado de coincidencia semantica/textual.

`;
}

// Renderiza una entrada de log legible para revision manual.
function renderMarkdownRecord(record) {
  const usage = record.usage || {};
  const sent = record.sent || {};
  const sourceBreakdown = sent.sourceBreakdown || {};
  const candidates = sent.candidates || [];
  const candidateRows = candidates.length
    ? candidates.map(renderCandidateTableRow).join('\n')
    : '| - | - | - | - | - | - | - |';

  return `## ${record.timestamp}

### Resumen del llamado

- Modelo: \`${record.model}\`
- Estado: ${record.ok ? 'OK' : 'Error'}
- Duracion: ${record.durationMs} ms
- Consulta: \`${record.query}\`
- Tokens prompt usuario: ${sent.queryEstimatedTokens ?? 'No informado'} estimados
- Candidatos enviados: ${sent.candidatesCount}
- Candidatos Fuse: ${sourceBreakdown.fuse ?? 0}
- Candidatos embeddings: ${sourceBreakdown.embedding ?? 0}
- Candidatos por ambos metodos: ${sourceBreakdown.both ?? 0}
- Caracteres prompt sistema: ${sent.systemPromptChars}
- Caracteres prompt usuario: ${sent.userPromptChars}
- Caracteres payload completo: ${sent.payloadChars}
- Tokens entrada: ${usage.promptTokenCount ?? 'No informado'}
- Tokens salida: ${usage.candidatesTokenCount ?? 'No informado'}
- Tokens totales: ${usage.totalTokenCount ?? 'No informado'}
- Tokens razonamiento: ${usage.thoughtsTokenCount ?? 'No informado'}
- Tokens cache: ${usage.cachedContentTokenCount ?? 'No informado'}
${record.error ? `- Error: ${record.error}\n` : ''}

### Candidatos enviados

| IA # | ID | Tramite | Origen | Fuse # | Busqueda # | Coincidencia % |
|---:|---|---|---|---:|---:|---:|
${candidateRows}

`;
}

// Renderiza un candidato como fila compacta para que el log no ocupe demasiado espacio.
function renderCandidateTableRow(candidate) {
  return [
    candidate.aiCandidateRank,
    candidate.id,
    escapeMarkdownTable(candidate.nombre),
    escapeMarkdownTable(candidate.sources.join(', ') || '-'),
    candidate.fuseRank || '-',
    candidate.embeddingRank || '-',
    candidate.searchPercent ?? '-',
  ].join(' | ').replace(/^/, '| ').replace(/$/, ' |');
}

// Evita que un caracter pipe dentro del texto rompa la tabla Markdown.
function escapeMarkdownTable(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

module.exports = {
  appendAIUsageLog,
  buildAIUsageRecord,
  normalizeGeminiUsage,
  summarizeSentData,
};
