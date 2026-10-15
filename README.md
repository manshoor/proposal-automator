# Upwork Proposal Automator

A Chrome extension, Express backend, and Next.js dashboard that write personalized, AI-generated Upwork proposals. It also vets clients, analyzes jobs, matches your portfolio, tracks outcomes, drafts follow-ups, and alerts you to new matching jobs.

## Architecture

```
Chrome Extension (MV3, JS)      Dashboard (Next.js, TS)        Backend (Express, TS)
  - Job page scraping       -->   - Profile & Profile Coach  -->   - LLM calls (Claude / GPT-4o)
  - Client vetting          -->   - Proposals & follow-ups   -->   - PostgreSQL 16
  - Proposal auto-fill      -->   - Templates & prompts      -->   - Redis 7 cache
  - Message copilot         -->   - Analytics & insights     -->   - BullMQ job queues
  - Job notifications       -->   - Admin panel              -->   - JWT auth
```

| Path         | Contents                                                  |
|--------------|-----------------------------------------------------------|
| `backend/`   | Express API in TypeScript, run by `tsx` (no build step)   |
| `dashboard/` | Next.js 14 App Router dashboard in TypeScript             |
| `extension/` | Chrome MV3 extension, plain JavaScript (no build step)    |
| `infra/`     | Prometheus and Grafana config                             |
| `docs/`      | Project documentation                                     |

**Ports (defaults, set in `.env`):**

| Service    | URL                     | Env var           |
|------------|-------------------------|-------------------|
| Backend    | `http://localhost:3002` | `BACKEND_PORT`    |
| Dashboard  | `http://localhost:3003` | `DASHBOARD_PORT`  |
| PostgreSQL | `localhost:5433`        | `DB_PORT`         |
| Redis      | `localhost:6379`        | `REDIS_PORT`      |
| Prometheus | `http://localhost:9090` | `PROMETHEUS_PORT` |
| Grafana    | `http://localhost:3004` | `GRAFANA_PORT`    |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Google Chrome

All `npm` commands run inside the containers. You do not need Node installed on the host.

### 1. Configure the environment

```bash
cp .env.example .env
```

Set at least:

- `ENCRYPTION_KEY` — encrypts stored LLM API keys. Generate one:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `JWT_SECRET` — signs login tokens. Change it from the default.
- `GRAFANA_ADMIN_PASSWORD` — Grafana login.

### 2. Start the services

```bash
make up-d-build
```

Check that the containers are healthy:

```bash
make health
```

### 3. Load the Chrome extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.

### 4. Create an account

1. Register at `http://localhost:3003/register`.
2. Fill in your profile at `http://localhost:3003/profile` (title, summary, skills, experience).
3. Add your Anthropic or OpenAI API key at `http://localhost:3003/settings`.

### 5. Connect the extension

1. Click the extension icon, then the gear icon.
2. Set Backend URL to `http://localhost:3002`.
3. Log in with your account.

### 6. Generate a proposal

1. Open an Upwork job page and click the extension icon.
2. Review the client vetting results (green, yellow, red).
3. Click **Generate Proposal** and review the result.
4. Click **Auto-fill** to fill Upwork's form.
5. Review and submit on Upwork yourself.

## Features

### Chrome extension

- **Job scraping** — title, description, budget, skills, client info, preferred qualifications.
- **Client vetting** — 7 checks: location, spend, hire rate, reviews, rating, competition, activity.
- **Red flags** — 11 flags, such as unverified payment, new account, low hire rate, vague description.
- **Job fit score** — overlap between job skills and your skills.
- **Hidden instruction detection** — finds instructions hidden in job text via CSS or comments.
- **Proposal generation** — one click, with a job analysis step first.
- **Auto-fill** — cover letter, rate, milestones.
- **Quick edits** — regenerate as Shorter, Technical, Casual, or Urgent.
- **A/B variants** — two proposals in different styles.
- **Proposal analysis** — feedback on proposal quality, focused on the first 230 characters.
- **Message copilot** — drafts replies in Upwork messages.
- **Job feed filtering** — filter and highlight feed jobs by skills, budget, keywords.
- **Job notifications** — background checks with badge and sound alerts.
- **Loom recording** — record and upload a video for a proposal.

