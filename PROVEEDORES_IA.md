# Comparativa de proveedores IA para TADI Search

Este analisis corresponde a una version mockup del buscador. El objetivo actual no es cerrar una arquitectura definitiva de produccion, sino medir el comportamiento real, entender el costo aproximado y optimizar el flujo antes de escalarlo.

La app busca reducir consumo enviando a la IA solamente tramites candidatos, previamente filtrados por busqueda predictiva y embeddings, en lugar de mandar el catalogo completo.

## Supuesto de consumo

Para estimar costos se toma una medicion real hecha en el mockup con la consulta:

- Consulta: `Quiero hacer una denuncia`.
- Candidatos enviados a IA: 18 tramites.
- Entrada: 2.371 tokens.
- Salida: 269 tokens.
- Total reportado por Gemini: 2.642 tokens.
- Unidad comparada: 1.000 busquedas con IA.

Esta medicion es una referencia inicial. El consumo puede variar segun la consulta, la cantidad de candidatos enviados y el largo de las descripciones. En esta etapa seguimos buscando optimizar el prompt, la cantidad de candidatos y los campos enviados.

La formula usada es:

```text
costo = (tokens_entrada / 1.000.000 * precio_entrada) + (tokens_salida / 1.000.000 * precio_salida)
```

## Tabla comparativa

| Opcion | Entrada / 1M tokens | Salida / 1M tokens | Costo aprox. cada 1.000 busquedas | Ventaja principal | Observacion |
|---|---:|---:|---:|---|---|
| Gemini 3.1 Flash-Lite | USD 0.25 | USD 1.50 | USD 1.00 | Menor costo para produccion | Mejor opcion costo/beneficio para este caso |
| Gemini 3 Flash | USD 0.50 | USD 3.00 | USD 1.99 | Mas calidad que Lite, sigue barato | Buena opcion si Lite responde flojo |
| OpenAI GPT-5.4 mini | USD 0.75 | USD 4.50 | USD 2.99 | Muy buen modelo chico generalista | Buen fallback, mas caro que Gemini |
| Claude Haiku 4.5 | USD 1.00 | USD 5.00 | USD 3.72 | Buen razonamiento liviano | Mas caro que Gemini/OpenAI mini |
| Gemini 3.5 Flash | USD 1.50 | USD 9.00 | USD 5.98 | Mas potente dentro de Gemini Flash | Probablemente innecesario para este buscador |
| OpenAI GPT-5.4 | USD 2.50 | USD 15.00 | USD 9.96 | Muy buena calidad | Demasiado para este caso |
| Claude Sonnet 4.6 | USD 3.00 | USD 15.00 | USD 11.15 | Mejor razonamiento | Caro para ranking de tramites |
| Claude Opus 4.7 | USD 5.00 | USD 25.00 | USD 18.58 | Modelo premium | No recomendado para esta app |

## Recomendacion

La opcion recomendada para esta app es Gemini Flash-Lite en plan pago.

Motivos:

- La tarea es acotada: elegir entre candidatos ya filtrados y redactar una respuesta breve.
- Es la alternativa mas economica entre las opciones utiles para este flujo.
- La aplicacion ya esta integrada con Gemini, por lo que el cambio operativo es minimo.
- En plan pago se evitan algunas limitaciones del nivel gratuito y se obtiene un escenario mas parecido a produccion.
- Permite seguir usando embeddings y Fuse.js como filtros previos para reducir tokens.
- En la medicion real del mockup, queda cerca de USD 1 cada 1.000 busquedas con IA.

## Estrategia sugerida

| Rol | Modelo sugerido |
|---|---|
| Principal | Gemini Flash-Lite |
| Fallback de mas calidad | Gemini Flash |
| Fallback externo | OpenAI GPT-5.4 mini |

## Modelos no recomendados para este caso

No usaria Claude Sonnet, Claude Opus, GPT-5.4 o GPT-5.5 como opcion principal salvo que el producto evolucione hacia tareas mucho mas complejas que ranking y explicacion de tramites.

Para este mockup, pagar modelos grandes agrega costo sin aportar una mejora proporcional.
