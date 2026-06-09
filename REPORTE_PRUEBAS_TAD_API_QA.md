# Reporte de pruebas - TAD External QA via API Manager

Fecha de inicio: 2026-06-03

## Contexto

Se prueban los endpoints TAD External publicados en QA a traves de 3Scale / API Manager.

Base URL:

```text
https://tad-api-qa.gcba.gob.ar
```

Credenciales de cliente provistas:

```text
client_id: 8a86fda2
client_secret: ********
```

Nota: el `client_secret` no se documenta completo en este reporte.

## Configuracion comun en Postman

Environment sugerido:

| Variable | Valor |
| --- | --- |
| `base_url` | `https://tad-api-qa.gcba.gob.ar` |
| `client_id` | `8a86fda2` |
| `client_secret` | valor provisto, no documentado completo |
| `token` | bearer token vigente, si aplica |
| `cuit` | dato de prueba |
| `inicio` | dato de prueba |
| `fin` | dato de prueba |

Headers comunes para invocar via API Manager:

| Header | Valor |
| --- | --- |
| `client_id` | `{{client_id}}` |
| `client_secret` | `{{client_secret}}` |
| `Accept` | `application/json` |

Si el endpoint requiere token TAD, agregar tambien:

| Header | Valor |
| --- | --- |
| `Authorization` | `Bearer {{token}}` |

## Criterio de lectura

| Resultado | Interpretacion |
| --- | --- |
| `200` / `201` | Endpoint operativo y respuesta exitosa |
| `400` | Endpoint accesible, pero request o datos de negocio invalidos |
| `401` | Problema de autenticacion |
| `403` | Problema de permisos, credenciales o headers requeridos |
| `404` | Ruta no publicada o path/base URL incorrectos |
| `5xx` | Error del servicio/backend |

## Resultados

