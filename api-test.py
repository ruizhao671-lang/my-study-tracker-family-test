import json
import os
import tempfile
from pathlib import Path

os.environ["STUDY_TRACKER_DATA_DIR"] = tempfile.mkdtemp(prefix="study-tracker-api-test-")
os.environ["REGISTRATION_INVITE_CODE"] = "family-test-invite"

from fastapi.testclient import TestClient

from backend.app import app


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


private_state = {
    "ownerName": "小林",
    "courseTemplates": [{"id": "secret-template"}],
    "semesters": [{
        "id": "semester-a",
        "name": "第四学期",
        "note": "PRIVATE_NOTE",
        "attachments": [{"name": "secret.pdf"}],
        "courses": [{
            "id": "course-a",
            "name": "数学",
            "label": "公共课",
            "note": "PRIVATE_COURSE_NOTE",
            "attachments": [],
            "categories": [{
                "id": "category-a",
                "name": "复习",
                "tasks": [{
                    "id": "task-a",
                    "title": "第一章",
                    "detail": "傅里叶",
                    "done": True,
                    "note": "PRIVATE_TASK_NOTE",
                    "attachments": [{"name": "secret-task.pdf"}],
                }],
            }],
        }],
    }],
}


with TestClient(app) as client:
    health_response = client.get("/api/health")
    assert health_response.json() == {"status": "ok", "database": "ok"}
    assert health_response.headers["cache-control"] == "no-store"
    assert health_response.headers["x-content-type-options"] == "nosniff"
    assert health_response.headers["x-frame-options"] == "DENY"

    assert client.post(
        "/api/auth/register",
        json={"email": "wrong@example.com", "password": "password-a", "invite_code": "wrong"},
    ).status_code == 403

    first = client.post("/api/auth/register", json={"email": "a@example.com", "password": "password-a", "invite_code": "family-test-invite"}).json()
    second = client.post("/api/auth/register", json={"email": "b@example.com", "password": "password-b", "invite_code": "family-test-invite"}).json()
    token_a = first["token"]
    token_b = second["token"]

    assert client.put("/api/workspace", headers=auth(token_a), json={"state": private_state, "client_updated_at": 100}).status_code == 200
    assert client.get("/api/workspace", headers=auth(token_a)).json()["state"]["ownerName"] == "小林"
    assert client.get("/api/workspace", headers=auth(token_b)).json()["state"]["ownerName"] == ""

    share = client.put("/api/share", headers=auth(token_a), json={"enabled": True}).json()
    shared = client.get(f"/api/shared/{share['token']}").json()["state"]
    serialized = json.dumps(shared, ensure_ascii=False)
    assert "PRIVATE_NOTE" not in serialized
    assert "secret.pdf" not in serialized
    assert "secret-template" not in serialized
    assert shared["semesters"][0]["courses"][0]["categories"][0]["tasks"][0]["done"] is True
    assert shared["semesters"][0]["courses"][0]["label"] == "公共课"

    assert client.put("/api/share", headers=auth(token_a), json={"enabled": False}).status_code == 200
    assert client.get(f"/api/shared/{share['token']}").status_code == 404
    assert client.get("/api/workspace").status_code == 401

    for _ in range(4):
        assert client.post("/api/auth/register", json={"email": "a@example.com", "password": "password-a", "invite_code": "family-test-invite"}).status_code == 409
    assert client.post("/api/auth/register", json={"email": "a@example.com", "password": "password-a", "invite_code": "family-test-invite"}).status_code == 429

print("PASS FastAPI health, rate limiting, account isolation, private workspace, and revocable read-only sharing")
