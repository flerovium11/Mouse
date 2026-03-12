from abc import ABC, abstractmethod
from typing import List, Optional

from qdrant_client import QdrantClient

from models import DumpRequest, GenRequest, Suggestion


class Agent(ABC):
    """
    Abstract interface for an agent that can:
      1. dump  – embed page content and store it in a per-user Qdrant collection.
      2. generate – produce autocomplete suggestions using the vector DB context.

    Each agent writes to its own Qdrant collection, namespaced by agent name,
    so that multiple agents in benchmark mode never collide.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for this agent (used in benchmark output)."""
        ...

    def collection_name(self, user_id: str) -> str:
        """Per-user, per-agent Qdrant collection name."""
        return f"user_{user_id}_{self.name}"

    @abstractmethod
    def dump(
        self,
        user_id: str,
        qdrant: QdrantClient,
        body: DumpRequest,
    ) -> dict:
        """
        Embed the page content described in *body* and upsert the vectors
        into the user's Qdrant collection.

        Returns a dict like ``{"status": "ok", "stored": <int>}``.
        """
        ...

    @abstractmethod
    def generate(
        self,
        user_id: str,
        qdrant: QdrantClient,
        body: GenRequest,
        additional_details: Optional[str] = None,
    ) -> List[Suggestion]:
        """
        Use the user's stored embeddings + the current element context in
        *body* to produce a list of autocomplete ``Suggestion`` objects.

        *additional_details* is optional free-text context provided by the
        user to steer the generation (e.g. "I'm applying for a software
        engineering role at Google").
        """
        ...
