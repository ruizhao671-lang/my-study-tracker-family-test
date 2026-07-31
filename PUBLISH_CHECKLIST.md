# Open Source Publishing Checklist

Use this checklist before making the repository public.

## Secrets

- [ ] No real `DATABASE_URL` is committed.
- [ ] No real `REGISTRATION_INVITE_CODE` is committed.
- [ ] No API keys, tokens, private keys, or passwords are committed.
- [ ] `.env` files are ignored.
- [ ] Local SQLite files under `backend/data/` are ignored.

## Project Presentation

- [ ] `README.md` explains the product, tech stack, features, and architecture.
- [ ] `LICENSE` exists.
- [ ] `.env.example` exists and contains placeholder values only.
- [ ] The public repository description is clear and professional.
- [ ] The repository name is suitable for a resume or internship application.

## Functionality

- [ ] `node check.mjs` passes.
- [ ] `node cloud-core.test.mjs` passes.
- [ ] `python -m py_compile backend/app.py` passes.
- [ ] Optional: `python api-test.py` passes in a local virtual environment with test dependencies.

## Privacy

- [ ] Read-only sharing does not expose notes, attachments, templates, or private timer records.
- [ ] Account data is isolated by backend authentication.
- [ ] Public documentation does not include private family test links or real user data.

## Deployment

- [ ] Production secrets are configured only through the hosting provider's environment variables.
- [ ] `/api/health` works after deployment.
- [ ] Registration, login, autosave, logout, and read-only sharing are tested after deployment.
