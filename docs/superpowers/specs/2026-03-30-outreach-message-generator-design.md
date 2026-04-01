# Upwork Proposal Automator — System Design Spec

## Overview

Chrome extension (Manifest V3) + Express.js backend + Next.js dashboard that automates Upwork proposal generation using AI. The extension reads job details directly from Upwork pages, vets clients, generates personalized proposals with milestones, and auto-fills the proposal form.

## Architecture

```
Chrome Extension (Manifest V3)
  ├── Content Scripts → Scrape Upwork DOM (job detail + proposal pages)
  ├── Popup UI → Client vetting, proposal preview, auto-fill controls
  ├── Service Worker → API communication
  └── Options Page → API key, provider, backend URL

Express.js Backend (Docker, port 3002)
  ├── POST /api/generate-proposal → LLM proposal generation
  ├── GET/PUT /api/profile → Freelancer CV/skills
  ├── GET/POST/PUT /api/proposals → Proposal history
  ├── GET/POST/PUT/DELETE /api/templates → 20+ reusable templates
  └── GET /api/analytics → Stats and aggregations

Next.js Dashboard (Docker, port 3003)
  ├── /profile → Edit CV, skills, experience, portfolio
  ├── /proposals → History with status tracking
  ├── /templates → Create/edit/delete templates
  ├── /analytics → Charts: weekly proposals, win rate, top skills
  └── /settings → Target locations, vetting thresholds

PostgreSQL (Docker, port 5433)
  ├── profiles → Single-row freelancer profile
  ├── proposals → All generated proposals with job data
  └── templates → 20+ pre-seeded winning templates
```

## Key Features

### Client Vetting
- **Location check** — warns if client is outside target countries (UK, US, Canada, Singapore, Malaysia, UAE, Saudi, Qatar, Bahrain)
- **Spending check** — flags clients with <$100 total spend
- **Hire rate** — extracted from job posting stats
- **Review analysis** — count and sentiment of client reviews
- **Proposal competition** — how many proposals already submitted

### Job Fit Score
- Compares job required skills against your profile skills
- Shows percentage match (green 70%+, yellow 40-69%, red <40%)
- Combined with vetting into **Bid Decision Guidance**: "Strong Match — Bid Now" / "Worth Reviewing" / "Consider Skipping"

### Proposal Generation
- **Dual LLM support** — Anthropic Claude + OpenAI GPT-4o
- **User-provided API keys** — stored in Chrome extension, sent per-request
- **Profile-personalized** — uses your CV/skills/experience from the dashboard
- **Template-guided** — optional template selection from 20+ pre-built templates
- **Hidden instruction detection** — finds "start your proposal with..." patterns in job descriptions
- **Milestone auto-generation** — for fixed-price jobs, generates 2-4 milestones based on budget

### Auto-Fill
- Fills cover letter textarea (React-compatible via execCommand)
- Selects "By milestone" mode and fills milestone descriptions + amounts
- Does NOT auto-submit — user reviews before clicking Submit

### Quick-Edit Toolbar
- **Shorter** — makes proposal more concise
- **Technical** — adds specific technical details
- **Casual** — more conversational tone
- **Urgent** — emphasizes fast delivery
Each button regenerates using the existing proposal + instruction.

### 20+ Pre-Built Templates
Categorized by job type, approach style, and budget tier:
- Web Dev, WordPress, Mobile, UI/UX, API, E-commerce, Bug Fix, Automation
- Direct, Question-Led, Proof-First, Problem-Solution, Quick Turnaround, Budget-Conscious
- Micro (<$100), Mid ($100-$1000), Enterprise ($1000+)
- Fixed-Price with Milestones, Hourly Long-Term, Hidden Instruction

### Dashboard
- **Profile** — manage CV data that personalizes proposals
- **Proposals** — full history with status tracking (sent/hired/rejected)
- **Templates** — CRUD with variable placeholders
- **Analytics** — win rate, weekly trends, top skills, status breakdown
- **Settings** — target locations, vetting thresholds

## Competitor References

### BidPilotPro (https://www.bidpilotpro.com/)
- Job Fit Score — skill alignment scoring ✅ (implemented)
- Client Quality Signals — spending, ratings, red flags ✅ (implemented)
- Bid Decision Guidance — strategic recommendations ✅ (implemented)
- One-click proposal generation ✅ (implemented)
- Project Filters + Notifications — custom filters, browser alerts (roadmap)
- AI Message Copilot — context-aware client communication (roadmap)
- Past Work Matching — auto-match portfolio via embeddings (roadmap)

### Upwork Copilot (Chrome Extension)
- AI proposal generation ✅ (implemented)
- Template system ✅ (implemented)
- Client analysis ✅ (implemented)

## Future Roadmap

| Feature | Description | Priority |
|---------|-------------|----------|
| Project Filters + Notifications | Browser notifications for matching jobs by budget, skills, location | High |
| AI Message Copilot | Generate client communication from conversation context | High |
| Past Work Matching | Auto-match portfolio items to job requirements using embeddings | Medium |
| Proposal A/B Testing | Generate 2 variants, track which style wins more | Medium |
| Connect Budget Tracker | Track connects spent, ROI per proposal | Medium |
| Auto-Save Draft | Save proposals as drafts before submitting | Low |
| Settings Sync | Dashboard settings synced to extension | Low |
| Production Deployment | Deploy backend + dashboard to Vercel/Railway | High |

## Tech Stack

- **Extension**: Manifest V3, vanilla JS/HTML/CSS, no build step
- **Backend**: Express.js, ES modules, PostgreSQL, pg driver
- **Dashboard**: Next.js 14 (App Router), Tailwind CSS, Recharts
- **LLM**: @anthropic-ai/sdk + openai SDK
- **Infrastructure**: Docker Compose (3 services: backend, dashboard, postgres)
