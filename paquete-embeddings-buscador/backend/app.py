from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from utils import cargar_json
from search_core import buscar_tramites

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
ARCHIVO_EMBEDDINGS = BASE_DIR / "embeddings_tramites.json"

tramites = cargar_json(ARCHIVO_EMBEDDINGS)

embeddings = [
    item["embedding"]
    for item in tramites
]


class ConsultaRequest(BaseModel):
    query: str
    top_k: int = 50


@app.get("/health")
def health():
    return {
        "status": "ok",
        "tramites": len(tramites),
        "embeddings": len(embeddings)
    }


@app.post("/buscar")
def buscar(data: ConsultaRequest):

    resultados = buscar_tramites(
        data.query,
        tramites,
        embeddings,
        top_k=data.top_k
    )

    return {
        "query": data.query,
        "resultados": resultados
    }