| ID | Metodo | Endpoint | Datos usados | Status | Resultado observado | Observaciones |
| --- | --- | --- | --- | --- | --- | --- |
| G01 | GET | `/tad2-rest/tad-external/persona/cuit/{cuit}` | Pendiente | Pendiente | Pendiente | Pendiente |
| G02 | GET | `/tad2-rest/tad-external/gestionparticipantes/persona/obtener?cuit={cuit}` | Pendiente | Pendiente | Pendiente | Pendiente |
| G03 | GET | `/tad2-rest/tad-external/apoderados/{cuit}` | CUIT poderdante probado | `500` | `Ocurrio un error interno del servidor.` | Autenticacion OK; falla interna del servicio con CUIT probado |
| G04 | GET | `/tad2-rest/tad-external/expediente/consultaPorCuit/{cuit}` | CUIT probado | `500` | `Ocurrio un error interno del servidor.` | Autenticacion OK; falla interna del servicio con CUIT probado |
| G05 | GET | `/tad2-rest/tad-external/consulta-alta-usuarios/fechas/{inicio}/{fin}` | Fechas `dd-MM-yyyy-HH:mm:ss` | `200` | Lista de personas retornada | OK; respuesta con `error=false` inferido por estructura exitosa |
| G06 | GET | `/tad2-rest/tad-external/encuesta/{inicio}/{fin}` | Pendiente | Pendiente | Pendiente | Pendiente |
| G07 | GET | `/tad2-rest/tad-external/gestionparticipantes/habilitacionGP` | Sin parametros | `400` | `Bad Request` sin body | Endpoint publicado/autenticado; faltan parametros exactos para prueba funcional |
| G08 | GET | `/tad2-rest/tad-external/gestionparticipantes` | Pendiente | Pendiente | Pendiente | Pendiente |
| G09 | GET | `/tad2-rest/tad-external/gestionparticipantes/obtenerPerfilesTrata` | Pendiente | Pendiente | Pendiente | Pendiente |
| G10 | GET | `/tad2-rest/tad-external/persona/personaNotificacion/obtener` | Pendiente | Pendiente | Pendiente | Pendiente |
| G11 | GET | `/tad2-rest/tad-external/documentosAsociados` | Pendiente | Pendiente | Pendiente | Pendiente |
| G12 | GET | `/tad2-rest/tad-external/gestionparticipantes/tramites/obtenerDocumentos` | Pendiente | Pendiente | Pendiente | Pendiente |
| G13 | GET | `/tad2-rest/tad-external/domicilio/id/{id}` | ID persona `33724` | `200` | `error=true`, `Error al obtener domicilio de la persona.` | Endpoint accesible/autenticado; error funcional para persona probada |
| G14 | GET | `/tad2-rest/tad-external/gestionparticipantes/validarDatosParticipante/cuit/{cuit}/interviniente/{interviniente}/validaPersonaTad/{validaPersonaTad}` | CUIT `20187433410`, flags probados | `200` | `error=true`, participante sin usuario TAD | Endpoint operativo; validacion negativa para CUIT probado |
| G15 | GET | `/tad2-rest/tad-external/tramite/listaTramiteDocumento/{idTramite}` | `idTramite` probado | `200` | `{}` | Endpoint operativo; no devuelve documentos para el tramite probado |
| G16 | GET | `/tad2-rest/tad-external/tramite/listaTramiteDocumento/byids/{idTramites}` | `idTramites` probado | `200` | `respuesta=[]`, `error=false` | Endpoint operativo; sin documentos para ids probados |
| G17 | GET | `/tad2-rest/tad-external/marcarLeidaNotificacionGedo/{idNotificacion}/{baidPersona}` | Pendiente | Pendiente | Pendiente | Pendiente |
| G18 | GET | `/tad2-rest/tad-external/obtenerDatosNotificacionDePersona/{baid}` | Pendiente | Pendiente | Pendiente | Pendiente |
| G19 | GET | `/tad2-rest/tad-external/gestionparticipantes/perfilesGP/idTrata/{idTrata}` | Pendiente | Pendiente | Pendiente | Pendiente |
| G20 | GET | `/tad2-rest/tad-external/gestionparticipantes/tramites/expediente/obtener?codigoEE={codigoEE}` | Pendiente | Pendiente | Pendiente | Pendiente |
| G21 | GET | `/tad2-rest/tad-external/gestionparticipantes/tramite/{tramite_id}` | Pendiente | Pendiente | Pendiente | Pendiente |
| G22 | GET | `/tad2-rest/tad-external/documento/requeridosPorTipoTramite/supertrata/{idTramite}` | Pendiente | Pendiente | Pendiente | Pendiente |
| P01 | POST | `/tad2-rest/tad-external/auth` | Pendiente | Pendiente | Pendiente | Pendiente |
| P02 | PUT | `/tad2-rest/tad-external/altaPersonaExterna` | Body ejemplo documentado, CUIT `20187433410` | `200` | Alta exitosa, persona id `33724` | Funciono con Bearer token obtenido por flujo externo |
| P03 | POST | `/tad2-rest/tad-external/filtroTramiteError/getErrorsByTratasAndDates?page=0&size=5` | Body con tratas `TESTTRATA`, `GENE0002A` | `200` | `error=true`, `Error al obtener la lista de errores de tramites.` | Endpoint accesible/autenticado; respuesta funcional de error |
| P04 | POST | `/tad2-rest/tad-external/notificacion/notificar` | Pendiente | Pendiente | Pendiente | Pendiente |
| P05 | POST | `/tad2-rest/tad-external/filtrarTramitesPorPersona` | Pendiente | Pendiente | Pendiente | Pendiente |
| P06 | PUT | `/tad2-rest/tad-external/gestionparticipantes/modificar-participante` | Pendiente | Pendiente | Pendiente | Pendiente |
| P07 | POST | `/tad2-rest/tad-external/notificacion/altaNotificacion` | Pendiente | Pendiente | Pendiente | Pendiente |
| P08 | POST | `/tad2-rest/tad-external/notificacion/altaNotificacionNoTad` | Pendiente | Pendiente | Pendiente | Pendiente |
| P09 | POST | `/tad2-rest/tad-external/notificacionesPorPersona` | Pendiente | Pendiente | Pendiente | Pendiente |
| P10 | POST | `/tad2-rest/tad-external/documento/requeridos` | Pendiente | Pendiente | Pendiente | Pendiente |
| P11 | POST | `/tad2-rest/tad-external/documento/requeridos/trata/{trata}` | Pendiente | Pendiente | Pendiente | Pendiente |
| P12 | POST | `/tad2-rest/tad-external/gestionparticipantes/tramites/crear` | Pendiente | Pendiente | Pendiente | Pendiente |

