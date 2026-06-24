# Flujo de busqueda y ranking

Este resumen describe como se recuperan, ordenan y envian candidatos en TADI Search.

## 1. Limpieza de consulta

Antes de buscar, la app reduce frases naturales a terminos relevantes quitando stopwords o palabras de intencion.

La limpieza se hace asi:

```text
1. Convierte el texto a minusculas.
2. Quita acentos.
3. Separa el texto en palabras.
4. Elimina tokens de menos de 3 caracteres.
5. Elimina stopwords genericas de intencion o conectores.
6. Vuelve a unir los terminos relevantes.
```

Ejemplos:

```text
Busco hacer una partida -> partida
Quiero hacer una partida -> partida
Necesito una partida urgente -> partida urgente
```

Se eliminan palabras como:

```text
quiero, quisiera, deseo, necesito, necesitaria, tengo, busco, buscar, buscando,
hacer, realizar, iniciar, obtener, sacar, pedir, conseguir, ver, saber,
tramite, tramites, tramitar, gestion, gestionar, solicitud, solicitar
```

Tambien se eliminan conectores y pronombres frecuentes:

```text
una, uno, unos, unas, para, por, del, los, las, que,
como, donde, cuando, sobre, este, esta, esto, mis, tus, sus
```

Estas palabras se consideran genericas porque normalmente describen la forma de pedir, no el objeto del tramite. `con` y `sin` se dejan fuera a proposito: invierten la intencion (por ejemplo, "certificado sin deuda" no debe reducirse a "certificado deuda").

Ejemplo:

```text
Necesito hacer una partida urgente
```

Se interpreta asi:

```text
necesito -> intencion generica
hacer -> accion generica
una -> conector
partida -> termino relevante
urgente -> termino relevante
```

Query limpia:

```text
partida urgente
```

No se deben eliminar palabras que cambian la intencion del tramite, como:

```text
alta, baja, renovacion, urgente, licencia, certificado, partida, domicilio
```

## 2. Fuse.js

Fuse.js corre en el navegador sobre el catalogo ya cargado.

Usa:

```text
nombre: peso 0.55
descripcion: peso 0.45
```

Se ejecuta:

```text
mientras el usuario escribe
y otra vez al presionar Buscar
```

Al presionar Buscar, Fuse aporta candidatos a IA si cumplen al menos una condicion:

```text
Fuse >= 46%
o el nombre contiene todas las palabras relevantes de la busqueda
```

## 3. Busqueda semantica/textual

Al presionar Buscar, el frontend llama:

```text
POST /api/search
```

El backend recibe la consulta original, la limpia con la misma logica de stopwords y genera el embedding de la consulta limpia.

Ejemplo:

```text
query original: Busco hacer una partida
query limpia: partida
```

Luego compara ese embedding contra `data/embeddings_tramites.json`, que contiene vectores precalculados para cada tramite usando:

```text
nombre + descripcion + keywords
```

Ademas del score semantico, se calcula un refuerzo textual.

## 4. Refuerzo textual

El refuerzo textual evita que una palabra clave literal quede tapada por ruido vectorial.

El backend revisa si los terminos relevantes aparecen en:

```text
nombre
keywords
descripcion
```

Si hay coincidencias fuertes, el tramite sube en el ranking aunque el embedding puro lo haya dejado bajo.

Ejemplo real:

```text
partida
```

Antes, por embedding puro, `Solicitud de Partida` podia quedar fuera del top 10. Con el refuerzo textual, queda primero porque `partida` aparece directamente en el nombre y keywords.

## 5. Ruido vectorial

El ruido vectorial aparece cuando el modelo de embeddings encuentra cercanias semanticas debiles o accidentales en textos largos.

Ejemplo:

```text
partida
```

El embedding puede rankear tramites que contienen palabras o contextos parecidos, pero que no resuelven la necesidad del usuario. Para tratarlo, el ranking final usa:

```text
score final = mejor senal entre similitud semantica y coincidencia textual fuerte
```

Esto prioriza flexibilidad, pero evita perder coincidencias obvias.

## 6. Candidatos para IA

El frontend combina candidatos de:

```text
Fuse >= 46%
coincidencia exacta por nombre
top 10 de busqueda semantica/textual
```

Luego elimina duplicados por `id`.

Si un tramite aparece por Fuse y por busqueda semantica/textual, se fusionan sus datos de ranking.

## 7. IA

La IA no busca en todo el catalogo.

Solo recibe los candidatos ya recuperados, con:

```text
id
nombre
descripcion recortada
keywords
ranking Fuse
porcentaje Fuse
ranking busqueda semantica/textual
porcentaje de coincidencia
origen del candidato
```

La IA devuelve:

```text
1 tramite principal, si hay coincidencia clara
0 a 3 alternativas
una explicacion para el usuario
```

Si ningun candidato responde claramente a la consulta, puede devolver que no se encontraron tramites relacionados.

Importante: la IA recibe la consulta original completa, no solo la consulta limpia. La consulta limpia se usa para recuperar y rankear candidatos; la consulta original se usa para entender el tono y redactar una respuesta contextual.

Ejemplo:

```text
Consulta original: Necesito hacer una partida
Consulta limpia: partida
```

La IA recibe:

```text
El usuario busca: "Necesito hacer una partida"
```

Por eso puede responder algo como:

```text
Si necesitas hacer una partida, el tramite mas adecuado es...
```

## 8. Logs en consola

Al presionar Buscar, el navegador registra el flujo en consola tanto en `/` como en `/produccion`.

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

Estos logs permiten auditar ranking, porcentajes, candidatos recuperados y candidatos enviados a IA incluso en la vista productiva, donde no se muestran tags visuales.

`Resumen tokens IA` muestra solo:

```text
tokensTramitesEnviadosEstimados
tokensTotalesConsumidos
```

El primer valor es una estimacion local sobre los candidatos enviados a IA. El segundo viene del `usageMetadata.totalTokenCount` reportado por Gemini.

## Criterio sobre limpiar la consulta para embeddings

Conviene limpiar la consulta antes de generar el embedding, siempre que la lista de stopwords sea conservadora.

Motivo:

```text
Busco hacer una partida
```

contiene mucha intencion generica. Para el embedding, esas palabras pueden mover el vector hacia conceptos amplios como "buscar", "hacer" o "tramite", en vez de concentrarlo en el objeto real: `partida`.

La consulta limpia mejora la recuperacion para busquedas cortas y naturales.

La consulta original igualmente se conserva para:

```text
mostrar logs
enviar contexto a IA
entender la intencion completa del usuario
```

Riesgo:

Si se agregan demasiadas stopwords, se pueden borrar terminos importantes. Por eso no deben filtrarse palabras de dominio como `alta`, `baja`, `urgente`, `licencia`, `partida`, `certificado`, etc.

Decision actual:

```text
Fuse usa consulta limpia.
Busqueda semantica/textual usa consulta limpia para embedding y ranking textual.
IA recibe la consulta original completa y los candidatos ya recuperados.
```
