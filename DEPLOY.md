# Deploying Conversion Lab

The recommended stack is **Vercel** (app hosting) + **Neon** (managed PostgreSQL). Both have free tiers that comfortably run the demo.

## 1. Create the database (Neon)

1. Sign up at [neon.tech](https://neon.tech) and create a project.
2. Copy the connection string (looks like `postgresql://user:password@ep-xxx.aws.neon.tech/neondb?sslmode=require`).

Any other managed Postgres (Supabase, Railway, RDS) works identically — you only need the connection string.

## 2. Deploy the app (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the `conversion-lab-leanring` GitHub repo.
2. Select the `main` branch. Framework preset: **Next.js** (auto-detected). No build settings need changing — `npm install` runs `prisma generate` automatically.
3. Add environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | your Neon connection string |
| `SESSION_SECRET` | a long random string (e.g. output of `openssl rand -hex 32`) |
| `DEMO_MODE` | `true` for evaluation (one-click demo logins on the sign-in page); **set to `false` before inviting real users** |

4. Click **Deploy**.

## 3. Create the schema and seed demo data (run once, from your machine)

Point the Prisma CLI at the hosted database and push + seed:

```bash
# PowerShell
$env:DATABASE_URL="<neon connection string>"
npm run db:push
npm run db:seed

# macOS / Linux
DATABASE_URL="<neon connection string>" npm run db:push
DATABASE_URL="<neon connection string>" npm run db:seed
```

The seed prints the six demo accounts when it finishes (password `academy123`).

## 4. Open the app

Visit your `https://<project>.vercel.app` URL and use the demo buttons on the sign-in page.

## Optional integrations

Everything below is off by default and degrades honestly (clear in-app notices, no fake behavior):

| Feature | Env vars | Where to get them |
| --- | --- | --- |
| Embedded live call rooms | `DAILY_API_KEY`, `DAILY_DOMAIN` | [daily.co](https://www.daily.co) dashboard |
| Password-reset & notification email | `RESEND_API_KEY`, `EMAIL_FROM` | [resend.com](https://resend.com) (verify a sender domain) |
| File uploads (resumes, attachments) | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | any S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2) |

## Production notes

- **Serverless filesystem**: the local-disk storage fallback does not persist on Vercel. Nothing in the seeded demo depends on it, but configure S3-compatible storage before enabling user uploads.
- **DEMO_MODE**: with it set to `false`, the demo endpoint returns 404 and the one-click buttons disappear — the demo accounts themselves remain and can still sign in with their password, so also change or remove them (Admin → Learners) for a real launch.
- **Realtime**: chat/notifications use light polling and work on serverless out of the box. For multi-region scale, swap the polling transport for SSE/WebSockets behind the same client hooks.
