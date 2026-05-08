# Architecture

A high-level map of the system. For deep performance findings see [`PERFORMANCE_AUDIT.md`](./PERFORMANCE_AUDIT.md).

## Three surfaces

```
┌─────────────────────────────┐    ┌─────────────────────────────┐    ┌─────────────────────────────┐
│ Chrome MV3 Extension        │    │ Express Backend (Node 20)   │    │ Next.js 14 Dashboard        │
│ (popup + content + worker)  │◄──►│ + Postgres + Redis + BullMQ │◄──►│ (App Router with RSC)       │
└─────────────────────────────┘    └─────────────────────────────┘    └─────────────────────────────┘
        on Upwork pages                  Docker compose                    Docker compose
```

All three live in this monorepo:

| Path | Surface | Build target |
|---|---|---|
| `extension/` | Chrome MV3 extension | `dist/extension.zip` (manual `zip`) |
| `backend/` | Node 20 Express API | `chromeplugin-backend-1` container |
| `dashboard/` | Next.js 14 (App Router) | `chromeplugin-dashboard-1` container |
| `docs/` | This doc + audit + future ADRs | — |

## Data flow

### Generating a proposal (the hot path)

```
User on Upwork job page
        │
        ▼
1. extension/content/scraper.js scrapes job DOM
        │
        ▼
2. popup.js: user clicks "Generate"
        │
        ▼
3. POST /api/v1/generate-proposal  (backend)
        │
        ├─► proposal.service.generateProposal
        │     ├─► Promise.all:
        │     │      profile.service.getProfileOrDefault       (Redis + module cache)
        │     │      analyzer.extractJobAnalysisOrThrow        (LLM #1, ~5s)
        │     ├─► alignment.service.analyze
        │     ├─► boost-roi.service.evaluate
        │     ├─► hook-validator.service.validateHook
        │     ├─► bid-recommend.service.recommend              (deterministic, no LLM)
        │     ├─► client-history.service.lookupHistory         (DB by hash)
        │     └─► callLLM (Anthropic / OpenAI)                 (LLM #2, ~15-20s)
        │
        ▼
4. proposalRepo.create + proposal_outcomes setup
        │
        ▼
5. Response → popup renders preview
```

### Outcome tracking + learning loop

```
extension/content/outcome-detector.js (on Upwork proposals listing)
        │
        │  every 1.5s debounced via MutationObserver
        ▼
POST /api/v1/outcomes/events  (batch)
        │
        ▼
proposal_outcomes table  →  insightRepo.getOutcomeBuckets
        │
        ▼
analytics.service.learnFromOutcomes  (on user click "Analyze patterns")
        │
        ▼
LLM extracts win/loss patterns → proposal_insights table
        │
        ▼
Dashboard /analytics + /insights show the patterns
```

### Background work

Two in-process workers (setInterval-based) plus one BullMQ queue:

| Worker / Queue | Cadence | Job |
|---|---|---|
| `workers/followup-expiry.worker.js` | 30 min | Mark scheduled follow-ups as expired after 7 days |
| `workers/loom-cleanup.worker.js` | 24 h | Garbage-collect orphaned Loom URLs |
| `queues/llm.queue.js` | On-demand | Long-running LLM jobs (currently used for batch enhance-all) |

Service worker in the extension fires a single 30-min alarm that does feed-polling + due-follow-up checks (consolidated from two separate alarms — see `service-worker.js`).

## Key services (backend)

```
api/                  ←  Express routers; thin handlers, validate via Zod
  ├─ generate-proposal/
  ├─ analytics/
  ├─ insights/
  ├─ connects/        (Phase 6 — Connect economics)
  ├─ profile-coach/   (Phase 6 — profile analysis history)
  ├─ popup-init/      (perf carryover — batched popup endpoint)
  └─ ...

services/             ←  Business logic; no req/res; injectable LLM config
  ├─ proposal.service.js          (generateProposal — orchestrates everything)
  ├─ profile.service.js           (Redis + module-local cache)
  ├─ alignment.service.js         (rate-fit classification)
  ├─ bid-recommend.service.js     (deterministic rate suggestions)
  ├─ client-history.service.js    (SHA256 client identity hash)
  ├─ analytics.service.js         (learning loop + funnel)
  ├─ learning.service.js          (multi-dim cascading patterns)
  ├─ profile-coach.service.js     (LLM-based profile review + history)
  ├─ outcome.service.js           (outcome tracking flag)
  ├─ connects.service.js          (Connect balance + weekly spend + runway)
  ├─ bootstrap.service.js         (popup data composition; Redis-cached)
  ├─ persona.service.js           (rule-based client classifier)
  ├─ hook-validator.service.js    (deterministic 230-char hook check)
  ├─ banned-phrases.service.js    (admin-curated + per-user blocklist)
  └─ llm.service.js               (Anthropic + OpenAI provider abstraction)

repositories/         ←  Raw SQL; parameterized queries; no business logic
db/migrations/        ←  Numbered SQL files (001 → 021); idempotent
```

