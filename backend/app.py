import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time
import uuid
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

try:
    import psycopg
    from psycopg import IntegrityError as PsycopgIntegrityError
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None
    PsycopgIntegrityError = type("PsycopgIntegrityError", (Exception,), {})
    dict_row = None


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
DATA_DIR = Path(os.environ.get("STUDY_TRACKER_DATA_DIR", ROOT / "backend" / "data"))
DATABASE_PATH = DATA_DIR / "study_tracker.db"
DATABASE_URL = os.environ.get("DATABASE_URL", "")
REGISTRATION_INVITE_CODE = os.environ.get("REGISTRATION_INVITE_CODE", "").strip()
USING_POSTGRES = DATABASE_URL.startswith(("postgres://", "postgresql://"))
MAX_STATE_BYTES = 2 * 1024 * 1024
SESSION_SECONDS = 30 * 24 * 60 * 60
RATE_LIMITS = {
    "register": (5, 60 * 60),
    "login": (12, 10 * 60),
}
rate_events: dict[str, deque[float]] = defaultdict(deque)
rate_lock = threading.Lock()

app = FastAPI(title="Study Tracker API", version="0.1.0")


@app.middleware("http")
async def security_headers(request: Request, call_next: Any) -> Any:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


class Credentials(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=200)


class RegistrationCredentials(Credentials):
    invite_code: str = Field(min_length=1, max_length=200)


class WorkspaceBody(BaseModel):
    state: dict[str, Any]
    client_updated_at: int = Field(default_factory=lambda: int(time.time() * 1000))


class ShareBody(BaseModel):
    enabled: bool


class Database:
    def __init__(self) -> None:
        if USING_POSTGRES:
            if not psycopg:
                raise RuntimeError("PostgreSQL support requires psycopg.")
            self.connection = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        else:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            self.connection = sqlite3.connect(DATABASE_PATH)
            self.connection.row_factory = sqlite3.Row
            self.connection.execute("PRAGMA foreign_keys = ON")

    def execute(self, statement: str, parameters: tuple[Any, ...] = ()) -> Any:
        if USING_POSTGRES:
            statement = statement.replace("?", "%s")
        return self.connection.execute(statement, parameters)

    def __enter__(self) -> "Database":
        self.connection.__enter__()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> Any:
        return self.connection.__exit__(exception_type, exception, traceback)


def connect() -> Database:
    return Database()


def initialize_database() -> None:
    statements = (
        """
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at BIGINT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS workspaces (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          state_json TEXT NOT NULL,
          client_updated_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS shares (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          state_json TEXT NOT NULL,
          updated_at BIGINT NOT NULL
        )
        """,
    )
    with connect() as db:
        for statement in statements:
            db.execute(statement)


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if "@" not in normalized or len(normalized) > 254:
        raise HTTPException(status_code=400, detail="invalid_email")
    return normalized


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return f"{salt.hex()}:{digest.hex()}"


def password_matches(password: str, encoded: str) -> bool:
    salt_hex, expected_hex = encoded.split(":", 1)
    actual = password_hash(password, bytes.fromhex(salt_hex)).split(":", 1)[1]
    return hmac.compare_digest(actual, expected_hex)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(db: Database, user_id: str) -> str:
    db.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (token_hash(token), user_id, int(time.time()) + SESSION_SECONDS),
    )
    return token


def enforce_rate_limit(request: Request, action: str, identity: str = "") -> None:
    limit, window_seconds = RATE_LIMITS[action]
    client_host = request.client.host if request.client else "unknown"
    identity_hash = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16] if identity else ""
    key = f"{action}:{client_host}:{identity_hash}"
    now = time.monotonic()
    with rate_lock:
        events = rate_events[key]
        while events and events[0] <= now - window_seconds:
            events.popleft()
        if len(events) >= limit:
            raise HTTPException(status_code=429, detail="too_many_attempts")
        events.append(now)


