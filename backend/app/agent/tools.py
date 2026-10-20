"""Unified tool registry: MCP server tools + in-process RAG tools, grouped by capability.

Tool names exposed to the LLM are `<capability>__<tool>` (e.g. `web__read_page`) so tools
with the same name on different servers never collide.
"""

import base64
import json
import time
from dataclasses import dataclass, field
from typing import Any

from mcp import types as mcp_types

from app.mcp_client import MCPManager
from app.rag.service import RAGService, chunk_to_dict

SEP = "__"

CAPABILITIES: dict[str, str] = {
    "documents": "Search and read the user's private indexed documents (reports, notes, PDFs). "
    "Use when the question is about the user's own files/knowledge.",
    "file": "Read, create, write, copy, move, rename and delete files in the user's local workspace.",
    "web": "Search the internet (text and images), open and read web pages, and download files "
    "for current or public information.",
    "email": "Search, read, draft, send and reply to the user's email; find contacts.",
    "browser": "Operate a real web browser: navigate, read, click, type, scroll, download, "
    "or hand control to the user (e.g. to sign in).",
}


@dataclass
class ToolSpec:
    name: str
    capability: str
    tool: str
    description: str
    parameters: dict[str, Any]
    read_only: bool = False
    destructive: bool = False

    def openai_schema(self) -> dict[str, Any]:
        params = {k: v for k, v in self.parameters.items() if k != "title"}
        params.setdefault("type", "object")
        params.setdefault("properties", {})
        return {
            "type": "function",
            "function": {"name": self.name, "description": self.description, "parameters": params},
        }


@dataclass
class ToolOutput:
    text: str
    is_error: bool = False
    images: list[tuple[bytes, str]] = field(default_factory=list)  # (bytes, mime)
    data: dict[str, Any] | None = None
    latency_ms: int = 0


_DOC_TOOLS = [
    ToolSpec(
        name=f"documents{SEP}search_documents",
        capability="documents",
        tool="search_documents",
        description="Semantic + keyword search over the user's indexed documents. Returns the most relevant "
        "passages, each numbered [n] with its source. Cite passages as [n] in your answer.",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to look for, in natural language"},
                "documents": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional: restrict to these document filenames (partial names OK)",
                },
                "top_k": {"type": "integer", "description": "Passages to return (default 6)"},
            },
            "required": ["query"],
        },
        read_only=True,
    ),
    ToolSpec(
        name=f"documents{SEP}retrieve_document",
        capability="documents",
        tool="retrieve_document",
        description="Retrieve a whole document's text in order (truncated if long). Use for summaries "
        "or when you need the full document rather than matching passages.",
        parameters={
            "type": "object",
            "properties": {"document": {"type": "string", "description": "Document filename (partial OK)"}},
            "required": ["document"],
        },
        read_only=True,
    ),
    ToolSpec(
        name=f"documents{SEP}get_document_context",
        capability="documents",
        tool="get_document_context",
        description="Expand the context around a passage returned by search_documents: returns the "
        "neighbouring passages of the same document.",
        parameters={
            "type": "object",
            "properties": {
                "chunk_id": {"type": "string", "description": "chunk_id from a search result"},
                "window": {"type": "integer", "description": "Passages on each side (default 1)"},
            },
            "required": ["chunk_id"],
        },
        read_only=True,
    ),
]

REQUEST_CAPABILITY = ToolSpec(
    name="request_capability",
    capability="meta",
    tool="request_capability",
    description="Ask for an additional capability's tools if the ones you have are not enough. "
    f"Options: {', '.join(CAPABILITIES)}.",
    parameters={
        "type": "object",
        "properties": {
            "capability": {"type": "string", "enum": list(CAPABILITIES)},
            "reason": {"type": "string"},
        },
        "required": ["capability"],
    },
    read_only=True,
)


