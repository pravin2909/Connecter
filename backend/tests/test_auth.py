"""Auth: password/session primitives and per-user API scoping (needs the Postgres from docker compose)."""

import uuid

import pytest
from fastapi import HTTPException

from app.api import conversations as conv_api
from app.api.schemas import ConversationCreate
from app.auth import service as auth
from app.db.models import User
from app.db.session import SessionLocal


def test_password_hash_roundtrip():
    h = auth.hash_password("correct horse battery staple")
    assert h and h != "correct horse battery staple"
    assert auth.verify_password(h, "correct horse battery staple")
    assert not auth.verify_password(h, "wrong")
    assert not auth.verify_password(None, "anything")


async def _mk_user(db) -> User:
    user = await auth.create_user(db, f"{uuid.uuid4().hex}@example.com", "password123", "Test")
    await db.commit()
    await db.refresh(user)
    return user


async def test_session_token_roundtrip():
    async with SessionLocal() as db:
        user = await _mk_user(db)
        token = await auth.create_session(db, user.id, ttl_days=30)
        await db.commit()
        assert (await auth.user_for_token(db, token)).id == user.id
        assert await auth.user_for_token(db, "not-a-real-token") is None
        await auth.revoke_token(db, token)
        await db.commit()
        assert await auth.user_for_token(db, token) is None
        await db.delete(await db.get(User, user.id))
        await db.commit()


async def test_conversations_are_scoped_per_user():
    async with SessionLocal() as db:
        alice, bob = await _mk_user(db), await _mk_user(db)
        a_conv = await conv_api.create_conversation(ConversationCreate(title="Alice"), db, alice)
        await conv_api.create_conversation(ConversationCreate(title="Bob"), db, bob)

        alice_list = await conv_api.list_conversations(db, alice)
        assert [c.id for c in alice_list] == [a_conv.id]  # Bob's conversation is invisible

        # Bob cannot read Alice's conversation by id.
        with pytest.raises(HTTPException) as exc:
            await conv_api.get_conversation(a_conv.id, db, bob)
        assert exc.value.status_code == 404

        for u in (alice, bob):
            await db.delete(await db.get(User, u.id))  # cascade removes their conversations
        await db.commit()
