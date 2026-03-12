"""Concrete Agent implementation backed by Gemini + Qdrant."""

import base64
import json
import os
import uuid as uuid_lib
import difflib
from typing import List, Optional

from google import genai
from google.genai import types
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    VectorParams,
    Filter,
    FieldCondition,
    MatchValue,
    FilterSelector,
)

from agent import Agent, UserContext
from models import DumpRequest, GenRequest, Suggestion


# --- Config ----------------------------------------------------------------

PROMPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompts")

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 3072
GENERATION_MODEL = "gemini-2.5-flash-lite"

SUGGESTION_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "text": {"type": "string"},
        },
        "required": ["text"],
    },
}


# --- Helpers ---------------------------------------------------------------

def _ensure_collection(qdrant: QdrantClient, col_name: str) -> None:
    """Create the collection if it doesn't exist yet."""
    existing = [c.name for c in qdrant.get_collections().collections]
    if col_name not in existing:
        qdrant.create_collection(
            col_name,
            vectors_config=VectorParams(
                size=EMBEDDING_DIM,
                distance=Distance.COSINE,
            ),
        )


# --- GeminiAgent -----------------------------------------------------------

class GeminiAgent(Agent):
    """Agent that uses Google Gemini for embeddings and generation."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        gen_prompt_path: Optional[str] = None,
        name: Optional[str] = None,
    ) -> None:
        self._name = name or "GeminiAgent"
        key = api_key or os.getenv("GEMINI_API_KEY")
        self._client = genai.Client(api_key=key)

        gen_path = gen_prompt_path or os.path.join(PROMPTS_DIR, "gen_prompt.txt")

        with open(gen_path, "r") as f:
            self._gen_prompt = f.read()

    @property
    def name(self) -> str:
        return self._name

    # -- internal helpers ---------------------------------------------------

    def _embed_texts(self, texts: List[str], task_type: Optional[str] = None) -> list:
        config = types.EmbedContentConfig(task_type=task_type) if task_type else None
        embeds = []
        for i in range(0, len(texts), 100):
            results = self._client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=texts[i : i + 100],
                config=config,
            )
            embeds.extend(results.embeddings)
        return embeds

    # -- Agent interface ----------------------------------------------------

    def dump(
        self,
        user_id: str,
        qdrant: QdrantClient,
        body: DumpRequest,
    ) -> dict:
        col_name = self.collection_name(user_id)
        _ensure_collection(qdrant, col_name)

        texts = [body.content[i : i + 225] for i in range(0, len(body.content), 200)]

        if not texts:
            return {"status": "ok", "stored": 0}

        # Remove old vectors for this URL before upserting new ones
        qdrant.delete(
            collection_name=col_name,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[
                        FieldCondition(
                            key="url",
                            match=MatchValue(value=body.pageMetadata.url),
                        )
                    ]
                )
            ),
        )

        embeddings = self._embed_texts(texts, task_type="RETRIEVAL_DOCUMENT")

        points = [
            PointStruct(
                id=str(uuid_lib.uuid4()),
                vector=emb.values,
                payload={
                    "chunk_id": hash(chunk),
                    "content": chunk,
                    "url": body.pageMetadata.url,
                    "title": body.pageMetadata.title,
                    "domain": body.pageMetadata.domain,
                    "description": body.pageMetadata.description or "",
                },
            )
            for emb, chunk in zip(embeddings, texts)
        ]

        qdrant.upsert(collection_name=col_name, points=points)
        return {"status": "ok", "stored": len(points)}

    def generate(
        self,
        user_id: str,
        qdrant: QdrantClient,
        body: GenRequest,
        user_context: Optional[UserContext] = None,
    ) -> List[Suggestion]:
        col_name = self.collection_name(user_id)
        _ensure_collection(qdrant, col_name)

        element = body.element
        ctx_text = user_context.text if user_context else None
        query_parts = [p for p in [ctx_text, element.value] if p and p.strip()]
        query_text = " ".join(query_parts) if query_parts else "N/A"

        # --- Retrieve relevant history from Qdrant --------------------------
        history_context = ""
        col_info = qdrant.get_collection(col_name)
        if col_info.points_count > 0:
            query_embedding = self._embed_texts(
                [query_text], task_type="RETRIEVAL_QUERY"
            )[0]
            search_results = qdrant.query_points(
                collection_name=col_name,
                query=query_embedding.values,
                limit=15,
                score_threshold=0.6,
            )
            seen_contents: list[str] = []
            deduped_points = []
            for pt in search_results.points:
                c = pt.payload.get("content", "")
                if c in seen_contents:
                    continue
                if any(
                    difflib.SequenceMatcher(None, c, s).ratio() > 0.85
                    for s in seen_contents
                ):
                    continue
                seen_contents.append(c)
                deduped_points.append(pt)

            history_snippets = [
                f"- [{pt.payload.get('title', '')}] {pt.payload.get('content', '')}"
                for pt in deduped_points
            ]
            history_context = (
                "\n".join(history_snippets)
                if history_snippets
                else "No relevant history found."
            )
        else:
            history_context = "No browsing history stored yet."

        # --- Format recent actions ------------------------------------------
        recent = body.recentActions or []
        actions_text = (
            "\n".join(
                f"- [{a.type.value}] on {a.pageMetadata.title} ({a.pageMetadata.url})"
                + (f" element: {a.element.tag}" if a.element else "")
                for a in recent
            )
            or "No recent actions."
        )

        # --- Build the prompt -----------------------------------------------
        replacements = {
            "{url}": body.pageMetadata.url,
            "{title}": body.pageMetadata.title,
            "{domain}": body.pageMetadata.domain,
            "{history_context}": history_context,
            "{tag}": element.tag,
            "{element_type}": element.type or "N/A",
            "{label}": element.label or "N/A",
            "{placeholder}": element.placeholder or "N/A",
            "{name_attr}": element.nameAttr or "N/A",
            "{aria_label}": element.ariaLabel or "N/A",
            "{value}": element.value or "",
            "{cursor_position}": (
                str(element.cursorPosition)
                if element.cursorPosition is not None
                else "N/A"
            ),
            "{surroundings}": element.surroundings or "N/A",
            "{recent_actions}": actions_text,
            "{additional_details}": (user_context.text if user_context else None) or "None provided.",
        }
        prompt = self._gen_prompt
        for key, val in replacements.items():
            prompt = prompt.replace(key, val)

        # --- Call Gemini for suggestions ------------------------------------
        parts: list = [types.Part.from_text(text=prompt)]
        for img in (user_context.images if user_context else []):
            parts.append(
                types.Part.from_bytes(
                    data=base64.b64decode(img.data),
                    mime_type=img.mimeType,
                )
            )

        response = self._client.models.generate_content(
            model=GENERATION_MODEL,
            contents=parts,
            config=types.GenerateContentConfig(
                temperature=0.3,
                top_p=0.95,
                top_k=40,
                response_mime_type="application/json",
                response_schema=SUGGESTION_SCHEMA,
            ),
        )

        try:
            suggestions_raw = json.loads(response.text)
        except json.JSONDecodeError:
            suggestions_raw = []

        suggestions: List[Suggestion] = []
        for s in suggestions_raw:
            try:
                suggestions.append(Suggestion(**s))
            except Exception:
                continue

        return suggestions