LOOK = ToolSpec(
    name=f"browser{SEP}look",
    capability="browser",
    tool="look",
    description="Look at the CURRENT browser screen with a vision model: it describes what is "
    "on the page and gives approximate pixel coordinates (x, y) for clickable things, which you "
    "then use with browser__click_at(x, y). Use this when an element is not in the interactive "
    "list (canvas, maps, custom widgets) or you need to understand the layout visually.",
    parameters={
        "type": "object",
        "properties": {"question": {"type": "string", "description": "What to look for (optional)"}},
    },
    read_only=True,
)

_LOOK_PROMPT = (
    "You are the eyes of a browser agent. Describe this web page concisely: the main content, and "
    "every clickable/typeable element (buttons, links, inputs, menu items) with its approximate "
    "pixel coordinates as (x, y) in a 1280×800 viewport. Be precise about coordinates."
)


class ToolRegistry:
    def __init__(
        self, mcp: MCPManager, rag: RAGService, max_chars: int = 6000, email_configured: bool = True, vision=None
    ):
        self.mcp = mcp
        self.rag = rag
        self.max_chars = max_chars
        self.email_configured = email_configured
        self.vision = vision  # VisionProvider | None — enables the browser__look tool

    # ---------------------------------------------------------------- discovery
    def specs(self) -> dict[str, ToolSpec]:
        specs = {s.name: s for s in _DOC_TOOLS}
        specs[REQUEST_CAPABILITY.name] = REQUEST_CAPABILITY
        for server, tools in self.mcp.tools().items():
            for t in tools:
                ann = t.annotations
                specs[f"{server}{SEP}{t.name}"] = ToolSpec(
                    name=f"{server}{SEP}{t.name}",
                    capability=server,
                    tool=t.name,
                    description=(t.description or t.name).strip(),
                    parameters=t.input_schema,
                    read_only=bool(ann and ann.read_only_hint),
                    destructive=bool(ann and ann.destructive_hint),
                )
        # The vision-powered "look" tool is in-process (not an MCP tool); offer it only when a
        # vision model is configured and the browser is available.
        if self.vision is not None and "browser" in self.mcp.tools():
            specs[LOOK.name] = LOOK
        return specs

    def available_capabilities(self) -> list[str]:
        ready = set(self.mcp.tools())
        caps = [c for c in CAPABILITIES if c == "documents" or c in ready]
        # Don't offer email until it has credentials — otherwise the agent keeps
        # proposing to "draft an email" and every call fails with "not configured".
        if not self.email_configured:
            caps = [c for c in caps if c != "email"]
        return caps

    def lookup_schemas(self) -> list[dict[str, Any]]:
        """Read-only 'look it up' tools that stay available on every turn regardless of
        the plan, so the agent can verify facts instead of hallucinating a lack of access."""
        names = [f"documents{SEP}search_documents"]
        if "web" in self.mcp.tools():
            names.append(f"web{SEP}search_web")
        specs = self.specs()
        return [specs[n].openai_schema() for n in names if n in specs]

    def schemas_for(self, capabilities: list[str]) -> list[dict[str, Any]]:
        caps = set(capabilities)
        out = [s.openai_schema() for s in self.specs().values() if s.capability in caps]
        if set(self.available_capabilities()) - caps:
            out.append(REQUEST_CAPABILITY.openai_schema())
        return out

    # ---------------------------------------------------------------- execution
    async def call(self, name: str, arguments: dict[str, Any], user_id: str | None = None) -> ToolOutput:
        spec = self.specs().get(name)
        if spec is None:
            return ToolOutput(f"Unknown tool '{name}'. Use one of the tools provided.", is_error=True)
        start = time.perf_counter()
        try:
            if name == LOOK.name:
                out = await self._call_look(arguments)
            elif spec.capability == "documents":
                out = await self._call_documents(spec.tool, arguments, user_id)
            else:
                out = self._convert(await self.mcp.call(spec.capability, spec.tool, arguments))
        except Exception as e:  # noqa: BLE001
            out = ToolOutput(f"{type(e).__name__}: {e}", is_error=True)
        out.latency_ms = int((time.perf_counter() - start) * 1000)
        if len(out.text) > self.max_chars:
            out.text = out.text[: self.max_chars] + f"\n…[truncated {len(out.text) - self.max_chars} chars]"
        return out

    @staticmethod
    def _convert(result: mcp_types.CallToolResult) -> ToolOutput:
        texts, images = [], []
        for block in result.content:
            if isinstance(block, mcp_types.TextContent):
                texts.append(block.text)
            elif isinstance(block, mcp_types.ImageContent):
                images.append((base64.b64decode(block.data), block.mime_type))
        return ToolOutput("\n".join(texts) or ("(image)" if images else "(no output)"), result.is_error, images)

    async def _call_look(self, args: dict[str, Any]) -> ToolOutput:
        if self.vision is None:
            return ToolOutput("The look tool needs a vision model configured (set VISION_MODEL).", is_error=True)
        shot = self._convert(await self.mcp.call("browser", "screenshot", {}))
        if not shot.images:
            return ToolOutput("No browser screen available — open_browser or navigate first.", is_error=True)
        img, mime = shot.images[0]
        prompt = _LOOK_PROMPT + (f"\n\nFocus on: {args['question']}" if args.get("question") else "")
        try:
            desc = await self.vision.see(prompt, base64.b64encode(img).decode(), mime or "image/jpeg")
        except Exception as e:  # noqa: BLE001
            return ToolOutput(f"Vision model error: {type(e).__name__}: {e}", is_error=True)
        return ToolOutput(desc or "(the vision model returned nothing)")

    async def _call_documents(self, tool: str, args: dict[str, Any], user_id: str | None = None) -> ToolOutput:
        if tool == "search_documents":
            chunks = await self.rag.search(
                args.get("query", ""), top_k=args.get("top_k"), documents=args.get("documents"), user_id=user_id
            )
            if not chunks:
                return ToolOutput("No relevant passages found in the indexed documents.", data={"chunks": []})
            # Text is produced later by the execute node, which assigns citation numbers.
            return ToolOutput("", data={"chunks": [chunk_to_dict(c) for c in chunks]})
        if tool == "retrieve_document":
            ctx = await self.rag.document_context(args["document"], user_id=user_id)
            parts = []
            for c in ctx["chunks"]:
                head = " · ".join(x for x in [f"page {c['page_number']}" if c["page_number"] else "", c["section"] or ""] if x)
                parts.append((f"[{head}]\n" if head else "") + c["content"])
            body = "\n\n".join(parts)
            name = ctx["chunks"][0]["filename"] if ctx["chunks"] else args["document"]
            note = f"\n\n…[truncated; {ctx['total_chunks']} passages total]" if ctx["truncated"] else ""
            return ToolOutput(f"Document: {name}\n\n{body}{note}", data={"document_id": ctx["document_id"]})
        if tool == "get_document_context":
            chunk_id = args["chunk_id"]
            doc_id, _, idx = chunk_id.rpartition(":")
            window = int(args.get("window") or 1)
            chunks = await self.rag.store.get_document_chunks(doc_id, user_id=user_id)
            idx_i = int(idx)
            near = [c for c in chunks if abs(c["chunk_index"] - idx_i) <= window]
            if not near:
                return ToolOutput(f"No passage with chunk_id {chunk_id}", is_error=True)
            return ToolOutput(
                "\n\n---\n\n".join(
                    f"(chunk {c['chunk_id']}, page {c['page_number']}, section {c['section']})\n{c['content']}"
                    for c in near
                )
            )
        return ToolOutput(f"Unknown documents tool {tool}", is_error=True)


def summarize_args(arguments: dict[str, Any], limit: int = 140) -> str:
    s = json.dumps(arguments, ensure_ascii=False)
    return s if len(s) <= limit else s[:limit] + "…"
