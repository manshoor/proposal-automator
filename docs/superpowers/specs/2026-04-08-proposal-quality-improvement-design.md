# Proposal Quality Improvement — Design Spec

**Date:** 2026-04-08
**Problem:** Generated proposals are too generic, too formal, and lack proof — resulting in zero client responses on Upwork.
**Goal:** Make proposals shorter, more specific, and client-aware by passing scraped data to the LLM and rewriting prompts.

---

## Root Cause Analysis

The extension scrapes detailed client data (hire rate, spending, reviews, preferred qualifications, vetting results) but `proposal.service.js` discards most of it. The LLM writes proposals blind to who the client is, how competitive the job is, and what the freelancer has actually built. Proposals read like cover letters instead of targeted messages.

**Data flow gap:**
```
Extension scraper → jobData (rich) → API call (partial) → LLM prompt (minimal)
```

**Fix:**
```
Extension scraper → jobData (rich) → API call (full) → LLM prompt (rich + portfolio)
```

---

## Changes

### 1. Rewrite System Prompt

**File:** `backend/prompts/proposal.js` — `buildSystemPrompt()`

Replace the current system prompt with one that:

- **Rule #1: First 230 characters** — The opening must immediately show understanding of the client's specific problem and reference a relevant past result. This is what clients see before clicking "more" on Upwork.
- **Banned patterns** — Explicitly ban: "I noticed you need...", "I have X years of experience...", "As a skilled developer...", "I'd love to help...", "I'm excited about this opportunity...", any greeting or self-introduction as opening.
- **Brevity** — 2-3 short paragraphs maximum. Sound like a confident message from a peer, not a formal cover letter.
- **Client-aware positioning** — The prompt will receive client context and adjust:
  - High-spending client ($5K+) → emphasize quality, reliability, long-term value
  - New/unverified client → suggest milestone-based delivery, keep scope tight
  - High competition (20+ proposals) → lead with the most specific/unusual proof
  - Low competition (<5 proposals) → can be slightly more detailed
- **Mandatory proof** — Every proposal must reference at least one concrete past result with a specific number (e.g., "reduced load time from 8s to 1.2s", "built 3 similar dashboards").
- **Preferred qualifications** — If provided, the proposal must explicitly address the top 2-3 qualifications.
- **End with a specific question** — Not "looking forward to hearing from you" but a pointed question about the project that shows understanding (e.g., "Are you using PostgreSQL or MySQL for the current backend?").

### 2. Enhance User Prompt with Client Context

**File:** `backend/prompts/proposal.js` — `buildUserPrompt()`

Add new sections to the user prompt:

```
CLIENT CONTEXT (use this to tailor your approach):
- Location: {client.location}
- Total spent on Upwork: ${client.totalSpent}
- Hire rate: {client.hireRate}%
- Reviews: {client.reviewCount}
- Payment verified: {client.paymentVerified}
- Competition: {proposalCount} proposals already submitted

PREFERRED QUALIFICATIONS (address these specifically):
{preferredQualifications list, or "None specified"}
```

### 3. Auto Portfolio Matching

**File:** `backend/services/proposal.service.js` — `generateProposal()`

When `selectedProjects` is empty or not provided:
1. Fetch all user's projects from DB via `projectRepo.findByUserId(userId)`
2. Normalize job skills and project technologies to lowercase
3. Score each project: count of overlapping skills/technologies
4. Select top 2-3 projects with score > 0
5. Inject into user prompt using existing `projectsText` format

If user manually selected projects → use those (manual overrides auto).

If no projects match → proceed without (don't block generation).

### 4. Pass Full Client Data from Extension

**File:** `extension/popup/popup.js` — the `generate-proposal` API call

Currently sends: `title, description, budget, skills, proposalCount, hiddenInstructions, template, selectedProjects`

Add to the payload:
- `client`: the full client object from scraper (location, totalSpent, hireRate, reviewCount, paymentVerified)
- `preferredQualifications`: the extracted qualifications array

No backend schema changes needed — these are passed through to the prompt builder, not stored.

### 5. Profile Validation Before Generation

**File:** `backend/services/proposal.service.js` — `generateProposal()`

Before building prompts, check:
- `profile.title` is non-empty
- `profile.summary` is non-empty  
- `profile.skills` has at least 1 skill

If any are missing, throw a `ValidationError` with message:
`"Please fill out your profile (title, summary, and skills) in the dashboard before generating proposals."`

This prevents wasting connects on generic proposals.

---

## Files to Modify

| File | Change | Impact |
|------|--------|--------|
| `backend/prompts/proposal.js` | Rewrite `buildSystemPrompt()` and `buildUserPrompt()` | Core prompt quality |
| `backend/services/proposal.service.js` | Add auto portfolio matching, pass client data, validate profile | Data pipeline |
| `extension/popup/popup.js` | Include `client` and `preferredQualifications` in API payload | Data sourcing |

## Files NOT Modified

- `extension/content/scraper.js` — Already scrapes all needed data
- Database schema — No new tables or columns needed
- Templates — Templates still work as before (appended to prompt)

---

## Verification

1. **Profile validation:** Try generating a proposal with an empty profile title → should get a clear error
2. **Client context in prompt:** Add a `console.log` or check logs to verify the full client object appears in the LLM prompt
3. **Auto portfolio matching:** Generate a proposal for a React job with React projects in portfolio → proposal should reference those projects without manual selection
4. **First 230 chars:** Generate 5 proposals for different jobs → each opening should be unique, specific, and reference a concrete result within the first ~230 characters
5. **Brevity:** Generated proposals should be 2-3 short paragraphs, conversational tone, no formal greetings
6. **Preferred qualifications:** For a job with specific qualifications listed → proposal should address them
7. **End-to-end:** Generate a proposal from the extension popup on a real Upwork job page → verify it reads like a targeted, credible message from a skilled developer
