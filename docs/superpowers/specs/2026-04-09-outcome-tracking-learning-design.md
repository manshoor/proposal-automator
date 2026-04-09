# Proposal Outcome Tracking & Learning Engine — Design Spec

**Date:** 2026-04-09
**Problem:** No feedback loop exists. The system generates proposals but never learns which ones win or why. Status is tracked (hired/rejected) but not correlated with proposal characteristics.
**Goal:** Track detailed proposal outcomes, auto-detect client responses from Upwork, and use an LLM-powered learning engine to auto-tune the proposal prompt based on winning patterns.

---

## Part 1: Outcome Data Capture

### New columns on `proposals` table

```sql
ALTER TABLE proposals ADD COLUMN responded_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN response_type VARCHAR(20);  -- interview, hired, rejected, no_response
ALTER TABLE proposals ADD COLUMN decline_reason VARCHAR(255);
ALTER TABLE proposals ADD COLUMN client_feedback TEXT;
ALTER TABLE proposals ADD COLUMN proposal_length INT;
ALTER TABLE proposals ADD COLUMN template_used VARCHAR(255);
```

`proposal_length` is computed on save (char count of cover_letter). `template_used` stores the template name if one was selected.

### New table: `proposal_insights`

```sql
CREATE TABLE proposal_insights (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  insight_type VARCHAR(50) NOT NULL,  -- 'learned_rule', 'pattern', 'recommendation'
  insight_text TEXT NOT NULL,
  confidence FLOAT,                    -- 0.0-1.0 based on sample size
  sample_size INT,                     -- how many proposals this was derived from
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_insights_user ON proposal_insights(user_id, is_active);
```

### Backend: Track metadata on proposal save

**File:** `backend/services/proposal.service.js`

In `generateProposal()`, when persisting the proposal (step 9), also save:
- `proposal_length`: `parsed.coverLetter.length`
- `template_used`: `templateContent ? 'custom' : null` (or the actual template name if passed from the extension)

### Dashboard: Enhanced status update form

**File:** `dashboard/app/proposals/page.js`

When clicking to update status in the expanded row, show additional fields:
- **Response type** dropdown: Interview, Hired, Rejected, No Response
- **Responded at** date picker (defaults to now)
- **Decline reason** text input (shown only when response_type is 'rejected')
- **Client feedback** textarea (optional, for any notes)

Save via existing `PUT /proposals/:id` endpoint (extend `updateProposalSchema` to accept new fields).

### Backend: Accept new fields in update

**File:** `backend/services/proposal.service.js` — `updateProposal()`

Add `responded_at`, `response_type`, `decline_reason`, `client_feedback` to the accepted update fields.

**File:** `backend/repositories/proposal.repository.js` — `update()`

Handle the new columns in the dynamic SET builder.

**File:** `backend/schemas/proposal.schema.js` — `updateProposalSchema`

Add Zod validation for the new fields.

---

## Part 2: Auto-Detect from Extension

### How it works

The extension already has `message-scraper.js` running on Upwork message pages. Enhance it to:

1. **Detect new conversations** — when the user is on their Upwork messages page, scan conversation list for new messages
2. **Match against stored proposals** — fetch recent proposals from backend (`GET /proposals?status=sent&limit=50`), compare job titles / client names with message thread subjects
3. **Show notification** — when a match is found, show a subtle banner in the extension popup or a Chrome notification: "Client responded to [job title] — update status?"
4. **Deep link to dashboard** — clicking the notification opens `http://localhost:3003/proposals?highlight={proposalId}` for easy status update

### Content script changes

**File:** `extension/content/message-scraper.js`

Add a function `detectProposalResponses()` that:
- Extracts message thread subjects and client names from the messages page DOM
- Sends them to the service worker via `chrome.runtime.sendMessage({ type: 'CHECK_PROPOSAL_RESPONSES', threads })`

**File:** `extension/background/service-worker.js`

Add handler for `CHECK_PROPOSAL_RESPONSES`:
- Fetch recent sent proposals from backend API
- Fuzzy-match thread subjects against proposal `job_title` values
- For matches, create a Chrome notification: "Client responded to [title]"
- On notification click, open dashboard proposals page

### When it runs

- Triggered when user navigates to Upwork messages page (content script auto-loads)
- Also triggered by the periodic `checkFeed` alarm if notifications are enabled (piggyback on existing alarm)

---

## Part 3: Learning Engine

### Trigger conditions

- **Manual:** "Analyze My Patterns" button on the analytics page
- **Automatic:** When total tracked proposals (with response_type set) reaches milestone thresholds: 20, 50, 100

### Analysis flow

