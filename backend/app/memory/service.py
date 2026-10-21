"""Long-term memory: durable facts/preferences about a user, remembered across chats.

Flow: after a run, salient facts are extracted from the turn and stored (text in Postgres,
embedding in Qdrant, both scoped by user). At the start of a run, memories relevant to the
goal are retrieved and injected into the agent's system prompt.
"""

import logging
import re
import uuid

from qdrant_client import AsyncQdrantClient, models

from app.config import Settings
from app.db.models import Memory
from app.db.session import SessionLocal

log = logging.getLogger(__name__)

EXTRACT_PROMPT = (
    "You maintain long-term memory about the USER for an assistant. From the exchange below, "
    "extract 0-3 DURABLE facts or stable preferences about the user that are worth recalling in "
    "future, unrelated conversations — their name, role, location, ongoing projects, stable "
    "preferences, important personal context. Do NOT store transient or one-off details, general "
    "world knowledge, or facts about anything other than the user. Write each as a short, "
    "self-contained sentence in the third person (e.g. 'The user is a backend developer named "
    "Pravin.'). If nothing is worth remembering, return an empty list."
)
EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {"memories": {"type": "array", "items": {"type": "string"}}},
    "required": ["memories"],
    "additionalProperties": False,
}

MAX_MEMORIES_PER_USER = 300
_DUPLICATE_SIMILARITY = 0.9  # skip a new memory this close to an existing one


class MemoryService:
    def __init__(self, settings: Settings, dense_embedder, llm):
        self.settings = settings
        self.dense = dense_embedder
        self.llm = llm
        self.client = AsyncQdrantClient(url=settings.qdrant_url)
        slug = re.sub(r"[^a-z0-9]+", "-", settings.embedding_model.lower()).strip("-")
        self.collection = f"memories__{slug}"
        self._ready = False

    async def _ensure(self) -> None:
        if self._ready:
            return
        if not await self.client.collection_exists(self.collection):
            dim = await self.dense.dimension()
            await self.client.create_collection(
                self.collection, vectors_config=models.VectorParams(size=dim, distance=models.Distance.COSINE)
            )
            await self.client.create_payload_index(
                self.collection, "user_id", field_schema=models.PayloadSchemaType.KEYWORD
            )
        self._ready = True

    def _user_filter(self, user_id) -> models.Filter:
        return models.Filter(must=[models.FieldCondition(key="user_id", match=models.MatchValue(value=str(user_id)))])

    async def retrieve(self, user_id, query: str, limit: int = 6, min_score: float = 0.3) -> list[str]:
        """Memories relevant to the current goal, for injection into the prompt."""
        if not query:
            return []
        try:
            await self._ensure()
            vec = await self.dense.embed_query(query)
            res = await self.client.query_points(
                self.collection, query=vec, limit=limit, with_payload=True, query_filter=self._user_filter(user_id)
            )
            return [p.payload["content"] for p in res.points if p.score >= min_score]
        except Exception:
            log.debug("Memory retrieve failed", exc_info=True)
            return []

    async def remember(self, user_id, goal: str, answer: str, run_id=None) -> None:
        """Extract durable memories from a finished turn and store the novel ones. Best-effort."""
        if not answer:
            return
        try:
            out = await self.llm.complete_json(
                [
                    {"role": "system", "content": EXTRACT_PROMPT},
                    {"role": "user", "content": f"User said: {goal[:800]}\n\nAssistant answered: {answer[:1200]}"},
                ],
                EXTRACT_SCHEMA,
                name="memories",
            )
            candidates = out.get("memories", [])
            if not isinstance(candidates, list):
                return
            await self._ensure()
            for raw in candidates[:3]:
                content = str(raw).strip()
                if len(content) < 4:
                    continue
                vec = await self.dense.embed_query(content)
                dup = await self.client.query_points(
                    self.collection, query=vec, limit=1, with_payload=False, query_filter=self._user_filter(user_id)
                )
                if dup.points and dup.points[0].score >= _DUPLICATE_SIMILARITY:
                    continue
                mem_id = uuid.uuid4()
                async with SessionLocal() as db:
                    db.add(Memory(id=mem_id, user_id=user_id, content=content, source_run_id=run_id))
                    await db.commit()
                await self.client.upsert(
                    self.collection,
                    points=[models.PointStruct(id=str(mem_id), vector=vec, payload={"user_id": str(user_id), "content": content})],
                    wait=True,
                )
        except Exception:
            log.debug("Memory remember failed", exc_info=True)

    async def delete(self, user_id, memory_id: uuid.UUID) -> bool:
        async with SessionLocal() as db:
            m = await db.get(Memory, memory_id)
            if m is None or m.user_id != user_id:
                return False
            await db.delete(m)
            await db.commit()
        try:
            await self.client.delete(self.collection, points_selector=models.PointIdsList(points=[str(memory_id)]), wait=True)
        except Exception:
            log.debug("Memory vector delete failed", exc_info=True)
        return True
