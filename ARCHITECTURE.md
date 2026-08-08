# Architecture

## Overview

```
src/
├── app/
│   ├── (auth)/            Sign in/up, forgot/reset password
│   ├── (app)/             Authenticated shell (sidebar nav, notifications, ⌘K search)
│   │   ├── dashboard/     Learner home
│   │   ├── training/      Courses → modules → lessons → quizzes
│   │   ├── resources/     Star-gated resource library
│   │   ├── community/     Channels (sectioned, gated)
│   │   ├── messages/      Direct messages
│   │   ├── calls/         Live calls + recordings
│   │   ├── jobs/          Job board + applications
│   │   ├── profile/       Learner profile + editor
│   │   └── admin/         Command center, builder, learners, stars, jobs, settings, audit
│   ├── api/               Route handlers (all mutations; backend-enforced access)
│   └── welcome/           First-run onboarding
├── components/            UI components (server + client)
└── lib/                   Domain services (the heart of the app)
```

## Domain services (`src/lib`)

| Module | Responsibility |
| --- | --- |
| `auth.ts` | bcrypt hashing, DB-backed session cookies, `getCurrentUser` (request-cached), role hierarchy (`LEARNER < MODERATOR < ADMIN < SUPER_ADMIN`; `EMPLOYER` reserved) |
| `access.ts` | **The single access-control engine.** Verdicts for courses, modules (stars + prerequisites), resources, channels (stars/role/private/hidden/read-only), job board, jobs, calls. Returns structured reasons so the UI can render "requires N stars, you have M". Every API route re-checks through this engine — hiding buttons is never the security boundary. |
| `stars.ts` | Star ledger. `grantStars` writes a `StarTransaction` (with previous/new balance) and updates the cached `User.starBalance` in one DB transaction. `grantAutomaticReward` is idempotent via the unique constraint `(userId, sourceType, sourceId, type)` — a `P2002` violation means "already rewarded" and is swallowed. `adjustStarsManually` requires actor + reason and writes the audit log. After any increase, `recordUnlocks` diff-scans content between the old and new balance and writes `UnlockEvent`s + notifications. |
| `progress.ts` | Lesson start/completion, module-completion detection (all required published lessons + all published quizzes passed), continue-learning and next-star targets. Completing a module calls `grantAutomaticReward` — safe to re-trigger forever. |
| `settings.ts` | Key-value `PlatformSetting` store with typed defaults. Admin-configurable business rules (job board threshold, passing score, star deduction policy, community permissions, branding). |
| `notifications.ts` | In-app notifications; rows track `emailedAt`/`pushedAt` so email/push delivery can fan out later without schema changes. |
| `audit.ts` | Append-only `AuditLog` for administrative actions. |
| `channels.ts`, `dashboard.ts`, `award.ts`, `serializeMessage.ts` | Feature queries/serializers shared between pages and API routes. |

## Provider abstractions (`src/lib/providers`)

Nothing third-party is faked. Each provider is an interface with a `configured` flag; the UX shows honest setup notices when credentials are missing.

- **`video.ts`** — `VideoAsset { provider, reference }` resolves to `embed` (YouTube/Vimeo), `native` (direct URL / storage key), or `unavailable`. Swapping hosts (Mux, Cloudflare Stream) = adding a resolver; the LMS never changes. Video files are never stored in the database.
- **`rtc.ts`** — `RtcProvider` (Daily.co built in): `createRoom`/`getJoinUrl`. The join API returns `{ configured: false, message }` without credentials and the call page renders a setup notice instead of a dead room.
- **`email.ts`** — `EmailProvider` (Resend built in); dev fallback logs emails (password-reset links stay usable), production reports not-sent.
- **`storage.ts`** — `StorageProvider` with local-disk default (`./storage`, served by `/api/files/[...key]` behind auth, path-traversal-safe). The interface matches what an S3 client needs.

## Security model

- All mutations live in API route handlers wrapped by `withAuth`/`withRole`; zod validates every body.
- The access engine runs server-side on **both** pages and APIs: direct URL visits and raw API calls hit the same gates (verified by `scripts/journey-test.ts`).
- Quiz correct answers are never selected into page props; grading is server-side only. Retry limits enforced server-side.
- Learners cannot change stars, complete locked lessons, read staff channels or others' DMs, or see restricted jobs (including via global search).
- Role changes are SUPER_ADMIN-only; admins can't suspend peers or above; suspension kills sessions immediately.
- Password reset: single-use tokens, 1h expiry, all sessions invalidated on reset; forgot-password responds identically for unknown emails.
- Demo one-click login exists only behind `DEMO_MODE="true"`.

## Realtime

Chat, DMs, and the notification badge poll lightweight incremental endpoints (`?after=<cursor>`, 4–30s) — no page refreshes, no payload re-downloads. The polling sits behind small client hooks, so upgrading to SSE/WebSockets (with Redis pub/sub for multi-instance) is a transport swap, not a rewrite.

## Data model notes

Relational throughout (see `prisma/schema.prisma`); JSON is used only for genuinely unstructured payloads (quiz attempt responses snapshot, audit details, application answers).

- `StarTransaction` — the ledger (see above).
- `Quiz`/`QuizQuestion`/`QuizAnswer`/`QuizAttempt` — `QuestionType` enum is extensible (SHORT_ANSWER etc. later).
- `Channel` — section, `minStars`, `minRole`, `isPrivate`, `readOnly`, `hidden`; `Message.parentId` supports threads.
- `DmConversation.isGroup` + participant rows — group DMs are a flag flip, not a migration.
- `Job.employerId` + reserved `EMPLOYER` role — employer/recruiter accounts plug in without rebuilding.
- `Achievement`, `StarRule` — future gamification (badges, custom milestone rules) staked out but not cluttering the MVP UI.
- `Notification.emailedAt/pushedAt` — future email/push delivery tracking.

## Future-proofing seams

- **Multi-academy**: add `organizationId` to top-level entities; services already centralize queries.
- **PWA/mobile**: all data flows through JSON APIs; pages are thin over `lib/` services.
- **Leaderboards/streaks**: derivable from `StarTransaction` + `LessonProgress` timestamps — no schema change.
- **Recording analysis / AI coaching**: `CallRecording` rows are provider-agnostic URLs ready for pipeline processing.
