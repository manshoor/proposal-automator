# Upwork Proposal Automator

Chrome extension + Express.js backend + Next.js dashboard that generates personalized, AI-powered Upwork proposals. Includes client vetting, job analysis, portfolio matching, proposal analytics, and job notifications.

## Architecture

```
Chrome Extension (MV3)          Dashboard (Next.js)           Backend (Express.js)
  - Job page scraping       -->   - Profile management     -->   - LLM integration (Claude/GPT-4o)
  - Client vetting          -->   - Proposal history       -->   - PostgreSQL database
  - Proposal auto-fill      -->   - Templates & prompts    -->   - Redis caching
  - Job notifications       -->   - Analytics & ROI        -->   - BullMQ job queues
                                  - Admin panel            -->   - JWT authentication
```

**Ports (development):**

| Service     | URL                        | Purpose                    |
|-------------|----------------------------|----------------------------|
| Backend     | `http://localhost:3002`     | Express API server         |
| Dashboard   | `http://localhost:3003`     | Next.js admin dashboard    |
| PostgreSQL  | `localhost:5433`           | Database                   |
| Redis       | `localhost:6379`           | Caching & job queues       |
| Prometheus  | `http://localhost:9090`     | Metrics collection         |
| Grafana     | `http://localhost:3004`     | Monitoring dashboards      |

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Google Chrome

### 1. Environment Setup

```bash
cp .env.example .env
```

Edit `.env` and set:
- `ENCRYPTION_KEY` — generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `JWT_SECRET` — change from default for production

### 2. Start All Services

```bash
# Build and start in background
make up-d-build

# Or with docker compose directly
docker compose up --build -d
```

Wait for all containers to be healthy:
```bash
make health
# or
docker ps
```

### 3. Install the Chrome Extension

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo

### 4. Create an Account

1. Go to `http://localhost:3003/register`
2. Create your account
3. Fill out your profile at `http://localhost:3003/profile` (title, summary, skills, experience)
4. Add your LLM API key at `http://localhost:3003/settings`

### 5. Configure the Extension

1. Click the extension icon in Chrome toolbar
2. Click the gear icon to open settings
3. Set Backend URL to `http://localhost:3002`
4. Log in with your account credentials

### 6. Generate Your First Proposal

1. Navigate to any Upwork job page
2. Click the extension icon
3. Review the client vetting results (green/yellow/red indicators)
4. Click **Generate Proposal**
5. Review the AI-generated proposal
6. Click **Auto-fill** to populate Upwork's proposal form
7. Review and submit manually on Upwork

## Features

### Chrome Extension
- **Job page scraping** — extracts title, description, budget, skills, client info, preferred qualifications
- **Client vetting** — 7-point check (location, spending, hire rate, reviews, rating, competition, activity)
- **Red flag detection** — 11 flags (unverified payment, new account, low hire rate, vague description, etc.)
- **Job fit scoring** — matches job skills to your profile skills
- **Hidden instruction detection** — finds instructions hidden in job descriptions via CSS or comments
- **Proposal generation** — one-click AI proposal with pre-generation job analysis
- **Auto-fill** — fills Upwork's proposal form (cover letter, rate, milestones)
- **Quick-edit buttons** — "Shorter", "Technical", "Casual", "Urgent" regeneration
- **A/B testing** — generate two proposal variants with different styles
- **Proposal analysis** — AI feedback on your proposal quality (first 230 chars focus)
- **Message copilot** — AI-assisted replies in Upwork messaging
- **Job feed filtering** — filter/highlight jobs on the feed page by skills, budget, keywords
- **Job notifications** — background monitoring with badge + sound alerts for matching jobs

### Dashboard (`http://localhost:3003`)
- **Profile** — manage your freelancer profile, resume import (PDF/DOCX), profile analysis
- **Projects** — portfolio management with AI-powered outcome enhancement
- **Proposals** — full proposal history with status tracking (sent/hired/rejected)
- **Templates** — 20+ pre-built templates by job type, approach style, and budget tier
- **Prompts** — custom prompt management (system prompt overrides + custom instructions)
- **Analytics** — win rate, weekly trends, top skills, connect ROI tracking
- **Settings** — vetting thresholds, job filters, notification interval, LLM provider config

