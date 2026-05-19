import os
from pathlib import Path

from modelo import model

from utils import (
    cargar_json,
    guardar_json,
    construir_texto_embedding,
    normalizar_tramite
)

BASE_DIR = Path(__file__).resolve().parent
REPO_DIR = BASE_DIR.parents[1]
ARCHIVO_TRAMITES = Path(
    os.environ.get(
        "TRAMITES_SOURCE",
        REPO_DIR / "data" / "Listado_tramites_PRD.json"
    )
)
ARCHIVO_EMBEDDINGS = BASE_DIR / "embeddings_tramites.json"

tramites = [
    normalizar_tramite(item)
    for item in cargar_json(ARCHIVO_TRAMITES)
]

tramites = [
    item
    for item in tramites
    if item.get("id") is not None and item.get("nombre")
]

# =========================
# EXISTENTES
# =========================

if os.path.exists(
    ARCHIVO_EMBEDDINGS
):

    embeddings_guardados = cargar_json(
        ARCHIVO_EMBEDDINGS
    )

else:
    embeddings_guardados = []

embeddings_por_id = {
    item["id"]: item
    for item in embeddings_guardados
}

ids_validos = {
    tramite["id"]
    for tramite in tramites
}

hubo_cambios = False

# =========================
# ELIMINAR OBSOLETOS
# =========================

for tramite_id in list(embeddings_por_id.keys()):

    if tramite_id not in ids_validos:

        print(
            f'Eliminando embedding obsoleto ID {tramite_id}'
        )

        del embeddings_por_id[tramite_id]
        hubo_cambios = True

# =========================
# GENERAR / ACTUALIZAR
# =========================

for tramite in tramites:

    texto_embedding = construir_texto_embedding(
        tramite
    )

    tramite_existente = embeddings_por_id.get(
        tramite["id"]
    )

    necesita_actualizacion = (
        tramite_existente is None
        or tramite_existente["texto_embedding"]
        != texto_embedding
    )

    if necesita_actualizacion:

        print(
            f'Actualizando embedding ID {tramite["id"]}'
        )

        embedding = model.encode(
            texto_embedding
        )

        embeddings_por_id[tramite["id"]] = {
            "id": tramite["id"],
            "nombre": tramite.get("nombre", ""),
            "descripcion": tramite.get("descripcion", ""),
            "texto_embedding": texto_embedding,
            "embedding": embedding.tolist()
        }

        hubo_cambios = True

# =========================
# GUARDAR
# =========================

if hubo_cambios:

    guardar_json(
        ARCHIVO_EMBEDDINGS,
        [
            embeddings_por_id[tramite["id"]]
            for tramite in tramites
            if tramite["id"] in embeddings_por_id
        ]
    )

    print("Embeddings actualizados.")

else:
    print("No hubo cambios.")