### Dashboard (`http://localhost:3003`)

| Page             | Purpose                                                        |
|------------------|----------------------------------------------------------------|
| `/profile`       | Freelancer profile, resume import (PDF/DOCX), profile analysis |
| `/profile-coach` | AI review of your Upwork profile, with history                 |
| `/projects`      | Portfolio, with AI rewrite of weak outcomes                    |
| `/proposals`     | Proposal history and status (sent, hired, rejected)            |
| `/follow-ups`    | Generate and edit follow-up messages and sequences             |
| `/templates`     | 20+ templates by job type, style, and budget tier              |
| `/prompts`       | Custom prompts and system prompt overrides per platform        |
| `/analytics`     | Win rate, weekly trends, top skills, Connects ROI              |
| `/insights`      | Conversion funnel and learned patterns                         |
| `/settings`      | Vetting thresholds, job filters, notifications, LLM provider   |

### Admin (admin role only)

- `/admin/prompts` — edit the global master prompt used by all generation.
- `/admin/users` — list users and change roles.

## How Proposal Generation Works

```
1. PROFILE CHECK       title, summary, and skills must be set
2. JOB ANALYSIS        first LLM call: pain points, urgency, requirements, angle
3. PROMPT RESOLUTION   your override  ->  admin master prompt  ->  built-in fallback
4. PORTFOLIO MATCH     scores projects by skill overlap; injects the top 2-3
5. GENERATION          second LLM call with prompt + analysis + client + portfolio
6. SAVE                stores the proposal with job and client data for analytics
```

LLM models: Anthropic `claude-sonnet-4-20250514` or OpenAI `gpt-4o` (`backend/lib/llm.ts`). Each user picks a provider and stores their own API key, encrypted, in settings.

## Development

```bash
make help                  # List all targets
make shell-backend         # Shell into the backend container
make shell-dashboard       # Shell into the dashboard container
```

Inside the containers:

| Where     | Command              | Does                       |
|-----------|----------------------|----------------------------|
| backend   | `npm run dev`        | Start with file watching   |
| backend   | `npm test`           | Run Vitest tests           |
| backend   | `npm run typecheck`  | Type-check with `tsc`      |
| dashboard | `npm run dev`        | Start Next.js dev server   |
| dashboard | `npm run build`      | Production build           |
| dashboard | `npm run typecheck`  | Type-check with `tsc`      |
| dashboard | `npm run test:e2e`   | Run Playwright tests       |

Database migrations live in `backend/db/migrations/` and run on backend startup.

## Makefile Commands

Run `make help` for the full list.

### Docker

```bash
make up-d-build            # Build and start in the background
make up-d                  # Start in the background
make down                  # Stop
make down-v                # Stop and delete volumes
make restart               # Restart all
make restart-backend       # Restart backend only
make restart-dashboard     # Restart dashboard only
make dps                   # Container status
make health                # Health check
make status                # Service status
```

### Logs and monitoring

```bash
make logs-backend          # Tail backend logs
make logs-dashboard        # Tail dashboard logs
make logs-db               # Tail database logs
make monitor-all           # Follow all logs
make metrics               # Show backend metrics
make grafana               # Open Grafana
make prometheus            # Open Prometheus
```

### Database

```bash
make db-shell              # psql shell
make db-dump               # Dump to file
make db-restore            # Restore from dump
make db-reset              # Drop and recreate
```

### Dependencies

```bash
make install-backend               # npm install in backend container
make install-dashboard             # npm install in dashboard container
make install-all                   # Both
make add-backend-dep PKG=axios     # Add a backend dependency
make add-dashboard-dep PKG=lodash  # Add a dashboard dependency
```

### Git flow

Branches: `main` (releases), `develop` (integration), `feature/*`, `bugfix/*`, `release/*`, `hotfix/*`.

```bash
make feature BRANCH=name           # Start a feature
make feature-done BRANCH=name      # Merge into develop
make bugfix BRANCH=name            # Start a bugfix
make bugfix-done BRANCH=name       # Merge into develop
make release VERSION=1.0.0         # Start a release
make release-done VERSION=1.0.0    # Merge into main and develop
make hotfix VERSION=1.0.1          # Start a hotfix
make hotfix-done VERSION=1.0.1     # Merge into main and develop
```