### Admin Panel (admin users only)
- **Master Prompts** — edit the global system prompt that controls all proposal generation
- **User Management** — view all users, change roles (user/admin)

## How Proposal Generation Works

When you click "Generate Proposal", the system runs a multi-step pipeline:

```
1. PROFILE VALIDATION
   └── Checks that title, summary, and skills are filled out

2. JOB ANALYSIS (silent, first LLM call)
   └── Analyzes the job: pain points, urgency, requirements, approach angle
   └── Output feeds into step 4

3. PROMPT RESOLUTION (3-tier)
   ├── Your system prompt override (if you set one)
   ├── Admin's master prompt (global default)
   └── Hardcoded fallback

4. PORTFOLIO AUTO-MATCHING
   └── Scores your projects by skill overlap with the job
   └── Top 2-3 matching projects injected into prompt

5. PROPOSAL GENERATION (second LLM call)
   └── Uses: resolved prompt + job analysis + client context + portfolio + qualifications

6. SAVE TO DATABASE
   └── Proposal stored with job/client metadata for analytics
```

## Makefile Commands

### Docker Lifecycle

```bash
make up                    # Start all services (foreground)
make up-d                  # Start all services (background)
make up-d-build            # Build and start (background)
make down                  # Stop all services
make down-v                # Stop and remove volumes
make restart               # Restart all services
make restart-backend       # Restart backend only
make restart-dashboard     # Restart dashboard only
```

### Logs & Monitoring

```bash
make logs-backend          # Tail backend logs
make logs-dashboard        # Tail dashboard logs
make logs-db               # Tail database logs
make monitor-all           # Follow all container logs
make health                # Check service health
make dps                   # Docker ps (container status)
```

### Database

```bash
make db-shell              # Open psql shell
make db-dump               # Dump database to file
make db-restore            # Restore from dump
make db-reset              # Drop and recreate database
```

### Dependencies

```bash
make install-backend       # npm install in backend container
make install-dashboard     # npm install in dashboard container
make install-all           # Install both
make add-backend-dep PKG=axios    # Add a backend dependency
make add-dashboard-dep PKG=lodash # Add a dashboard dependency
```

### Shell Access

```bash
make shell-backend         # Shell into backend container
make shell-dashboard       # Shell into dashboard container
make shell-db              # Shell into database container
```

### Git Flow

```bash
make feature BRANCH=my-feature    # Create feature branch
make feature-done BRANCH=my-feature  # Finish feature (merge to develop)
make release VERSION=1.0.0        # Create release branch
make release-done VERSION=1.0.0   # Finish release (merge to main + develop)
make hotfix VERSION=1.0.1         # Create hotfix branch
make hotfix-done VERSION=1.0.1    # Finish hotfix
```

### Production

```bash
make build-prod            # Build production images
make up-d-prod             # Start production stack
make up-d-prod-build       # Build and start production
make down-prod             # Stop production stack
```

## API Endpoints

All endpoints require JWT authentication (except `/auth/*`).

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Login, returns JWT tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Invalidate refresh token |

### Proposal Generation
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/generate-proposal` | Generate AI proposal (with job analysis) |
| POST | `/api/v1/generate-proposal/ab` | Generate A/B variant proposals |
| POST | `/api/v1/generate-message` | Generate message reply |
| POST | `/api/v1/analyze-proposal` | Analyze proposal quality |

### Data Management
| Method | Path | Description |
|--------|------|-------------|
| GET/PUT | `/api/v1/profile` | Freelancer profile |
| GET/POST/PUT/DELETE | `/api/v1/projects` | Portfolio projects |
| POST | `/api/v1/projects/:id/enhance` | AI-enhance project outcome |
| POST | `/api/v1/projects/enhance-all` | Bulk enhance all weak outcomes |
| GET/POST/PUT/DELETE | `/api/v1/proposals` | Proposal history |
| GET/POST/PUT/DELETE | `/api/v1/templates` | Proposal templates |
| GET/POST/PUT/DELETE | `/api/v1/prompts` | Custom prompts |
| GET/PUT | `/api/v1/settings` | User settings |
| GET | `/api/v1/analytics` | Win rate, trends, ROI |

### File Processing
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/parse-resume` | Parse resume PDF/DOCX to profile |
| POST | `/api/v1/parse-projects` | Bulk import projects from file |
| POST | `/api/v1/upload/screenshot` | Upload project screenshots |

