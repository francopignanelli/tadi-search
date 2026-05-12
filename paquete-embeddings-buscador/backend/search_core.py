from sklearn.metrics.pairwise import cosine_similarity
from modelo import model


def buscar_tramites(query, tramites, embeddings, top_k=50):

    embedding_consulta = model.encode([query])

    similitudes = cosine_similarity(
        embedding_consulta,
        embeddings
    )

    resultados = []

    for tramite, score in zip(tramites, similitudes[0]):

        resultados.append({
            "id": tramite.get("id"),
            "nombre": tramite.get("nombre", ""),
            "descripcion": tramite.get("descripcion", ""),
            "score": float(score)
        })

    resultados.sort(key=lambda x: x["score"], reverse=True)

    return resultados[:top_k]