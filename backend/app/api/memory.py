import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.deps import DB, ContainerDep, CurrentUser
from app.api.schemas import MemoryOut
from app.db.models import Memory

router = APIRouter(prefix="/memories", tags=["memory"])


@router.get("", response_model=list[MemoryOut])
async def list_memories(db: DB, user: CurrentUser):
    return (
        await db.scalars(select(Memory).where(Memory.user_id == user.id).order_by(Memory.created_at.desc()))
    ).all()


@router.delete("/{memory_id}", status_code=204)
async def delete_memory(memory_id: uuid.UUID, c: ContainerDep, user: CurrentUser):
    if not await c.memory.delete(user.id, memory_id):
        raise HTTPException(404, "Memory not found")