def current_user(authorization: str | None = Header(default=None)) -> Any:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
    token = authorization.removeprefix("Bearer ").strip()
    with connect() as db:
        row = db.execute(
            """
            SELECT users.id, users.email
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (token_hash(token), int(time.time())),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session")
    return row


def empty_state() -> dict[str, Any]:
    return {"ownerName": "", "semesters": [], "courseTemplates": []}


def shared_state(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "ownerName": source.get("ownerName", ""),
        "courseTemplates": [],
        "semesters": [
            {
                "id": semester.get("id"),
                "name": semester.get("name", ""),
                "kind": "module" if semester.get("kind") == "module" else "semester",
                "collapsed": bool(semester.get("collapsed")),
                "infoCollapsed": True,
                "note": "",
                "attachments": [],
                "courses": [
                    {
                        "id": course.get("id"),
                        "name": course.get("name", ""),
                        "label": course.get("label", ""),
                        "collapsed": bool(course.get("collapsed")),
                        "infoCollapsed": True,
                        "note": "",
                        "attachments": [],
                        "categories": [
                            {
                                "id": category.get("id"),
                                "name": category.get("name", ""),
                                "collapsed": bool(category.get("collapsed")),
                                "tasks": [
                                    {
                                        "id": task.get("id"),
                                        "title": task.get("title", ""),
                                        "detail": task.get("detail", ""),
                                        "name": task.get("name", ""),
                                        "done": bool(task.get("done")),
                                        "collapsed": True,
                                        "note": "",
                                        "attachments": [],
                                    }
                                    for task in category.get("tasks", [])
                                ],
                            }
                            for category in course.get("categories", [])
                        ],
                    }
                    for course in semester.get("courses", [])
                ],
            }
            for semester in source.get("semesters", [])
        ],
    }


def encode_state(state: dict[str, Any]) -> str:
    encoded = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_STATE_BYTES:
        raise HTTPException(status_code=413, detail="state_too_large")
    return encoded


def refresh_share(db: Database, user_id: str, state: dict[str, Any]) -> None:
    db.execute(
        "UPDATE shares SET state_json = ?, updated_at = ? WHERE user_id = ?",
        (encode_state(shared_state(state)), int(time.time() * 1000), user_id),
    )


@app.on_event("startup")
def startup() -> None:
    initialize_database()


@app.get("/api/health")
def health() -> dict[str, str]:
    with connect() as db:
        db.execute("SELECT 1").fetchone()
    return {"status": "ok", "database": "ok"}


@app.post("/api/auth/register")
def register(credentials: RegistrationCredentials, request: Request) -> dict[str, Any]:
    email = normalize_email(credentials.email)
    enforce_rate_limit(request, "register", email)
    if not REGISTRATION_INVITE_CODE:
        raise HTTPException(status_code=503, detail="registration_closed")
    if not hmac.compare_digest(credentials.invite_code, REGISTRATION_INVITE_CODE):
        raise HTTPException(status_code=403, detail="invalid_invite_code")
    user_id = str(uuid.uuid4())
    now = int(time.time() * 1000)
    try:
        with connect() as db:
            db.execute(
                "INSERT INTO users(id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (user_id, email, password_hash(credentials.password), now),
            )
            db.execute(
                "INSERT INTO workspaces(user_id, state_json, client_updated_at, updated_at) VALUES (?, ?, ?, ?)",
                (user_id, encode_state(empty_state()), now, now),
            )
            token = create_session(db, user_id)
    except (sqlite3.IntegrityError, PsycopgIntegrityError):
        raise HTTPException(status_code=409, detail="email_already_exists")
    return {"token": token, "user": {"id": user_id, "email": email}}


@app.post("/api/auth/login")
def login(credentials: Credentials, request: Request) -> dict[str, Any]:
    email = normalize_email(credentials.email)
    enforce_rate_limit(request, "login", email)
    with connect() as db:
        user = db.execute(
            "SELECT id, email, password_hash FROM users WHERE email = ?", (email,)
        ).fetchone()
        if not user or not password_matches(credentials.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="invalid_credentials")
        token = create_session(db, user["id"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"]}}


@app.post("/api/auth/logout")
def logout(
    authorization: str | None = Header(default=None),
    user: Any = Depends(current_user),
) -> dict[str, bool]:
    token = authorization.removeprefix("Bearer ").strip()
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE token_hash = ? AND user_id = ?", (token_hash(token), user["id"]))
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: Any = Depends(current_user)) -> dict[str, Any]:
    return {"user": {"id": user["id"], "email": user["email"]}}


@app.get("/api/workspace")
def get_workspace(user: Any = Depends(current_user)) -> dict[str, Any]:
    with connect() as db:
        row = db.execute(
            "SELECT state_json, client_updated_at, updated_at FROM workspaces WHERE user_id = ?",
            (user["id"],),
        ).fetchone()
        share = db.execute("SELECT token FROM shares WHERE user_id = ?", (user["id"],)).fetchone()
    return {
        "state": json.loads(row["state_json"]) if row else empty_state(),
        "clientUpdatedAt": row["client_updated_at"] if row else 0,
        "updatedAt": row["updated_at"] if row else 0,
        "shareEnabled": bool(share),
        "shareToken": share["token"] if share else None,
    }


@app.put("/api/workspace")
def put_workspace(body: WorkspaceBody, user: Any = Depends(current_user)) -> dict[str, int]:
    encoded = encode_state(body.state)
    now = int(time.time() * 1000)
    with connect() as db:
        db.execute(
            """
            INSERT INTO workspaces(user_id, state_json, client_updated_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              state_json = excluded.state_json,
              client_updated_at = excluded.client_updated_at,
              updated_at = excluded.updated_at
            """,
            (user["id"], encoded, body.client_updated_at, now),
        )
        refresh_share(db, user["id"], body.state)
    return {"clientUpdatedAt": body.client_updated_at, "updatedAt": now}


@app.put("/api/share")
def change_share(body: ShareBody, user: Any = Depends(current_user)) -> dict[str, Any]:
    with connect() as db:
        if not body.enabled:
            db.execute("DELETE FROM shares WHERE user_id = ?", (user["id"],))
            return {"enabled": False, "token": None}
        row = db.execute("SELECT state_json FROM workspaces WHERE user_id = ?", (user["id"],)).fetchone()
        state = json.loads(row["state_json"]) if row else empty_state()
        existing = db.execute("SELECT token FROM shares WHERE user_id = ?", (user["id"],)).fetchone()
        share_token = existing["token"] if existing else secrets.token_urlsafe(24)
        db.execute(
            """
            INSERT INTO shares(token, user_id, state_json, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
            """,
            (share_token, user["id"], encode_state(shared_state(state)), int(time.time() * 1000)),
        )
    return {"enabled": True, "token": share_token}


@app.get("/api/shared/{share_token}")
def get_shared(share_token: str) -> dict[str, Any]:
    with connect() as db:
        row = db.execute("SELECT state_json, updated_at FROM shares WHERE token = ?", (share_token,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="share_not_found")
    return {"state": json.loads(row["state_json"]), "updatedAt": row["updated_at"]}


app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="public")