1. **Fetch data:** All proposals with `response_type IS NOT NULL` for the user
2. **Separate:** winning proposals (response_type = 'hired' or 'interview') vs losing (response_type = 'rejected' or 'no_response')
3. **Build analysis prompt** with structured data:
   - Winning proposals: proposal_text, job_title, job_skills, client data, budget, template_used, proposal_length
   - Losing proposals: same fields
   - Current win rate, average proposal length, most common skills
4. **Call LLM** with analysis prompt (see below)
5. **Parse JSON response** — array of learned rules
6. **Store in `proposal_insights`** table — replace previous insights (keep history by not deleting, just set `is_active = false`)

### Analysis LLM prompt

```
You are a proposal performance analyst. Given a freelancer's winning and losing Upwork proposals, identify actionable patterns.

WINNING PROPOSALS ({count}):
{for each: title, skills, budget, client_spent, proposal_length, opening_sentence}

LOSING PROPOSALS ({count}):
{for each: same fields}

CURRENT STATS:
- Win rate: {rate}%
- Average winning proposal length: {avg_win_length} chars
- Average losing proposal length: {avg_lose_length} chars
- Most winning skills: {top_skills}

Analyze and return ONLY a JSON array of learned rules:
[
  {
    "rule": "For [condition], [do this] because [evidence]",
    "confidence": 0.0-1.0,
    "category": "opening|length|tone|proof|targeting|timing"
  }
]

Rules must be:
- Specific and actionable (not "write better proposals")
- Based on actual patterns in the data (cite evidence)
- Limited to 5-7 rules maximum
- Ordered by confidence (highest first)
```

Max tokens: 2048.

### Prompt injection

**File:** `backend/prompts/proposal.js` — `buildSystemPrompt()` or the prompt resolution in `proposal.service.js`

After resolving the system prompt, before sending to LLM:

```js
const insights = await insightRepo.findActive(userId);
if (insights.length > 0) {
  systemPrompt += '\n\nLEARNED PATTERNS (from your proposal history — follow these):';
  insights.forEach((r, i) => {
    systemPrompt += `\n${i + 1}. ${r.insight_text}`;
  });
}
```

This means the proposal generator gets smarter with every tracked outcome.

### Analytics page: "Analyze Patterns" button

**File:** `dashboard/app/analytics/page.js`

Add a card/section:
- Shows current active insights (if any)
- "Analyze My Patterns" button → calls `POST /api/v1/analytics/learn`
- On success, shows the generated insights with confidence scores
- Toggle to enable/disable individual insights

---

## New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/analytics/learn` | Trigger learning analysis |
| GET | `/api/v1/analytics/insights` | List active learned insights |
| PUT | `/api/v1/analytics/insights/:id` | Toggle insight active/inactive |

---

## Files to Create/Modify

| # | File | Action | Change |
|---|------|--------|--------|
| 1 | `backend/db/migrations/013_outcome_tracking.sql` | Create | New columns + insights table |
| 2 | `backend/schemas/proposal.schema.js` | Modify | Add new fields to updateProposalSchema |
| 3 | `backend/repositories/proposal.repository.js` | Modify | Handle new columns in update() |
| 4 | `backend/services/proposal.service.js` | Modify | Track proposal_length/template_used on save, accept new update fields |
| 5 | `backend/repositories/insight.repository.js` | Create | CRUD for proposal_insights |
| 6 | `backend/services/analytics.service.js` | Modify | Add learning analysis function |
| 7 | `backend/api/analytics.js` | Modify | Add learn/insights endpoints |
| 8 | `backend/prompts/proposal.js` | Modify | Inject learned patterns into system prompt |
| 9 | `dashboard/app/proposals/page.js` | Modify | Enhanced status update form |
| 10 | `dashboard/app/analytics/page.js` | Modify | Analyze patterns button + insights display |
| 11 | `extension/content/message-scraper.js` | Modify | Add detectProposalResponses() |
| 12 | `extension/background/service-worker.js` | Modify | Add CHECK_PROPOSAL_RESPONSES handler |

---

## Verification

1. **Outcome tracking:** Update a proposal with response_type, decline_reason → verify saved in DB
2. **Proposal metadata:** Generate a proposal → verify proposal_length is stored
3. **Auto-detect:** Navigate to Upwork messages with a matching sent proposal → should get notification
4. **Learning trigger:** With 20+ tracked proposals, click "Analyze Patterns" → should generate 5-7 insights
5. **Prompt injection:** Generate a proposal after learning → verify insights appear in the system prompt (check backend logs)
6. **Insight toggle:** Disable an insight → next proposal should not include it
7. **Backwards compatibility:** Existing proposals without response_type should still work in analytics
