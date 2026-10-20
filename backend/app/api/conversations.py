import random
import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.agent.runner import RunError, approval_dict
from app.api.deps import DB, ContainerDep, CurrentUser
from app.api.schemas import (
    ConversationCreate,
    ConversationDetail,
    ConversationOut,
    ConversationPatch,
    MessageIn,
    MessageOut,
    RunDetail,
    RunOut,
    SendResult,
    StepOut,
    ToolCallOut,
)
from app.db.models import AgentRun, AgentStep, Approval, Conversation, Message, ToolCall, User

router = APIRouter(prefix="/conversations", tags=["conversations"])

PALETTE = ["#4FA98C", "#E0A03D", "#5B6EF5", "#8B7CF0", "#4A7FE0", "#D97B3D", "#7C6FE8"]


async def _get(db, conversation_id: uuid.UUID, user: User) -> Conversation:
    """Fetch a conversation the user owns; 404 (not 403) hides others' ids."""
    convo = await db.get(Conversation, conversation_id)
    if convo is None or convo.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    return convo


@router.get("", response_model=list[ConversationOut])
async def list_conversations(db: DB, user: CurrentUser):
    return (
        await db.scalars(
            select(Conversation)
            .where(Conversation.user_id == user.id)
            .order_by(Conversation.pinned.desc(), Conversation.updated_at.desc())
        )
    ).all()


@router.post("", response_model=ConversationOut, status_code=201)
async def create_conversation(body: ConversationCreate, db: DB, user: CurrentUser):
    convo = Conversation(user_id=user.id, title=body.title or "New chat", color=body.color or random.choice(PALETTE))
    db.add(convo)
    await db.commit()
    await db.refresh(convo)
    return convo


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: uuid.UUID, db: DB, user: CurrentUser):
    convo = await _get(db, conversation_id, user)
    messages = (
        await db.scalars(select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at))
    ).all()
    runs = (
        await db.scalars(select(AgentRun).where(AgentRun.conversation_id == conversation_id).order_by(AgentRun.started_at))
    ).all()
    return ConversationDetail(
        conversation=ConversationOut.model_validate(convo),
        messages=[MessageOut.model_validate(m) for m in messages],
        runs=[await run_detail(db, r) for r in runs],
    )


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def update_conversation(conversation_id: uuid.UUID, body: ConversationPatch, db: DB, user: CurrentUser):
    convo = await _get(db, conversation_id, user)
    if body.title is not None:
        convo.title = body.title
    if body.color is not None:
        convo.color = body.color
    if body.pinned is not None:
        convo.pinned = body.pinned
    await db.commit()
    await db.refresh(convo)
    return convo


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: uuid.UUID, db: DB, c: ContainerDep, user: CurrentUser):
    await _get(db, conversation_id, user)
    active = (
        await db.scalars(
            select(AgentRun.id).where(
                AgentRun.conversation_id == conversation_id,
                AgentRun.status.in_(("running", "awaiting_approval")),
            )
        )
    ).all()
    for run_id in active:
        await c.runner.cancel(run_id)
    convo = await _get(db, conversation_id, user)
    await db.delete(convo)
    await db.commit()


@router.post("/{conversation_id}/messages", response_model=SendResult, status_code=202)
async def send_message(conversation_id: uuid.UUID, body: MessageIn, c: ContainerDep, db: DB, user: CurrentUser):
    await _get(db, conversation_id, user)  # ownership check before starting a run
    try:
        msg, run = await c.runner.start(conversation_id, body.content.strip())
    except RunError as e:
        raise HTTPException(409, str(e)) from e
    return SendResult(message=MessageOut.model_validate(msg), run=RunOut.model_validate(run))


async def run_detail(db, run: AgentRun) -> RunDetail:
    steps = (await db.scalars(select(AgentStep).where(AgentStep.agent_run_id == run.id).order_by(AgentStep.seq))).all()
    calls = (
        await db.scalars(select(ToolCall).where(ToolCall.agent_run_id == run.id).order_by(ToolCall.created_at))
    ).all()
    approvals = (
        await db.execute(
            select(Approval, ToolCall.arguments)
            .join(ToolCall, ToolCall.id == Approval.tool_call_id)
            .where(Approval.agent_run_id == run.id)
            .order_by(Approval.created_at)
        )
    ).all()
    return RunDetail(
        **RunOut.model_validate(run).model_dump(),
        steps=[StepOut.model_validate(s) for s in steps],
        tool_calls=[ToolCallOut.model_validate(t) for t in calls],
        approvals=[approval_dict(a, args) for a, args in approvals],
    )