## Detalle por prueba

### G01 - Persona por CUIT

Pendiente.

### G02 - Obtener persona GP por CUIT

Pendiente.

### G03 - Apoderados por CUIT

Servicio expuesto para sistemas externos que permite consultar el listado de apoderados vigentes asociados a una persona, poderdante, identificada por su CUIT.

Request:

```text
GET {{base_url}}/tad2-rest/tad-external/apoderados/{{cuit}}
```

Headers:

```text
client_id: {{client_id}}
client_secret: {{client_secret}}
Accept: application/json
Authorization: Bearer {{token}}
```

Params: no aplica.

Body: no aplica.

Resultado observado:

```text
500 Internal Server Error
```

Respuesta:

```json
{
  "respuesta": null,
  "error": true,
  "mensaje": "Ocurrio un error interno del servidor."
}
```

Observaciones: la autenticacion fue aceptada y la solicitud llego al backend. Se corrigio la URL sin espacios antes del CUIT y el endpoint continuo respondiendo `500`.

### G04 - Expedientes por CUIT

Servicio de consulta que retorna el listado de expedientes electronicos, EEs, asociados a una persona identificada por su CUIT.

Request:

```text
GET {{base_url}}/tad2-rest/tad-external/expediente/consultaPorCuit/{{cuit}}
```

Headers:

```text
client_id: {{client_id}}
client_secret: {{client_secret}}
Accept: application/json
Authorization: Bearer {{token}}
```

Params: no aplica.

Body: no aplica.

Resultado observado:

```text
500 Internal Server Error
```

Respuesta:

```json
{
  "respuesta": null,
  "error": true,
  "mensaje": "Ocurrio un error interno del servidor."
}
```

Observaciones: la autenticacion fue aceptada y la solicitud llego al backend. El servicio devolvio error interno para el CUIT probado.

### G05 - Consulta alta usuarios por fechas

Servicio de consulta que retorna el listado de personas, usuarios, dadas de alta en TAD dentro de un rango de fecha/hora informado. El resultado se limita a personas con terminos y condiciones asociados.

Request:

```text
GET {{base_url}}/tad2-rest/tad-external/consulta-alta-usuarios/fechas/{{inicio}}/{{fin}}
```

Headers:

```text
client_id: {{client_id}}
client_secret: {{client_secret}}
Accept: application/json
Authorization: Bearer {{token}}
```

Path variables:

| Campo | Formato | Obligatorio | Nota |
| --- | --- | --- | --- |
| `inicio` | `dd-MM-yyyy-HH:mm:ss` | Si | Debe ser anterior a `fin` |
| `fin` | `dd-MM-yyyy-HH:mm:ss` | Si | Debe ser posterior a `inicio` |

Ejemplo:

```text
inicio = 20-08-2025-12:12:12
fin = 20-11-2025-12:12:12
```

Comportamiento documentado:

```text
HTTP 200 con error=false si hay resultados.
HTTP 200 con error=true y mensaje generico si hay error funcional o tecnico.
```

Body: no aplica.

Resultado observado:

```text
200 OK
```

