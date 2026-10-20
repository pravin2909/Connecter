"""Password hashing and opaque session tokens.

Sessions are server-side: a random token is handed to the client in an httpOnly cookie
and only its SHA-256 is stored, so the database never holds anything replayable.
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Session, User

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    if not password_hash:
        return False
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def _token_hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


async def create_user(db: AsyncSession, email: str, password: str, display_name: str | None = None) -> User:
    user = User(
        email=email.strip().lower(),
        display_name=(display_name or email.split("@")[0]).strip()[:120],
        password_hash=hash_password(password),
    )
    db.add(user)
    await db.flush()
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email == email.strip().lower()))


async def authenticate(db: AsyncSession, email: str, password: str) -> User | None:
    user = await get_user_by_email(db, email)
    if user is None or not verify_password(user.password_hash, password):
        return None
    return user


async def create_session(db: AsyncSession, user_id, ttl_days: int, user_agent: str | None = None) -> str:
    """Create a login session and return the raw token to set as a cookie."""
    raw = secrets.token_urlsafe(32)
    db.add(
        Session(
            user_id=user_id,
            token_hash=_token_hash(raw),
            user_agent=(user_agent or "")[:512] or None,
            expires_at=datetime.now(UTC) + timedelta(days=ttl_days),
        )
    )
    await db.flush()
    return raw


async def user_for_token(db: AsyncSession, raw_token: str) -> User | None:
    sess = await db.scalar(select(Session).where(Session.token_hash == _token_hash(raw_token)))
    if sess is None or sess.expires_at is None or sess.expires_at < datetime.now(UTC):
        return None
    return await db.get(User, sess.user_id)


async def revoke_token(db: AsyncSession, raw_token: str) -> None:
    await db.execute(delete(Session).where(Session.token_hash == _token_hash(raw_token)))
