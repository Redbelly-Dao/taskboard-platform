# Redbelly DAO Task Board

The community task board for Redbelly DAO. Contributors browse open tasks, submit deliverables against a published rubric, reviewers score and decide, and the ledger records what was paid to whom.

## How it fits together

Work is organised into cycles. A cycle has an open date, a close date, a freeze date after which no new submissions are accepted, a last revision date, and a pay date. Those dates live in Firestore under `config/cycle` and drive every deadline in the app.

Each task carries the problem statement, technical requirements, deliverables, quality benchmarks and failure criteria, so a contributor can start from the task page alone. Submissions are capped per task. A reviewer can accept, reject, or request a revision with a deadline attached.

`config/board` holds a global pause switch. When it is set, everyone sees a maintenance notice instead of the board.

## Routes

- `/` the board, where open tasks are browsed
- `/tasks/[taskId]` a single task and its submission form
- `/submissions` a contributor's own submissions and their state
- `/dashboard` contributor overview
- `/profile` account details and wallet address
- `/reviewer` the review queue, `/reviewer/[submissionId]` to score one
- `/admin` task authoring, submission decisions, payments, cycle dates, reviewers, users, appeals, feedback and suggestion triage, audit log
- `/ledger` the public record of completed and paid work
- `/rules` the participation rules
- `/api/cron/sweep` the daily deadline sweep

## Stack

Next.js 16 on the App Router, React 19, Tailwind 4, TypeScript. Firestore for data, Firebase Auth for accounts, UploadThing for file attachments, wagmi and viem for wallet address capture.

## Running it locally

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill in `.env.local` from the Firebase console before the app will start. The comments in `.env.example` say where each value comes from.

For server side Firebase access you can either set the three `FIREBASE_ADMIN_*` variables, or drop a `service-account-key.json` at the project root for local work. That file is gitignored and must never be committed.

## Scheduled work

`app/api/cron/sweep` runs once a day at 03:00 UTC, scheduled in `vercel.json`. It auto-rejects revisions that missed their deadline, sends the day three reminder before a revision deadline, and flags overdue reviews. Everything it writes is guarded by a flag or a status check, so a re-run is a no-op on anything already handled.

The route requires `CRON_SECRET`. Without it every request gets a 401 and the sweep silently stops running, which means deadlines stop being enforced. If deadline handling ever looks stuck, check that variable first.

## Firestore

Security rules are in `firestore.rules` and composite indexes in `firestore.indexes.json`. Both deploy with the Firebase CLI:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

The rules are the real access boundary. Client side checks exist for the sake of the interface, but anything that must hold is enforced in the rules as well. Paid submissions in particular can never be deleted, by anyone, including an admin.

## Deployment

Deployed on Vercel from `main`. Pushing to `main` ships to production.
