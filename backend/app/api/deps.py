from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service as auth_service
from app.config import get_settings
from app.db.models import User
from app.db.session import ensure_local_user, get_db
from app.services.container import Container


def get_container(request: Request) -> Container:
    return request.app.state.container


ContainerDep = Annotated[Container, Depends(get_container)]
DB = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(request: Request, db: DB) -> User:
    """The authenticated user, or — in local mode (auth_enabled=false) — the local user.

    Every user-facing route depends on this; filtering each query by the returned
    user's id is what keeps one user's data out of another's reach.
    """
    settings = get_settings()
    if not settings.auth_enabled:
        return await ensure_local_user()
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(401, "Not authenticated")
    user = await auth_service.user_for_token(db, token)
    if user is None:
        raise HTTPException(401, "Invalid or expired session")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
