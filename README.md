# Conversion Lab — Premium Gamified Sales Training Platform

A production-quality sales academy: gamified training with a **Star progression system**, video courses, quizzes, Slack-style community channels, direct messages, live training calls, and Calendly-style 1-on-1 coaching bookings with Zoom — in one cohesive, premium interface.

> *"This is where serious salespeople train."*

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** with a custom dark, premium design system
- **PostgreSQL** + **Prisma 6**
- Cookie-session authentication (bcrypt + DB-backed sessions)
- Provider abstractions for video hosting, live video (Daily.co), 1-on-1 meetings (Zoom), email (Resend), and object storage

## Quick start

```bash
# 1. Install
npm install

# 2. Configure — copy the template and set DATABASE_URL
cp .env.example .env

# 3. Create the schema and seed demo data
npm run db:push
npm run db:seed

# 4. Run
npm run dev
```

Open http://localhost:3000.

### Demo accounts

All seeded with password **`academy123`** (sign in with the email + password form):

| Account | Role | State |
| --- | --- | --- |
| `jordan@demo.conversionlab.io` | Learner | 0 Stars — fresh start |
| `alex@demo.conversionlab.io` | Learner | 2 Stars — mid-program (Objection Handling) |
| `taylor@demo.conversionlab.io` | Learner | 5 Stars — advanced content unlocked |
| `morgan@demo.conversionlab.io` | Moderator | Community moderation |
| `admin@demo.conversionlab.io` | Admin | Full training/star/booking management |
| `owner@demo.conversionlab.io` | Super Admin | Everything, incl. role management |

## The Star system

Learners start at **0 Stars** and earn them by completing modules (all required lessons + passing the assessment). Admins can also award or deduct Stars manually — always with a reason.

- **`StarTransaction` is the source of truth.** `User.starBalance` is a cached aggregate maintained in the same DB transaction. Every change records type, source, reason, actor, and previous → new balance.
- **Exactly-once automatic rewards.** A unique constraint on `(userId, sourceType, sourceId, type)` makes it impossible for a milestone to pay out twice, no matter how many times completion is re-triggered.
- **One access engine.** `src/lib/access.ts` answers every gating question (role, stars, prerequisites, publish status, channel membership) for pages, API routes, search, and navigation alike. The backend enforces every gate — visiting a URL or calling an API directly cannot bypass a lock.
- **Locked ≠ hidden.** Locked content shows what it is, what it requires, and how close the learner is — locks are motivation, not dead ends. (Admins can fully hide specific channels.)

## What's implemented

- **Training**: courses → modules → lessons (video/text/document/link), prerequisites, star gates, star rewards, progress tracking, explicit lesson completion
- **Quizzes**: multiple choice / multiple select / true-false (extensible enum), server-side grading (correct answers never reach the client before submission), configurable passing score and retry rules, explanations, premium results + star celebration screen
- **Learner dashboard**: next-star progress, continue learning, newly unlocked, next unlock, your next 1-on-1, upcoming calls, community activity
- **Community**: sectioned channels (Community / Advanced / Staff) with star, role, read-only, private, and hidden restrictions; messages with reactions, threaded replies, edit/delete, pins, moderator deletion, mentions; light polling keeps chat live without page refreshes
- **Direct messages**: member search, 1:1 conversations (schema supports group DMs later), unread counts, recently-active indicators
- **Live calls**: scheduling, star gates, RSVPs, capacity, embedded call rooms through the RTC provider abstraction, recordings with their own star gates
- **1-on-1s**: staff set weekly availability (timezone, session length, minimum notice) in their account; learners pick a coach and a slot in their own timezone; each booking creates a Zoom meeting through the meeting provider abstraction; cancellations, notifications, admin oversight, optional star gate
- **Notifications**: in-app center + badge for stars, unlocks, quiz results, calls, DMs, mentions, replies, and 1-on-1 bookings (schema ready for email/push fan-out)
- **Global search** (⌘K): only ever returns what the user can access
- **Admin**: command center metrics + trends, visual training builder (create/edit/reorder/publish/archive, quiz editor, learner preview), star management on the ledger, learner management (progress, quiz performance, star history, manual adjustments, suspension, roles), calls + recordings, 1-on-1 bookings overview, platform settings, audit log
- **First-run experience**: welcome → profile → star explainer → straight into Lesson 1
- **Auth**: signup/signin, forgot/reset password (via email provider abstraction; dev fallback logs the link), session management, suspension enforcement

## Configuration & integrations

Business rules (1-on-1 booking star requirement, default passing score, star deduction policy, posting/DM permissions, platform branding) live in **Admin → Settings**, not in code.

External providers are integrated behind clean interfaces and degrade honestly when unconfigured (see `.env.example`):

| Provider | Env vars | Without credentials |
| --- | --- | --- |
| Daily.co (live call rooms) | `DAILY_API_KEY`, `DAILY_DOMAIN` | Scheduling/RSVPs work; join screen shows a clear "provider not connected" notice |
| Zoom (1-on-1 meetings) | `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_USER_ID` | Bookings, notifications and cancellations work; the session shows "video link not connected" instead of a link |
| Resend (email) | `RESEND_API_KEY`, `EMAIL_FROM` | Password-reset links are logged to the server console in development |
| S3-compatible storage | `S3_*` | Local `./storage` directory served via `/api/files` |
| Video hosting | — | YouTube/Vimeo/direct URLs resolve out of the box (`src/lib/providers/video.ts`); add Mux/Cloudflare Stream by adding a resolver |

## Verifying the core journey

`scripts/journey-test.ts` runs the full spec journey against a running server: signup at 0 Stars → complete Module 1 → fail then pass the quiz → star awarded exactly once through the ledger → unlocks recorded → admin awards manual stars → admin opens 1-on-1 availability → learner books a slot → double-booking rejected → both notified → cancel frees the slot → rebook — plus access-control probes (locked lessons, learner cannot edit availability, staff channels, others' DMs).

```bash
npm run build && npm start   # in one terminal
npx tsx scripts/journey-test.ts   # in another
```

## Documentation

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the data model, access-engine design, star-ledger rules, provider abstractions, and the seams left for future features (badges/leaderboards, multi-academy, PWA).