### Production

```bash
make setup-prod            # First-time production setup
make build-prod            # Build production images
make up-d-prod-build       # Build and start
make down-prod             # Stop
```

Production uses `docker-compose.prod.yml` and `.env.prod.example`.

## API

Base path: `/api/v1` (legacy `/api` also works). All routes need a JWT access token except `/auth/*` and the server routes.

### Server

| Method | Path            | Description                          |
|--------|-----------------|--------------------------------------|
| GET    | `/health`       | Liveness summary                     |
| GET    | `/health/live`  | Liveness probe                       |
| GET    | `/health/ready` | Readiness probe (checks DB; 503 if down) |
| GET    | `/version`      | Build version                        |
| GET    | `/metrics`      | Prometheus metrics                   |

### Auth

| Method | Path             | Description              |
|--------|------------------|--------------------------|
| POST   | `/auth/register` | Create account           |
| POST   | `/auth/login`    | Log in; returns tokens   |
| POST   | `/auth/refresh`  | Refresh access token     |
| POST   | `/auth/logout`   | Revoke refresh token     |
| GET    | `/auth/me`       | Current user             |

### Generation and analysis

| Method | Path                    | Description                       |
|--------|-------------------------|-----------------------------------|
| POST   | `/generate-proposal`    | Generate a proposal               |
| POST   | `/generate-proposal/ab` | Generate A/B variants             |
| POST   | `/generate-message`     | Draft a message reply             |
| POST   | `/analyze-proposal`     | Score proposal quality            |
| POST   | `/analyze-profile`      | Score a profile                   |
| POST   | `/generate-hooks`       | Generate profile opening lines    |
| POST   | `/profile-coach/analyze`| Profile Coach review              |
| GET    | `/profile-coach/history`| Past Profile Coach reviews        |

### Data

| Method              | Path                       | Description                      |
|---------------------|----------------------------|----------------------------------|
| GET, PUT            | `/profile`                 | Freelancer profile               |
| GET, POST, PUT, DELETE | `/projects[/:id]`       | Portfolio projects               |
| POST                | `/projects/:id/enhance`    | Rewrite one project outcome      |
| POST                | `/projects/enhance-all`    | Rewrite all weak outcomes        |
| GET, POST, PUT, DELETE | `/proposals[/:id]`      | Proposal history                 |
| GET, POST, PUT, DELETE | `/templates[/:id]`      | Templates                        |
| GET, POST, PUT, DELETE | `/prompts[/:id]`        | Custom prompts                   |
| GET                 | `/prompts/active/:platform`| Active prompt for a platform     |
| GET, PUT            | `/settings`                | User settings                    |
| GET, POST, DELETE   | `/banned-phrases[/:id]`    | Phrases to keep out of proposals |
| GET                 | `/jobs/:id`                | Stored job                       |

### Follow-ups and outcomes

| Method                 | Path                        | Description                   |
|------------------------|-----------------------------|-------------------------------|
| GET, POST              | `/follow-ups`               | List or create follow-ups     |
| POST                   | `/follow-ups/sequence`      | Create a follow-up sequence   |
| GET, PATCH, DELETE     | `/follow-ups/:id`           | One follow-up                 |
| POST                   | `/follow-ups/:id/regenerate`| Regenerate a follow-up        |
| GET, PUT               | `/outcomes/tracking`        | Outcome tracking settings     |
| GET, POST              | `/outcomes/event`           | Outcome events                |
| POST                   | `/outcomes/manual`          | Record an outcome by hand     |
| GET, PUT               | `/connects`, `/connects/balance` | Connects balance         |

### Analytics and insights

| Method | Path                      | Description                  |
|--------|---------------------------|------------------------------|
| GET    | `/analytics`              | Win rate, trends, ROI        |
| POST   | `/analytics/learn`        | Learn from outcomes          |
| GET    | `/analytics/insights`     | Learned insights             |
| PUT    | `/analytics/insights/:id` | Update an insight            |
| GET    | `/insights`               | Conversion funnel            |
| POST   | `/insights/recompute`     | Recompute insights           |

### Files

