import json
import os


# =========================
# JSON SAFE LOAD
# =========================

def cargar_json(path):

    if not os.path.exists(path):
        return []

    with open(path, "r", encoding="utf-8") as f:
        contenido = f.read().strip()

        if not contenido:
            return []

        try:
            return json.loads(contenido)
        except json.JSONDecodeError:
            return []


# =========================
# JSON SAVE
# =========================

def guardar_json(path, data):

    with open(path, "w", encoding="utf-8") as f:
        json.dump(
            data,
            f,
            ensure_ascii=False,
            indent=4
        )


# =========================
# LIMPIAR TEXTO
# =========================

def limpiar_texto(texto):

    if not texto:
        return ""

    return (
        str(texto)
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("\t", " ")
        .strip()
    )


# =========================
# NORMALIZAR TRAMITE PRD
# =========================

def normalizar_tramite(item):

    return {
        "id": item.get("id", item.get("ID")),
        "nombre": limpiar_texto(
            item.get("nombre", item.get("NOMBRE_TRAMITE", ""))
        ),
        "descripcion": limpiar_texto(
            item.get("descripcion", item.get("DESCRIPCION_CORTA", ""))
        )
    }


# =========================
# CONSTRUIR TEXTO EMBEDDING
# =========================

def construir_texto_embedding(tramite):

    tramite = normalizar_tramite(
        tramite
    )

    nombre = limpiar_texto(tramite.get("nombre", ""))
    descripcion = limpiar_texto(tramite.get("descripcion", ""))

    return f"""
Nombre:
{nombre}

Descripcion:
{descripcion}
"""
