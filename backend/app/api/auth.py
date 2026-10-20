"""Authentication routes: register, login, logout, and the current-user probe.

Login issues an opaque session token in an httpOnly cookie. The SPA never reads the
token; it just calls /auth/me to learn whether it is signed in.
"""

from fastapi import APIRouter, HTTPException, Request, Response

from app.api.deps import DB, CurrentUser
from app.api.schemas import LoginIn, RegisterIn, UserOut
from app.auth import service as auth_service
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        s.session_cookie_name,
        token,
        max_age=s.session_ttl_days * 86400,
        httponly=True,
        samesite="lax",
        secure=s.secure_cookies,
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=201)
async def register(body: RegisterIn, request: Request, response: Response, db: DB):
    if not get_settings().auth_enabled:
        raise HTTPException(409, "Authentication is disabled (local mode).")
    if "@" not in body.email:
        raise HTTPException(422, "A valid email address is required.")
    if await auth_service.get_user_by_email(db, body.email):
        raise HTTPException(409, "An account with this email already exists.")
    user = await auth_service.create_user(db, body.email, body.password, body.display_name)
    token = await auth_service.create_session(
        db, user.id, get_settings().session_ttl_days, request.headers.get("user-agent")
    )
    await db.commit()
    await db.refresh(user)
    _set_cookie(response, token)
    return user


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, request: Request, response: Response, db: DB):
    if not get_settings().auth_enabled:
        raise HTTPException(409, "Authentication is disabled (local mode).")
    user = await auth_service.authenticate(db, body.email, body.password)
    if user is None:
        raise HTTPException(401, "Incorrect email or password.")
    token = await auth_service.create_session(
        db, user.id, get_settings().session_ttl_days, request.headers.get("user-agent")
    )
    await db.commit()
    _set_cookie(response, token)
    return user


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: DB):
    token = request.cookies.get(get_settings().session_cookie_name)
    if token:
        await auth_service.revoke_token(db, token)
        await db.commit()
    response.delete_cookie(get_settings().session_cookie_name, path="/")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user
