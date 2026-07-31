import json
import os
import tempfile

os.environ["STUDY_TRACKER_DATA_DIR"] = tempfile.mkdtemp(prefix="study-tracker-api-test-")
os.environ["REGISTRATION_INVITE_CODE"] = "test-invite-code"

from fastapi.testclient import TestClient

from backend.app import app


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


private_state = {
    "ownerName": "Demo User",
    "courseTemplates": [{"id": "private-template"}],
    "semesters": [
        {
            "id": "semester-a",
            "name": "Demo study stage",
            "note": "PRIVATE_STAGE_NOTE",
            "attachments": [{"name": "private-stage.pdf"}],
            "courses": [
                {
                    "id": "course-a",
                    "name": "Math",
                    "label": "General course",
                    "note": "PRIVATE_COURSE_NOTE",
                    "attachments": [],
                    "categories": [
                        {
                            "id": "category-a",
                            "name": "Review",
                            "note": "PRIVATE_CATEGORY_NOTE",
                            "attachments": [{"name": "private-category.png"}],
                            "tasks": [
                                {
                                    "id": "task-a",
                                    "title": "Chapter 1",
                                    "detail": "Limits",
                                    "done": True,
                                    "note": "PRIVATE_TASK_NOTE",
                                    "attachments": [{"name": "private-task.pdf"}],
                                }
                            ],
                        }
                    ],
                }
            ],
        }
    ],
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

    first = client.post(
        "/api/auth/register",
        json={"email": "a@example.com", "password": "password-a", "invite_code": "test-invite-code"},
    ).json()
    second = client.post(
        "/api/auth/register",
        json={"email": "b@example.com", "password": "password-b", "invite_code": "test-invite-code"},
    ).json()
    token_a = first["token"]
    token_b = second["token"]

    assert client.put(
        "/api/workspace",
        headers=auth(token_a),
        json={"state": private_state, "client_updated_at": 100},
    ).status_code == 200
    assert client.get("/api/workspace", headers=auth(token_a)).json()["state"]["ownerName"] == "Demo User"
    assert client.get("/api/workspace", headers=auth(token_b)).json()["state"]["ownerName"] == ""

    share = client.put("/api/share", headers=auth(token_a), json={"enabled": True}).json()
    shared = client.get(f"/api/shared/{share['token']}").json()["state"]
    serialized = json.dumps(shared, ensure_ascii=False)
    assert "PRIVATE_STAGE_NOTE" not in serialized
    assert "private-stage.pdf" not in serialized
    assert "private-template" not in serialized
    assert shared["semesters"][0]["courses"][0]["categories"][0]["tasks"][0]["done"] is True
    assert shared["semesters"][0]["courses"][0]["label"] == "General course"

    assert client.put("/api/share", headers=auth(token_a), json={"enabled": False}).status_code == 200
    assert client.get(f"/api/shared/{share['token']}").status_code == 404
    assert client.get("/api/workspace").status_code == 401

    for _ in range(4):
        assert client.post(
            "/api/auth/register",
            json={"email": "a@example.com", "password": "password-a", "invite_code": "test-invite-code"},
        ).status_code == 409
    assert client.post(
        "/api/auth/register",
        json={"email": "a@example.com", "password": "password-a", "invite_code": "test-invite-code"},
    ).status_code == 429

print("PASS FastAPI health, rate limiting, account isolation, private workspace, and read-only sharing")
