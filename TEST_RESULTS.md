# Test Results

Last updated: 2026-08-01

## Automated Checks

The following checks are expected to pass before publishing:

```powershell
node check.mjs
node cloud-core.test.mjs
python -m py_compile backend/app.py
```

## Covered Areas

- Frontend script parsing
- Duplicate ID detection
- Translation coverage for generated UI
- Account isolation helpers
- Read-only sharing privacy filters
- Timer and calendar behavior checks
- Backend syntax validation
- Deployment configuration checks

## Manual Checks Recommended Before a Demo

- Register a test account.
- Log in and create a new study workspace.
- Add a course, category, and task.
- Start and save a count-up timer session.
- Start and save a countdown timer session.
- Add an exam to the calendar.
- Enable and open a read-only sharing link in another browser.
- Confirm private notes and timer records are not visible in the shared view.
