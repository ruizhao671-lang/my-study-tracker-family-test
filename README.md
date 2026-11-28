# Study Tracker

A full-stack study planning and progress-tracking web app for students.

The project started as a personal tool for organizing university courses, exam preparation, study tasks, and focused study time. It has grown into a browser-based study workspace with account-based cloud sync, progress visualization, templates, timers, calendar items, and read-only sharing.

## Highlights

- Multi-level study structure: study stages, courses, categories, and tasks.
- Bulk creation for repeated courses, categories, and tasks.
- Course and study-stage templates.
- Copy and paste across study stages, courses, categories, and tasks.
- Task notes and attachment metadata fields.
- Progress views:
  - list view with progress bars
  - pie chart view
  - early garden / field visualization
- Study timer:
  - count-up timer
  - countdown timer for exam practice and timed exercises
  - pause countdown
  - manual study time entry
  - day calendar and daily timeline
- Study timetable with month, week and day views, course filters, task bricks, and shared planned/actual records.
- Calendar items:
  - exams with subject, time, location, and requirements
  - general calendar items
- Account system with private study spaces.
- Automatic cloud sync through a FastAPI backend.
- Read-only family sharing with privacy filtering.
- Backup export and import.
- Editable study-plan imports with per-item before/after review and explicit apply/keep choices.
- Incremental plan updates by stable source ID: append new IDs, retain omitted tasks and fields, and preserve actual study records.
- Fixed and flexible scheduling modes, with protected fixed sessions and reusable flexible task bricks.
- Semester calendar weeks alongside ISO calendar week (KW) numbers, without changing course-specific Week labels.
- Per-course plan history with comparison and protected restore (up to 20 recent versions, subject to storage limits).
- Chinese-first interface with English language support.

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Python, FastAPI
- Database:
  - SQLite for local development
  - PostgreSQL for deployment
- Deployment-ready with Docker and Render-style configuration
- Automated checks with Node.js scripts and Python syntax checks

## Architecture

```text
public/
  index.html          Main frontend app
  i18n.js             Chinese / English translation layer
  api-sync.js         Account, sync, auth, and sharing client
  cloud-core.js       State sanitization and sharing helpers

backend/
  app.py              FastAPI app, auth, workspace API, sharing API

check.mjs             Frontend and static behavior checks
cloud-core.test.mjs   Privacy and account-isolation tests
api-test.py           Backend API tests
open-source-check.mjs Public release readiness checks
```

## Privacy Model

The app separates three kinds of data:

- Private account data: saved in the user's own workspace.
- Local browser cache: used for quick loading and offline-ish protection.
- Read-only shared data: generated as a sanitized copy for family viewing.

Read-only sharing intentionally removes private notes, attachments, templates, and personal study timer records from the shared copy.

## Local Development

Create a Python virtual environment and install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt httpx==0.28.1
```

Start the app locally:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8090
```

Open:

```text
http://127.0.0.1:8090
```

## Environment Variables

For local development, the app can run with SQLite without setting `DATABASE_URL`.

For deployed PostgreSQL usage, set:

```text
DATABASE_URL=your-postgresql-connection-string
REGISTRATION_INVITE_CODE=your-development-invite-code
```

Do not commit real secrets. Use `.env.example` as the template.

## Checks

```powershell
node check.mjs
node cloud-core.test.mjs
node degree-plan.test.mjs
node study-plan.test.mjs
node study-plan-update.test.mjs
node study-scheduling-mode.test.mjs
node study-month.test.mjs
node study-bricks.test.mjs
node study-calendar-overview.test.mjs
node open-source-check.mjs
.\.venv\Scripts\python.exe api-test.py
```

The checks cover frontend structure, translation coverage, timer behavior, task windows and multiple planned sessions, account isolation, sharing privacy, backend API behavior, and public-release safety basics.

Browser checks (with `PLAYWRIGHT_MODULE`, `BROWSER_EXECUTABLE` and `STUDY_TRACKER_TEST_URL` configured) include `study-plan-browser.test.mjs`, `study-plan-review-browser.test.mjs`, `study-plan-update-browser.test.mjs`, `study-plan-hierarchy-browser.test.mjs`, `study-scheduling-mode-browser.test.mjs`, `calendar-status-browser.test.mjs`, `study-bricks-browser.test.mjs` and `study-calendar-overview-browser.test.mjs`. The task-brick check exercises imports, split sessions, dragging, resizing, unscheduling, timing, manual completion, reload persistence and mobile layout.

Import previews use the new plan by default. Bulk actions apply or keep matched items, with editable individual overrides. Completion, actual timer records and unmentioned tasks are retained. Both v1 and v2 import links remain compatible.

All progress courses and tasks automatically appear in the planner, including courses outside an ECTS plan. Progress is the sole task store; old standalone plan tasks migrate with their IDs, completion, notes and actual records intact. Schedule metadata for progress-only courses stays on the existing course, without creating graduation modules.

The sidebar is only for incomplete tasks with no allocated session. It can show all courses or one course. Any allocation removes a task from the shelf, including partial allocations; the calendar dialog shows remaining hours and offers another session. Canceling the last allocation returns the task. Fixed classes cannot be moved by dragging, but can be canceled or edited. A calendar × deletes the shared task; canceling a session keeps it. Deleted planned blocks leave the active calendar and are archived; actual timer records are retained.

Weekly category scheduling asks for a first task, first week, weekday and times, then automatically fills consecutive dates. The editable preview supports skip weeks and explicit overlap confirmation. Existing manual slots, fixed classes and completed tasks remain protected. Older course-week anchor rules continue to work. Canceled generated slots stay canceled; new matching tasks can follow the saved rule.

Run `node study-simple-planner.test.mjs` and `node study-simple-planner-browser.test.mjs` for the simplified planner and progress-only course coverage. The browser check covers scheduling, splitting, canceling, dragging back, task deletion, fixed classes, weekly dates, imports through the editor, task timers, reloads and mobile layout.

Run `node study-weekly-sync.test.mjs` and `node study-weekly-sync-browser.test.mjs` (with the same browser environment) for batch scheduling and cross-panel synchronization checks.

## Current Limitations

- This is still a prototype / test version, not a finished commercial product.
- Attachments are currently represented inside app state and are not yet stored in a dedicated object-storage service.
- Password reset and email verification are planned but not implemented yet.
- Shared editing permissions are planned but not implemented yet.
- The garden visualization is an early prototype and needs visual design work.

## Roadmap

Planned directions include:

- Study time planning based on expected and actual task duration.
- Exam-based study planning.
- Pomodoro timer mode.
- Better visual themes.
- Course-specific AI tutor.
- Optional import from university learning platforms, when allowed by the user and platform rules.

## License

MIT License.
