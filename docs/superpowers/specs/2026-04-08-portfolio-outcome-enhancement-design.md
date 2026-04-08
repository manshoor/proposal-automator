# Portfolio Outcome Enhancement — Design Spec

**Date:** 2026-04-08  
**Problem:** Portfolio project outcomes are vague (e.g., "completed successfully"), which weakens every proposal since auto-matching now injects these projects. The LLM needs compelling proof to reference.  
**Goal:** Add AI-powered outcome enhancement — per-project and bulk — so every project has a metric-driven outcome statement.

---

## Feature 1: Per-Project Enhancement

### Backend: `POST /api/v1/projects/:id/enhance`

**File:** `backend/api/projects.js`

New route on the existing projects router. Middleware: `llmLimiter` + `asyncHandler`.

**Flow:**
1. Fetch project by ID + userId from DB via `projectRepo.findById(id, userId)`
2. If not found → 404
3. Resolve LLM config via `resolveLLMConfig(req.body, userId)`
4. Call LLM with enhancement prompt (see Prompt section below)
5. Parse JSON response → return `{ outcome, description }`

**Does NOT auto-save.** Returns the enhanced text for the user to review and accept via the existing `PUT /projects/:id` endpoint.

### Frontend: Enhance button + inline preview

**File:** `dashboard/app/projects/page.js`

- Add a sparkle/wand icon button on each project card
- On click: `api.post('/projects/${id}/enhance')` → shows loading state
- On success: show a preview card with enhanced `outcome` and `description`
- "Accept" button saves via `api.put('/projects/${id}', { outcome, description })`
- "Discard" button dismisses the preview

---

## Feature 2: Bulk Enhancement

### Backend: `POST /api/v1/projects/enhance-all`

**File:** `backend/api/projects.js`

New route. Middleware: `llmLimiter` + `asyncHandler`.

**Flow:**
1. Fetch all user's projects via `projectRepo.findAll({}, userId)`
2. Filter to projects needing enhancement: `outcome` is empty, or `outcome.length < 30` (likely vague)
3. For each project, call LLM with the same enhancement prompt
4. Process sequentially (not parallel) to respect rate limits
5. Return array: `{ projects: [{ id, name, enhancedOutcome, enhancedDescription }] }`

**Does NOT auto-save.** Returns all enhancements for batch review.

### Frontend: Bulk enhance UI

**File:** `dashboard/app/projects/page.js`

- "Enhance All Projects" button at the top of the projects page (next to import)
- On click: `api.post('/projects/enhance-all')` → shows progress indicator
- On success: show a review modal/section listing all enhanced projects
- Each project shows: name, current outcome → enhanced outcome, current description → enhanced description
- Per-project "Accept" / "Skip" toggles
- "Save All Accepted" button → calls `api.put('/projects/${id}')` for each accepted project

---

## LLM Prompt

Single prompt used by both endpoints:

```
You are a portfolio copywriter for a freelancer. Enhance this project's description and outcome to be compelling and metric-driven.

PROJECT:
- Name: {name}
- Description: {description}
- Technologies: {technologies}
- Category: {category}
- Current outcome: {outcome or "none provided"}

RULES:
1. OUTCOME: Write a 1-2 sentence outcome that includes at least one specific metric (percentage improvement, time saved, users/traffic numbers, revenue impact). If no real metrics are known, use realistic estimates typical for this type of project (e.g., "Reduced page load time by ~60%" for a performance optimization project).
2. DESCRIPTION: Write a 2-3 sentence description that clearly explains what was built, the technical challenge solved, and the business value delivered. Keep existing accurate details.
3. Sound natural and credible — not exaggerated.
4. Focus on business impact, not just technical details.

Return ONLY valid JSON:
{"outcome": "...", "description": "..."}
```

Max tokens: 512. Uses existing `resolveLLMConfig` + `callLLM` from `llm.service.js`.

---

## Files to Modify

| File | Change |
|------|--------|
| `backend/api/projects.js` | Add `POST /:id/enhance` and `POST /enhance-all` routes |
| `dashboard/app/projects/page.js` | Add per-project enhance button, bulk enhance button, review UI |

Existing infrastructure reused: `projectRepo`, `llmLimiter`, `asyncHandler`, `resolveLLMConfig`, `callLLM`, `api.post()` / `api.put()`.

---

## Verification

1. **Per-project:** Click enhance on a project with a vague outcome → should return a metric-driven outcome + improved description
2. **Bulk:** Click "Enhance All" with several weak-outcome projects → should return enhancements for each, allow selective accept
3. **Accept flow:** Accept an enhancement → project should update in DB, show new outcome on the card
4. **Discard flow:** Discard → nothing changes
5. **Empty portfolio:** Bulk enhance with no projects → should show "No projects to enhance" message
6. **Rate limiting:** Bulk enhance with 10+ projects → should complete without hitting rate limits (sequential processing)
7. **Auto-matching check:** Generate a proposal after enhancing outcomes → the auto-matched projects should now carry the improved proof text