## Database schema (high level)

Migration files in `backend/db/migrations/` are the source of truth. Notable tables:

- **`users`** — auth + Connect balance + tracking flags.
- **`proposals`** — every proposal generated. Has `client_identity_hash` (Phase 6) so repeat clients are matchable across rows.
- **`proposal_outcomes`** — sparse event log: viewed / message_thread_opened / replied / interview / hired.
- **`proposal_followups`** — scheduled / sent / cancelled / expired follow-ups.
- **`proposal_insights`** — LLM-generated learned patterns (dim, value, win_rate, sample_size).
- **`templates`**, **`projects`**, **`prompts`** — user-curated content.
- **`profile_analyses`** (Phase 6) — longitudinal scores from the profile coach.
- **`banned_phrases`** — admin- and user-scoped phrase blocklists.

Indexes added in migration 021 (`idx_proposals_loom_url`, `idx_followups_status_scheduled`, `idx_banned_phrases_active_scope`) target the highest-frequency filter columns identified in the perf audit.

## Auth model

The extension and dashboard authenticate the same way:

- `POST /api/v1/auth/login` issues an HttpOnly cookie + a separate Bearer token.
- The dashboard uses **cookie-based** auth (HttpOnly, SameSite=Lax) — `serverFetch` reads the cookie from the incoming request and forwards it.
- The extension uses **Bearer** auth — `apiFetch` reads the token from `chrome.storage.local` and adds the `Authorization: Bearer …` header.
- Backend `middleware/authenticate.js` accepts either; routes downstream see `req.user.id`.

## Caching layers

```
┌──── Browser ──────────────────────────────────────────────────────────┐
│ Next.js RSC HTML (revalidate: 60 for read-only routes)                │
│ Dashboard SWR-style refetch (recompute, mutations, etc.)              │
└───────────────────────────────────────────────────────────────────────┘
                          │
┌──── Backend ─────────────────────────────────────────────────────────┐
│ Cache-Control: private, max-age=300 on /templates and /settings      │
│ Module-local Map (5min) — profile.service                            │
│ Redis (5–10 min) — profile, bootstrap, analytics summaries           │
│ pg connection pool (max 50, idle 10s)                                │
└───────────────────────────────────────────────────────────────────────┘
```

## Operational endpoints

- `GET /health` — legacy 200/ok.
- `GET /health/live` — liveness probe (process up).
- `GET /health/ready` — readiness probe (DB reachable; Redis is best-effort).
- `GET /version` — `{ commit, builtAt, startedAt, node }`.
- `GET /metrics` — Prometheus exposition (per-route timing, counts, BullMQ stats).

Grafana dashboards run alongside in compose; alerts are not yet wired.

## What's where for common tasks

| Task | Touch this |
|---|---|
| Add a new API route | `backend/api/<name>.js` + mount in `routes/v1/index.js` |
| Add a new dashboard page | `dashboard/app/<name>/page.js` (server) + `<name>-client.js` (client island) |
| Add a content-script feature on Upwork | `extension/content/<feature>.js` + register in `manifest.json` |
| Add a Zod schema | `backend/schemas/<name>.schema.js` (also generates the OpenAPI bits when that lands) |
| Add a DB migration | New file `backend/db/migrations/0NN_<purpose>.sql` (idempotent IF NOT EXISTS) |
| Add a test | `backend/tests/<name>.test.js` (Vitest, ESM imports) |

## See also

- [`PERFORMANCE_AUDIT.md`](./PERFORMANCE_AUDIT.md) — 45 perf findings + top-15 fixes status.
- `backend/tests/README.md` — how to run + write backend tests.
