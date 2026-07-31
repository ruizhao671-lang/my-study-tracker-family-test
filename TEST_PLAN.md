# Test Plan

## Frontend Structure

- The online app uses its own local storage key.
- The online app loads `i18n.js`, `cloud-bootstrap.js`, and `api-sync.js`.
- The HTML has no duplicate IDs.
- Dynamic modals and generated UI text are covered by translation checks.

## Account and Cloud Sync

- New users can register with an invite code.
- Existing users can log in.
- Passwords are stored as salted hashes, never as plain text.
- Session tokens are stored as hashes in the database.
- Each account has an isolated workspace.
- Autosave updates the backend workspace.
- Logout saves pending changes before ending the session.

## Read-Only Sharing

- Users can enable, copy, and revoke a read-only sharing link.
- Shared state is a sanitized copy.
- Shared pages do not expose private notes, attachments, templates, or personal timer records.
- Shared pages do not allow editing.

## Study Tracker

- Users can create study stages, courses, categories, and tasks.
- Bulk creation works for repeated structures.
- Copy and paste works for study stages, courses, categories, and tasks.
- Templates can be saved and reused.
- Progress bars, charts, and garden view render without breaking the data model.

## Study Timer

- Count-up timer works.
- Countdown timer works and saves at completion.
- Pause countdown works and auto-saves if the user does not return.
- Manual study time entry works.
- Timer records appear in the calendar and daily timeline.
- Timer records can be edited or deleted.
- Sub-minute records are preserved and shown with seconds.

## Calendar

- Exams can be added with subject, time, location, and requirements.
- Calendar items can be added.
- Monthly calendar and daily timeline both reflect timed items.

## Deployment

- `/api/health` verifies the web app and database connection.
- Hosted deployment uses PostgreSQL through `DATABASE_URL`.
- Local development can use SQLite.