### Profile Tools
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/analyze-profile` | AI profile analysis + score |
| POST | `/api/v1/generate-hooks` | Generate profile opening lines |

### Admin (requires admin role)
| Method | Path | Description |
|--------|------|-------------|
| GET/POST/PUT/DELETE | `/api/v1/admin/prompts` | Global master prompts |
| GET | `/api/v1/admin/users` | List all users |
| PUT | `/api/v1/admin/users/:id/role` | Change user role |

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Accounts with email, password hash, role (user/admin) |
| `profiles` | Freelancer profile (one per user) |
| `proposals` | Generated proposals with job/client metadata |
| `projects` | Portfolio projects with technologies, outcomes |
| `templates` | Proposal templates (20+ pre-seeded) |
| `prompts` | Custom/system prompts (type: system/custom, global flag) |
| `settings` | Vetting thresholds, filters, LLM config, notification settings |
| `refresh_tokens` | JWT refresh token management |

## Monitoring

### Logs

```bash
# Backend structured logs (pino JSON)
make logs-backend

# Filter for errors only
docker logs chromeplugin-backend-1 2>&1 | grep '"level":50'

# Filter for warnings
docker logs chromeplugin-backend-1 2>&1 | grep '"level":40'
```

### Grafana Dashboards

Access Grafana at `http://localhost:3004` (default login: `admin` / `admin`).

Pre-configured dashboards for:
- HTTP request rates and latencies
- Error rates by endpoint
- Database connection pool stats
- Redis cache hit/miss ratios

### Prometheus Metrics

Raw metrics at `http://localhost:3002/metrics` and Prometheus UI at `http://localhost:9090`.

### Health Check

```bash
# Quick health check
curl http://localhost:3002/health

# Full status
make health
```

## Troubleshooting

### Backend container is unhealthy / crashing

```bash
# Check logs for the error
make logs-backend

# Common fix: reinstall dependencies
make install-backend

# Then restart
make restart-backend
```

### "Cannot find package X" errors

Dependencies inside the Docker container are out of sync:
```bash
make install-backend
# or
make install-dashboard
```

### 401 "Access token expired"

JWT tokens expire after 15 minutes. The dashboard auto-refreshes tokens. If you're using curl, get a fresh token:
```bash
curl -X POST http://localhost:3002/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"your@email.com","password":"yourpass"}'
```

### Database migration issues

Migrations run automatically on backend startup. To run manually:
```bash
make db-shell
# Then run SQL files from backend/db/migrations/
```

### Extension not loading on Upwork

1. Make sure the backend is running (`make health`)
2. Reload the Upwork page (content scripts need a fresh page load)
3. Check the extension popup for error messages
4. Check Chrome DevTools console on the Upwork page for errors

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Extension | Chrome MV3, vanilla JS |
| Backend | Express.js (ES modules), Node 20 |
| Dashboard | Next.js 14 (App Router), Tailwind CSS |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Job Queue | BullMQ |
| LLM | Anthropic Claude Sonnet 4 / OpenAI GPT-4o |
| Auth | JWT (access + refresh tokens), bcrypt |
| Logging | Pino (structured JSON) |
| Metrics | Prometheus + Grafana |
| File Parsing | pdf-parse, mammoth (DOCX) |
| Containerization | Docker Compose (multi-stage builds) |