| Method | Path                  | Description                    |
|--------|-----------------------|--------------------------------|
| POST   | `/parse-resume`       | Resume (PDF/DOCX) to profile   |
| POST   | `/parse-projects`     | Bulk import projects from file |
| POST   | `/upload/screenshot`  | Upload a project screenshot    |
| POST   | `/uploads/loom`       | Upload a Loom recording        |

### Extension support

| Method | Path          | Description                          |
|--------|---------------|--------------------------------------|
| GET    | `/bootstrap`  | Initial data for the extension       |
| GET    | `/popup-init` | Data for the popup                   |
| POST   | `/errors`     | Report a client-side error           |

### Admin (admin role)

| Method                 | Path                    | Description         |
|------------------------|-------------------------|---------------------|
| GET, POST, PUT, DELETE | `/admin/prompts[/:id]`  | Master prompts      |
| GET                    | `/admin/users`          | List users          |
| PUT                    | `/admin/users/:id/role` | Change a user's role|

## Database

| Table               | Purpose                                              |
|---------------------|------------------------------------------------------|
| `users`             | Accounts: email, password hash, role                 |
| `refresh_tokens`    | JWT refresh tokens                                   |
| `profiles`          | Freelancer profile, one per user                     |
| `profile_analyses`  | Profile Coach results                                |
| `projects`          | Portfolio projects                                   |
| `proposals`         | Generated proposals with job and client data         |
| `proposal_outcomes` | Outcome events per proposal                          |
| `proposal_followups`| Follow-up messages                                   |
| `proposal_insights` | Learned insights from outcomes                       |
| `user_patterns`     | Patterns learned per user                            |
| `client_personas`   | Client profiles built from job data                  |
| `templates`         | Proposal templates (20+ seeded)                      |
| `prompts`           | Custom and system prompts                            |
| `banned_phrases`    | Phrases to avoid in generated text                   |
| `settings`          | Thresholds, filters, LLM config, notifications       |
| `_migrations`       | Applied migration tracker                            |

## Monitoring

- **Logs** — Pino JSON. `make logs-backend`. Errors only: `docker logs chromeplugin-backend-1 2>&1 | grep '"level":50'`.
- **Grafana** — `http://localhost:3004`, user `admin`, password from `GRAFANA_ADMIN_PASSWORD`. Dashboards for request rate and latency, errors by endpoint, DB pool, and Redis hit ratio.
- **Prometheus** — UI at `http://localhost:9090`; raw metrics at `http://localhost:3002/metrics`.
- **Health** — `curl http://localhost:3002/health/ready` or `make health`.

## Troubleshooting

**Backend unhealthy or crashing**

```bash
make logs-backend
make install-backend
make restart-backend
```

**"Cannot find package X"** — container dependencies are out of sync. Run `make install-backend` or `make install-dashboard`.

**401 "Access token expired"** — access tokens last 15 minutes by default (`JWT_ACCESS_EXPIRY`). The dashboard and extension refresh them. With curl, log in again:

```bash
curl -X POST http://localhost:3002/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"you@example.com","password":"yourpass"}'
```

**Migration problems** — migrations run on backend startup. To inspect, run `make db-shell` and check `_migrations` against `backend/db/migrations/`.

**Extension does nothing on Upwork**

1. Check the backend is up: `make health`.
2. Reload the Upwork page; content scripts load on page load.
3. Check the popup for errors.
4. Check the DevTools console on the Upwork page.

## Tech Stack

| Component  | Technology                                        |
|------------|---------------------------------------------------|
| Extension  | Chrome MV3, plain JavaScript                      |
| Backend    | Node 20, Express 4, TypeScript (run by `tsx`)     |
| Dashboard  | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS 3 |
| Database   | PostgreSQL 16                                     |
| Cache      | Redis 7                                           |
| Queue      | BullMQ                                            |
| LLM        | Anthropic Claude Sonnet 4, OpenAI GPT-4o          |
| Auth       | JWT (access + refresh), bcrypt                    |
| Logging    | Pino                                              |
| Metrics    | Prometheus, Grafana                               |
| Files      | pdf-parse, mammoth (DOCX)                         |
| Tests      | Vitest (backend), Playwright (dashboard)          |
| Containers | Docker Compose, multi-stage builds                |

## License

[MIT](LICENSE)
