import json
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from app.agent.runner import RunError, approval_dict
from app.api.conversations import run_detail
from app.api.deps import DB, ContainerDep, CurrentUser
from app.api.schemas import DecisionIn, RunDetail
from app.db.models import AgentRun, Approval, Conversation, ToolCall, User

router = APIRouter(tags=["runs"])


async def _owned_run(db, run_id: uuid.UUID, user: User) -> AgentRun:
    """Load a run only if it belongs to one of the user's conversations."""
    run = await db.scalar(
        select(AgentRun)
        .join(Conversation, Conversation.id == AgentRun.conversation_id)
        .where(AgentRun.id == run_id, Conversation.user_id == user.id)
    )
    if run is None:
        raise HTTPException(404, "Run not found")
    return run


@router.get("/runs/{run_id}", response_model=RunDetail)
async def get_run(run_id: uuid.UUID, db: DB, user: CurrentUser):
    run = await _owned_run(db, run_id, user)
    return await run_detail(db, run)


@router.get("/runs/{run_id}/events")
async def run_events(run_id: uuid.UUID, request: Request, c: ContainerDep, db: DB, user: CurrentUser):
    """Server-Sent Events stream of a run's live activity. Ends with a `done` event."""
    run = await _owned_run(db, run_id, user)
    after = int(request.headers.get("last-event-id") or 0)

    async def gen():
        if run.status not in ("pending", "running") and not c.bus._history.get(str(run_id)):
            # Nothing live to stream; tell the client the final state immediately.
            yield {"event": "done", "data": json.dumps({"type": "done", "status": run.status})}
            return
        async for event in c.bus.subscribe(str(run_id), after):
            if await request.is_disconnected():
                return
            yield {"id": str(event["id"]), "event": event["type"], "data": json.dumps(event, default=str)}

    return EventSourceResponse(gen(), ping=15)


@router.post("/runs/{run_id}/cancel", status_code=202)
async def cancel_run(run_id: uuid.UUID, c: ContainerDep, db: DB, user: CurrentUser):
    run = await _owned_run(db, run_id, user)
    if run.status not in ("pending", "running", "awaiting_approval"):
        raise HTTPException(409, f"Run is already {run.status}")
    await c.runner.cancel(run_id)
    return {"status": "cancelling"}


@router.get("/runs/{run_id}/screenshots/{name}")
async def screenshot(run_id: uuid.UUID, name: str, c: ContainerDep, db: DB, user: CurrentUser):
    await _owned_run(db, run_id, user)
    folder = (c.settings.screenshots_dir / str(run_id)).resolve()
    path = (folder / name).resolve()
    if not path.is_relative_to(folder) or not path.is_file():
        raise HTTPException(404)
    return FileResponse(path)


@router.get("/approvals")
async def list_approvals(db: DB, user: CurrentUser, status: str | None = "pending"):
    q = (
        select(Approval, ToolCall.arguments)
        .join(ToolCall, ToolCall.id == Approval.tool_call_id)
        .join(AgentRun, AgentRun.id == Approval.agent_run_id)
        .join(Conversation, Conversation.id == AgentRun.conversation_id)
        .where(Conversation.user_id == user.id)
    )
    if status:
        q = q.where(Approval.status == status)
    rows = (await db.execute(q.order_by(Approval.created_at.desc()).limit(200))).all()
    return [approval_dict(a, args) for a, args in rows]


@router.post("/approvals/{approval_id}/decision")
async def decide(approval_id: uuid.UUID, body: DecisionIn, c: ContainerDep, db: DB, user: CurrentUser):
    owner = await db.scalar(
        select(Conversation.user_id)
        .join(AgentRun, AgentRun.conversation_id == Conversation.id)
        .join(Approval, Approval.agent_run_id == AgentRun.id)
        .where(Approval.id == approval_id)
    )
    if owner != user.id:
        raise HTTPException(404, "Approval not found")
    try:
        appr = await c.runner.decide(approval_id, body.decision, body.note)
    except RunError as e:
        raise HTTPException(409, str(e)) from e
    return approval_dict(appr)
