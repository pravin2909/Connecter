import json
import logging
import re
import uuid
from typing import Any

from openai import AsyncOpenAI, BadRequestError

from app.config import Settings
from app.llm.base import LLMResponse, ToolCallRequest

log = logging.getLogger(__name__)

# Some models emit hidden reasoning inline (e.g. in <think> tags). It is stripped — never
# shown to the user or stored.
_THINK_RE = re.compile(r"<think>.*?(</think>|$)", re.DOTALL | re.IGNORECASE)
_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)

# gpt-oss "harmony" artifacts that some OpenAI-compatible servers leak into content:
# a leaked `to=functions.name ...` tool call (up to the next channel marker) and the special
# tokens like <|channel|>/<|message|>. Strip them so they never reach the user. We avoid
# stripping bare words like "final"/"commentary", which also occur in normal answers.
_HARMONY_TOKEN_RE = re.compile(r"<\|[^|>]*\|>")
_HARMONY_CALL_RE = re.compile(r"to=\w[\w.]*.*?(?=<\|message\|>|<\|channel\|>|$)", re.DOTALL | re.IGNORECASE)


def strip_reasoning(text: str | None) -> str:
    text = _THINK_RE.sub("", text or "")
    text = _HARMONY_CALL_RE.sub("", text)
    text = _HARMONY_TOKEN_RE.sub("", text)
    return text.strip()


def _tool_call(call_id: str | None, name: str, raw: str) -> ToolCallRequest:
    """Build a ToolCallRequest from raw function-call JSON, tolerating bad JSON."""
    try:
        args = json.loads(raw) if raw.strip() else {}
        err = None if isinstance(args, dict) else "arguments must be a JSON object"
    except json.JSONDecodeError as e:
        args, err = {}, f"invalid JSON arguments: {e}"
    return ToolCallRequest(
        id=call_id or f"call_{uuid.uuid4().hex[:12]}",
        name=name,
        arguments=args if isinstance(args, dict) else {},
        raw_arguments=raw,
        parse_error=err,
    )


def extract_json(text: str) -> dict[str, Any]:
    text = strip_reasoning(text)
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = _JSON_BLOCK_RE.search(text)
        if not match:
            raise
        return json.loads(match.group(0))


class OpenAICompatibleProvider:
    """Talks to any OpenAI-compatible server (LM Studio, vLLM, Ollama, ...)."""

    def __init__(self, settings: Settings):
        self.model = settings.llm_model
        self.temperature = settings.llm_temperature
        self.client = AsyncOpenAI(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key or "not-needed",
            timeout=settings.llm_timeout_s,
        )
        self._structured_output_supported = True

    async def chat(self, messages, tools=None, temperature=None, on_token=None) -> LLMResponse:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature if temperature is None else temperature,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        if on_token is not None:
            return await self._chat_streaming(kwargs, on_token)
        resp = await self.client.chat.completions.create(**kwargs)
        choice = resp.choices[0]
        calls = []
        for tc in choice.message.tool_calls or []:
            calls.append(_tool_call(tc.id, tc.function.name, tc.function.arguments or "{}"))
        return LLMResponse(
            content=strip_reasoning(choice.message.content),
            tool_calls=calls,
            finish_reason=choice.finish_reason,
        )

    async def _chat_streaming(self, kwargs: dict[str, Any], on_token) -> LLMResponse:
        """Stream the completion, emitting user-visible answer text through `on_token` as it
        arrives. Reasoning inside <think>…</think> is never emitted (we diff the cleaned
        text, so an unterminated think block simply holds back output until it closes)."""
        stream = await self.client.chat.completions.create(**kwargs, stream=True)
        raw, emitted, finish = "", 0, None
        frags: dict[int, dict[str, str]] = {}
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            finish = chunk.choices[0].finish_reason or finish
            if delta.content:
                raw += delta.content
                clean = strip_reasoning(raw)
                if len(clean) > emitted:
                    await on_token(clean[emitted:])
                    emitted = len(clean)
            for tc in delta.tool_calls or []:
                frag = frags.setdefault(tc.index, {"id": "", "name": "", "args": ""})
                if tc.id:
                    frag["id"] = tc.id
                if tc.function and tc.function.name:
                    frag["name"] = tc.function.name
                if tc.function and tc.function.arguments:
                    frag["args"] += tc.function.arguments
        calls = [_tool_call(f["id"], f["name"], f["args"] or "{}") for _, f in sorted(frags.items())]
        return LLMResponse(content=strip_reasoning(raw), tool_calls=calls, finish_reason=finish)

    async def complete_json(self, messages, schema, name="result") -> dict[str, Any]:
        """Structured output via JSON schema when the server supports it, else prompt + parse."""
        if self._structured_output_supported:
            try:
                resp = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=0,
                    response_format={
                        "type": "json_schema",
                        "json_schema": {"name": name, "schema": schema, "strict": True},
                    },
                )
                return extract_json(resp.choices[0].message.content or "")
            except BadRequestError:
                log.info("Structured output unsupported by %s; falling back to prompting", self.model)
                self._structured_output_supported = False
        hint = {
            "role": "system",
            "content": "Respond with ONLY a JSON object matching this schema, no prose:\n"
            + json.dumps(schema),
        }
        resp = await self.client.chat.completions.create(
            model=self.model, messages=[*messages, hint], temperature=0
        )
        return extract_json(resp.choices[0].message.content or "")

    async def list_models(self) -> list[str]:
        page = await self.client.models.list()
        return [m.id for m in page.data]


class VisionProvider:
    """A separate multimodal model used only to 'look' at the browser screen for computer-use.
    Keeps the main reasoning model (which may be text-only, like gpt-oss) unchanged."""

    def __init__(self, settings: Settings):
        self.model = settings.vision_model
        self.client = AsyncOpenAI(
            base_url=settings.vision_base_url or settings.llm_base_url,
            api_key=settings.vision_api_key or settings.llm_api_key or "not-needed",
            timeout=settings.llm_timeout_s,
        )

    async def see(self, prompt: str, image_b64: str, mime: str = "image/jpeg") -> str:
        resp = await self.client.chat.completions.create(
            model=self.model,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
                    ],
                }
            ],
        )
        return strip_reasoning(resp.choices[0].message.content)
