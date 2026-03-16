"""Concrete Agent implementation backed by Amazon Bedrock + Qdrant."""

import base64
import difflib
import json
import os
import re
import uuid as uuid_lib
from typing import List, Optional

import boto3
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
    MatchValue,
    PointStruct,
    VectorParams,
)

from agent import Agent, UserContext
from models import DumpRequest, GenRequest, Suggestion


# --- Config ----------------------------------------------------------------

PROMPTS_DIR = os.path.join(os.path.dirname(
    os.path.abspath(__file__)), "prompts")

EMBEDDING_MODEL = os.getenv(
    "BEDROCK_EMBEDDING_MODEL", "amazon.titan-embed-text-v2:0")
GENERATION_MODEL = os.getenv(
    "BEDROCK_GENERATION_MODEL", "amazon.nova-lite-v1:0")
EMBEDDING_DIM = int(os.getenv("BEDROCK_EMBEDDING_DIM", "1024"))


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


def _extract_json_array(text: str) -> list:
    """Try to parse raw text or extract a JSON array substring."""
    if not text:
        return []

    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        pass

    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        return []

    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


class BedrockAgent(Agent):
    """Agent that uses Amazon Bedrock for embeddings and generation."""

    def __init__(
        self,
        gen_prompt_path: Optional[str] = None,
        name: Optional[str] = None,
        region_name: Optional[str] = None,
    ) -> None:
        self._name = name or "NovaAgent"
        self._embedding_model = EMBEDDING_MODEL
        self._generation_model = GENERATION_MODEL

        region = region_name or os.getenv(
            "AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
        if not region:
            raise ValueError(
                "AWS_REGION (or AWS_DEFAULT_REGION) must be set for Bedrock.")

        session = boto3.session.Session(region_name=region)
        self._bedrock = session.client("bedrock-runtime")

        gen_path = gen_prompt_path or os.path.join(
            PROMPTS_DIR, "gen_prompt.txt")
        with open(gen_path, "r", encoding="utf-8") as f:
            self._gen_prompt = f.read()

    @property
    def name(self) -> str:
        return self._name

    def _embed_texts(self, texts: List[str]) -> List[List[float]]:
        vectors: List[List[float]] = []
        for text in texts:
            payload = {"inputText": text}
            response = self._bedrock.invoke_model(
                modelId=self._embedding_model,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(payload),
            )
            body = json.loads(response["body"].read())
            vectors.append(body.get("embedding", []))
        return vectors

    def _build_prompt(self, body: GenRequest, history_context: str, actions_text: str, user_context: Optional[UserContext]) -> str:
        element = body.element
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

        return prompt

    def dump(
        self,
        user_id: str,
        qdrant: QdrantClient,
        body: DumpRequest,
    ) -> dict:
        col_name = self.collection_name(user_id)
        _ensure_collection(qdrant, col_name)

        texts = [body.content[i: i + 225]
                 for i in range(0, len(body.content), 200)]
        if not texts:
            return {"status": "ok", "stored": 0}

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

        embeddings = self._embed_texts(texts)

        points = [
            PointStruct(
                id=str(uuid_lib.uuid4()),
                vector=emb,
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
            if emb
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

        history_context = ""
        col_info = qdrant.get_collection(col_name)
        if col_info.points_count > 0:
            query_embedding = self._embed_texts([query_text])[0]
            search_results = qdrant.query_points(
                collection_name=col_name,
                query=query_embedding,
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

        recent = body.recentActions or []
        actions_text = (
            "\n".join(
                f"- [{a.type.value}] on {a.pageMetadata.title} ({a.pageMetadata.url})"
                + (f" element: {a.element.tag}" if a.element else "")
                for a in recent
            )
            or "No recent actions."
        )

        prompt = self._build_prompt(
            body, history_context, actions_text, user_context)

        content = [{"text": prompt}]
        for img in (user_context.images if user_context else []):
            mime = (img.mimeType or "").lower()
            img_format = "png"
            if "jpeg" in mime or "jpg" in mime:
                img_format = "jpeg"
            elif "webp" in mime:
                img_format = "webp"
            elif "gif" in mime:
                img_format = "gif"

            try:
                img_bytes = base64.b64decode(img.data)
            except Exception:
                continue

            content.append(
                {
                    "image": {
                        "format": img_format,
                        "source": {"bytes": img_bytes},
                    }
                }
            )

        response = self._bedrock.converse(
            modelId=self._generation_model,
            system=[
                {
                    "text": (
                        "Return only a JSON array of suggestion objects with at least a text field. "
                        "No markdown, no prose."
                    )
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": content,
                }
            ],
            inferenceConfig={
                "temperature": 0.3,
                "topP": 0.95,
                "maxTokens": 2000,
            },
        )

        out_parts = response.get("output", {}).get(
            "message", {}).get("content", [])
        out_text = "\n".join(p.get("text", "")
                             for p in out_parts if "text" in p)
        suggestions_raw = _extract_json_array(out_text)

        suggestions: List[Suggestion] = []
        for s in suggestions_raw:
            try:
                suggestions.append(Suggestion(**s))
            except Exception:
                continue

        return suggestions
