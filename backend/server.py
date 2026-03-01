import dotenv
dotenv.load_dotenv()

from fastapi import FastAPI, Header, HTTPException
import sys
import json
import uuid as uuid_lib
import os
from typing import Optional, List

sys.path.append('.')

from google import genai
from google.genai import types
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from models import (
    DumpRequest, GenRequest,
    RegisterResponse, GenResponse,
    Suggestion,
)

# --- Config ---

PROMPT_DIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(PROMPT_DIR, 'prompt.txt'), 'r') as f:
    SUMMARY_PROMPT = f.read()

with open(os.path.join(PROMPT_DIR, 'gen_prompt.txt'), 'r') as f:
    GEN_PROMPT = f.read()

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 3072
GENERATION_MODEL = "gemini-2.5-flash-lite"

# --- Singletons ---

app = FastAPI(title="Mouse API", version="0.1.0")
qdrant = QdrantClient(":memory:")
gemini_client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))

# Track registered users
registered_users: set[str] = set()


# --- Helpers ---

def _collection_name(user_id: str) -> str:
    """Per-user Qdrant collection name."""
    return f"user_{user_id}"


def _ensure_collection(user_id: str):
    """Create the user's collection if it doesn't exist yet."""
    col_name = _collection_name(user_id)
    existing = [c.name for c in qdrant.get_collections().collections]
    if col_name not in existing:
        qdrant.create_collection(
            col_name,
            vectors_config=VectorParams(
                size=EMBEDDING_DIM,
                distance=Distance.COSINE,
            ),
        )


def _get_user_id(x_user_id: Optional[str]) -> str:
    """Validate the X-User-Id header."""
    if not x_user_id or x_user_id not in registered_users:
        raise HTTPException(status_code=401, detail="Invalid or missing X-User-Id header")
    return x_user_id


def _embed_texts(texts: List[str]) -> list:
    """Embed a list of texts using Gemini."""
    results = gemini_client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=texts,
    )
    return results.embeddings


def generate_summary_prompt(website_text: str) -> str:
    return SUMMARY_PROMPT.format(website_text)


def extract_snippets(website_text: str) -> list[str]:
    response = gemini_client.models.generate_content(
        model=GENERATION_MODEL,
        contents=types.Part.from_text(text=generate_summary_prompt(website_text)),
        config=types.GenerateContentConfig(
            temperature=0,
            top_p=0.95,
            top_k=20,
        ),
    )
    text = response.text
    text = text.replace("```json", "").replace("```", "")
    snippets = json.loads(text)
    return snippets


# --- Routes ---

@app.post("/register", response_model=RegisterResponse)
async def register():
    """Register a new user and return a UUID."""
    user_id = str(uuid_lib.uuid4())
    registered_users.add(user_id)
    _ensure_collection(user_id)
    return RegisterResponse(uuid=user_id)


@app.post("/dump")
async def dump(body: DumpRequest, x_user_id: Optional[str] = Header(None)):
    """Store a visited page's chunks in the user's vector DB collection."""
    user_id = _get_user_id(x_user_id)
    col_name = _collection_name(user_id)
    _ensure_collection(user_id)

    # Build texts to embed: prepend page metadata for richer context
    meta_prefix = f"{body.pageMetadata.title} | {body.pageMetadata.domain} | {body.pageMetadata.url}"
    texts = [f"{meta_prefix}\n{chunk.content}" for chunk in body.chunks]

    if not texts:
        return {"status": "ok", "stored": 0}

    embeddings = _embed_texts(texts)

    # Get current max id in collection to avoid collisions
    col_info = qdrant.get_collection(col_name)
    offset = col_info.points_count

    points = [
        PointStruct(
            id=offset + idx,
            vector=emb.values,
            payload={
                "chunk_id": chunk.id,
                "content": chunk.content,
                "url": body.pageMetadata.url,
                "title": body.pageMetadata.title,
                "domain": body.pageMetadata.domain,
                "description": body.pageMetadata.description or "",
            },
        )
        for idx, (emb, chunk) in enumerate(zip(embeddings, body.chunks))
    ]

    qdrant.upsert(collection_name=col_name, points=points)
    return {"status": "ok", "stored": len(points)}


@app.post("/gen", response_model=GenResponse)
async def gen(body: GenRequest, x_user_id: Optional[str] = Header(None)):
    """Generate autocomplete suggestions for the current element."""
    user_id = _get_user_id(x_user_id)
    col_name = _collection_name(user_id)
    _ensure_collection(user_id)

    # Build a query from the element context + page chunks
    element = body.element
    query_parts = [
        body.pageMetadata.title,
        body.pageMetadata.domain,
        element.label or "",
        element.placeholder or "",
        element.value or "",
        element.surroundings or "",
    ]
    query_text = " ".join(p for p in query_parts if p)

    # Retrieve relevant history from the vector DB
    history_context = ""
    col_info = qdrant.get_collection(col_name)
    if col_info.points_count > 0:
        query_embedding = _embed_texts([query_text])[0]
        search_results = qdrant.query_points(
            collection_name=col_name,
            query=query_embedding.values,
            limit=5,
        )
        history_snippets = [
            f"- [{pt.payload.get('title', '')}] {pt.payload.get('content', '')}"
            for pt in search_results.points
        ]
        history_context = "\n".join(history_snippets) if history_snippets else "No relevant history found."
    else:
        history_context = "No browsing history stored yet."

    # Format page chunks
    chunks_text = "\n".join(
        f"- {chunk.content}" for chunk in body.chunks
    ) or "No page content available."

    # Format recent actions
    actions_text = "\n".join(
        f"- [{a.type.value}] on {a.pageMetadata.title} ({a.pageMetadata.url})"
        + (f" element: {a.element.tag}" if a.element else "")
        for a in body.recentActions
    ) or "No recent actions."

    # Build the prompt
    prompt = GEN_PROMPT.format(
        url=body.pageMetadata.url,
        title=body.pageMetadata.title,
        domain=body.pageMetadata.domain,
        chunks=chunks_text,
        history_context=history_context,
        tag=element.tag,
        element_type=element.type or "N/A",
        label=element.label or "N/A",
        placeholder=element.placeholder or "N/A",
        name_attr=element.nameAttr or "N/A",
        aria_label=element.ariaLabel or "N/A",
        value=element.value or "",
        cursor_position=element.cursorPosition if element.cursorPosition is not None else "N/A",
        surroundings=element.surroundings or "N/A",
        recent_actions=actions_text,
    )

    # Generate suggestions with Gemini
    response = gemini_client.models.generate_content(
        model=GENERATION_MODEL,
        contents=types.Part.from_text(text=prompt),
        config=types.GenerateContentConfig(
            temperature=0.3,
            top_p=0.95,
            top_k=40,
        ),
    )

    raw = response.text.replace("```json", "").replace("```", "").strip()
    try:
        suggestions_raw = json.loads(raw)
    except json.JSONDecodeError:
        suggestions_raw = []

    suggestions = []
    for s in suggestions_raw:
        try:
            suggestions.append(Suggestion(**s))
        except Exception:
            continue

    return GenResponse(suggestions=suggestions)
