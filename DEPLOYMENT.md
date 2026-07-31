# Deployment Guide

This project can run as a single FastAPI web service that serves both:

- the static frontend in `public/`
- the backend API in `backend/app.py`

## Required Environment Variables

For production-style deployment with PostgreSQL:

```text
DATABASE_URL=your-postgresql-connection-string
REGISTRATION_INVITE_CODE=your-private-invite-code
```

Never commit real values to GitHub.

## Local Development

If `DATABASE_URL` is not set, the app uses local SQLite data under `backend/data/`.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt httpx==0.28.1
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8090
```

Open:

```text
http://127.0.0.1:8090
```

## Docker

The included `Dockerfile` installs Python dependencies and starts the FastAPI app.

The `.dockerignore` file excludes local databases, virtual environments, test files, and temporary files.

## Render-Style Deployment

The included `render.yaml` is configured for a free web service.

Expected setup:

1. Create a PostgreSQL database.
2. Create a web service connected to this repository.
3. Set `DATABASE_URL` as a protected environment variable.
4. Set `REGISTRATION_INVITE_CODE` as a protected environment variable.
5. Deploy the service.
6. Check `/api/health`.

## Data Persistence

Do not use SQLite for a free hosted deployment unless the platform provides persistent disk storage.

For hosted deployments, use PostgreSQL through `DATABASE_URL`.

## Cost Notes

The project is designed to work on free-tier infrastructure for testing. Free web services may sleep after inactivity, so the first load can be slow.