Respuesta relevante:

```json
{
  "respuesta": [
    {
      "id": 33686,
      "nombres": "Jose",
      "apellidos": "Lui",
      "cuit": "1",
      "tipoDocumento": "OT",
      "numeroDocumento": "1",
      "sexo": "M",
      "email": "extranjero21@mailinator.com",
      "tipoPersona": "PF"
    }
  ]
}
```

Observacion: el endpoint respondio correctamente con lista de personas para el rango probado.

### G06 - Encuesta por fechas

Pendiente.

### G07 - Habilitacion GP

Servicio REST que valida si un profesional, identificado por CUIT, se encuentra habilitado en el sistema externo GP para un perfil determinado y para la trata asociada a un tramite de TAD, `idTramite`.

Request segun ultima documentacion recibida:

```text
GET {{base_url}}/tad2-rest/tad-external/gestionparticipantes/habilitacionGP
```

Headers:

```text
client_id: {{client_id}}
client_secret: {{client_secret}}
Accept: application/json
Authorization: Bearer {{token}}
```

Parametros: pendiente de confirmar nombres exactos. Por descripcion, el servicio deberia recibir al menos:

```text
cuit
perfil
idTramite
```

Observacion: el listado inicial indicaba `/gestionparticipantes/habilitacionG`, pero la documentacion ampliada indica `/gestionparticipantes/habilitacionGP`.

Body: no aplica si se confirma como GET con query params.

Resultado observado:

```text
400 Bad Request
```

Respuesta: sin body.

Observaciones: el endpoint esta publicado y la autenticacion fue aceptada. La prueba se ejecuto sin parametros porque la documentacion disponible esta repetida/incompleta; el `400` es compatible con falta de parametros requeridos.

### G08 - Gestion participantes

Pendiente.

### G09 - Obtener perfiles trata

Pendiente.

### G10 - Persona notificacion obtener

Pendiente.

### G11 - Documentos asociados

Pendiente.

### G12 - Tramites obtener documentos

Pendiente.

### G13 - Domicilio por ID

Servicio de consulta que permite obtener el domicilio asociado a una persona, utilizando como criterio el identificador, `id`, de la Persona.

Request:

```text
GET {{base_url}}/tad2-rest/tad-external/domicilio/id/{{id}}
```

Headers:

```text
client_id: {{client_id}}
client_secret: {{client_secret}}
Accept: application/json
Authorization: Bearer {{token}}
```

Path variables:

| Campo | Descripcion |
| --- | --- |
| `id` | Identificador de Persona. Se puede probar con `33724`, obtenido en P02 |

Params: no aplica.

Body: no aplica.

Resultado observado:

```text
200 OK
```

Respuesta:

```json
{
  "respuesta": 33724,
  "error": true,
  "mensaje": "Error al obtener domicilio de la persona."
}
```

Observaciones: el endpoint respondio HTTP 200, pero el body indica error funcional al obtener el domicilio de la persona `33724`.

### G14 - Validar datos participante

Servicio de validacion de datos de un participante por CUIT para su uso en Gestion de Participantes, GP, contra informacion registrada en TAD.

Request:

```text
GET {{base_url}}/tad2-rest/tad-external/gestionparticipantes/validarDatosParticipante/cuit/{{cuit}}/interviniente/{{interviniente}}/validaPersonaTad/{{validaPersonaTad}}
```

Headers:

```text
client_id: {{client_id}}
client_secret: {{client_secret}}
Accept: application/json
Authorization: Bearer {{token}}
```

Path variables:

| Campo | Descripcion |
| --- | --- |
| `cuit` | CUIT del participante |
| `interviniente` | Rol/tipo de interviniente. Pendiente valores validos |
| `validaPersonaTad` | Flag de validacion contra persona TAD. Pendiente confirmar si espera `true/false`, `1/0` u otro valor |

Params: no aplica.

Body: no aplica.

Resultado observado:

```text
200 OK
```

Respuesta:

```json
{
  "respuesta": "20187433410",
  "error": true,
  "mensaje": "El participante ingresado no posee usuario TAD. El CUIT pertenece a una persona que no tiene clave Ciudad nivel 2 o aun no completo sus datos personales en TAD."
}
```

Observaciones: el endpoint respondio correctamente a nivel HTTP. La validacion funcional fue negativa para el CUIT probado porque no posee usuario TAD o no completo datos personales.

### G15 - Lista tramite documento

Servicio REST que retorna el listado de documentos, `TramiteDocumento`, asociados a un tramite identificado por `idTramite`. Devuelve una lista normalizada, ordenada por acronimo TAD del tipo de documento, con `TipoDocumento` rehidratado desde cache/servicio y sin duplicados por numero GEDO.

Request:

```text
GET {{base_url}}/tad2-rest/tad-external/tramite/listaTramiteDocumento/{{idTramite}}
```

Headers:

```text
client_id: {{client_id}}
client_secret: {{client_secret}}
Accept: application/json
Authorization: Bearer {{token}}
```

Path variables:

| Campo | Descripcion |
| --- | --- |
| `idTramite` | Identificador del tramite |

Params: no aplica.

Body: no aplica.

Resultado observado:

```text
200 OK
```

Respuesta:

```json
{}
```

Observaciones: el endpoint respondio correctamente. Para el `idTramite` probado no se devolvieron documentos asociados.

### G16 - Lista tramite documento por IDs

Obtiene el listado de entidades `TramiteDocumento` asociadas a un conjunto de tramites, ids, ordenadas por fecha de alta del `PersonaDocumento`.

Request:

```text
GET {{base_url}}/tad2-rest/tad-external/tramite/listaTramiteDocumento/byids/{{idTramites}}
```

Headers:

```text
client_id: {{client_id}}
client_secret: {{client_secret}}
Accept: application/json
Authorization: Bearer {{token}}
```

Path variables:

| Campo | Descripcion |
| --- | --- |
| `idTramites` | Conjunto de ids de tramites. Pendiente confirmar si espera formato separado por coma, por ejemplo `123,456`, u otro formato |

Params: no aplica.

Body: no aplica.

Resultado observado:

```text
200 OK
```

Respuesta:

```json
{
  "respuesta": [],
  "error": false,
  "mensaje": null
}
```

Observaciones: el endpoint respondio correctamente y no encontro documentos asociados para los ids probados.

### G17 - Marcar leida notificacion GEDO

Pendiente.

### G18 - Datos notificacion persona

Pendiente.

### G19 - Perfiles GP por idTrata

Pendiente.

### G20 - Expediente GP por codigoEE

Pendiente.

### G21 - Gestion participantes tramite

Pendiente.

### G22 - Requeridos por tipo tramite supertrata

Pendiente.

### P01 - Auth

Pendiente.

### P02 - Alta persona externa

Servicio para dar de alta una Persona en TAD consumido por sistemas externos.

Request:

```text
PUT {{base_url}}/tad2-rest/tad-external/altaPersonaExterna
```

Headers:

```text
client_id: {{client_id}}
client_secret: {{client_secret}}
Accept: application/json
Content-Type: application/json
```

Body documentado:

```json
{
  "aprobadoTyC": 1,
  "domicilio": {
    "altura": "145",
    "calle": "San Martin",
    "codigoPostal": "4000",
    "departamento": {
      "id": 2,
      "provincia": {
        "id": 2
      }
    },
    "depto": "A",
    "fechaModificacion": null,
    "id": 0,
    "localidad": {
      "departamento": {
        "id": 2
      },
      "id": 2,
      "provincia": {
        "id": 2
      }
    },
    "observaciones": "alta postman",
    "pais": {
      "id": 1
    },
    "piso": "0",
    "provincia": {
      "id": 2
    },
    "telefono": "string"
  },
  "nombreSistemaOrigen": "string",
  "persona": {
    "activo": true,
    "apellidos": "Juarez X",
    "codigoPais": "AR",
    "codigoTelefonoPais": "string",
    "cuit": "20187433410",
    "email": "x@x.com",
    "fechaAlta": "2025-11-22T19:16:10.627Z",
    "fechaModificacion": null,
    "nombres": "Malcom X",
    "numeroDocumento": "18743341",
    "razonSocial": null,
    "sexo": "M",
    "sistemaConsumidor": {
      "id": 1
    },
    "telefono": "string",
    "terminosYCondiciones": {
      "id": 3,
      "nivelAcceso": {
        "id": 3
      },
      "tipoDocumento": {
        "documentoTipoFirma": {
          "id": 1
        },
        "id": 25
      }
    },
    "tipoDocumento": "DU",
    "tipoPersona": "PF",
    "usuarioCreacion": 10044,
    "valiRenaper": 1
  }
}
```

Primer resultado observado:

```text
401 Unauthorized
```

Headers usados:

```text
client_id: {{client_id}}
client_secret: {{client_secret}}
Accept: application/json
Content-Type: application/json
Authorization: Bearer {{token}}
```

Reprueba adicional: se desactivo `Authorization` y se envio solo con headers de cliente (`client_id`, `client_secret`, `Accept`, `Content-Type`). El endpoint continuo respondiendo `401 Unauthorized`.

Observacion: pendiente confirmar si API Manager espera otros nombres de headers, si las credenciales corresponden a otra aplicacion/plan, o si este endpoint requiere un token TAD obtenido previamente por `/auth`.

Resultado final:

```text
200 OK
```

Respuesta relevante:

```json
{
  "respuesta": {
    "id": 33724,
    "nombres": "Malcom X",
    "apellidos": "Juarez X",
    "cuit": "20187433410",
    "tipoDocumento": "DU",
    "numeroDocumento": "18743341",
    "sexo": "M",
    "tipoPersona": "PF"
  }
}
```

Observacion final: el alta funciono al utilizar un Bearer token obtenido por otro flujo de autenticacion.

### P03 - Errores por tratas y fechas

Servicio destinado a consultar registros de error asociados a tramites, `TramiteError`, filtrando por una lista de tratas, `TipoTramite.trataEE`, y opcionalmente por un rango de fechas.

Request:

```text
POST {{base_url}}/tad2-rest/tad-external/filtroTramiteError/getErrorsByTratasAndDates?page=0&size=5
```

Headers:

```text
client_id: {{client_id}}
client_secret: {{client_secret}}
Accept: application/json
Content-Type: application/json
Authorization: Bearer {{token}}
```

Query params:

| Campo | Valor inicial | Nota |
| --- | --- | --- |
| `page` | `0` | Pagina inicial |
| `size` | `5` | Cantidad de registros por pagina |

Body documentado:

```json
{
  "tratas": [
    "TESTTRATA",
    "GENE0002A"
  ]
}
```

Resultado observado:

```text
200 OK
```

Respuesta:

```json
{
  "respuesta": null,
  "error": true,
  "mensaje": "Error al obtener la lista de errores de tramites."
}
```

Observaciones: el endpoint autentico y respondio HTTP 200, pero la respuesta funcional indica error. Puede depender de las tratas usadas, del formato de filtros opcionales o de una excepcion interna capturada por el controller.

### P04 - Notificar

Pendiente.

### P05 - Filtrar tramites por persona

Pendiente.

### P06 - Modificar participante

Pendiente.

### P07 - Alta notificacion

Pendiente.

### P08 - Alta notificacion no TAD

Pendiente.

### P09 - Notificaciones por persona

Pendiente.

### P10 - Documento requeridos

Pendiente.

### P11 - Documento requeridos por trata

Pendiente.

### P12 - Crear tramite GP

Pendiente.
