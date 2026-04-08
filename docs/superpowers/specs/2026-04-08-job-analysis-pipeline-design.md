# Pre-Generation Job Analysis Pipeline — Design Spec

**Date:** 2026-04-08
**Problem:** Proposals are written without deep understanding of the client's actual pain points, urgency, and what differentiates this job.
**Goal:** Add a silent first LLM call that analyzes the job before writing the proposal, feeding structured insights into the generation prompt.

---

## How It Works

Before the existing proposal generation LLM call, a new analysis step runs:

1. First LLM call: Analyze the job posting → structured JSON output
2. Analysis injected into the user prompt as `JOB ANALYSIS` section
3. Second LLM call: Write the proposal using the analysis + all existing context

The user sees no difference in flow — they click "Generate" and get a better proposal.

---

## Changes

### 1. New analysis prompt — `backend/prompts/proposal.js`

Add `buildAnalysisPrompt(jobData, profile)` function.

**System prompt:**
```
You are a job posting analyst for Upwork freelancers. Analyze the job posting and extract structured insights the freelancer needs to write a winning proposal.
Return ONLY valid JSON.
```

**User prompt:**
```
Analyze this Upwork job posting for a freelancer with these skills: {profile.skills}

JOB TITLE: {title}
JOB DESCRIPTION: {description}
BUDGET: {budget}
SKILLS REQUIRED: {skills}
CLIENT: spent ${totalSpent}, hire rate {hireRate}%, {reviewCount} reviews

Return JSON:
{
  "painPoint": "The client's core problem in one sentence — what they actually need solved, not just what they asked for",
  "urgencySignals": ["list of urgency indicators found, or empty array"],
  "criticalRequirements": ["top 3 must-have requirements"],
  "niceToHaves": ["requirements that are preferred but not essential"],
  "redFlags": ["any concerns: vague scope, unrealistic budget, mismatch"],
  "approachAngle": "The best angle for this freelancer to take — what unique value they bring to THIS specific job",
  "openingHook": "A suggested first sentence (under 230 chars) that directly addresses the pain point with proof"
}
```

Max tokens: 1024.

### 2. Integrate into proposal generation — `backend/services/proposal.service.js`

In `generateProposal()`, after profile validation and before building the proposal prompt:

1. Build analysis prompt via `buildAnalysisPrompt(jobData, profile)`
2. Call LLM with the analysis prompt
3. Parse JSON response
4. Inject analysis into the user prompt as a new section:

```
JOB ANALYSIS (use these insights to write a targeted proposal):
- Pain point: {analysis.painPoint}
- Urgency: {analysis.urgencySignals}
- Critical requirements: {analysis.criticalRequirements}
- Approach angle: {analysis.approachAngle}
- Suggested opening: {analysis.openingHook}
```

If analysis fails (parse error, timeout), log warning and proceed without it — don't block proposal generation.

---

## Files to Modify

| File | Change |
|------|--------|
| `backend/prompts/proposal.js` | Add `buildAnalysisPrompt()` function |
| `backend/services/proposal.service.js` | Add analysis step before proposal generation |

---

## Verification

1. Generate a proposal → check backend logs for the analysis JSON output
2. Compare proposal quality with/without analysis (temporarily disable to compare)
3. Verify analysis failure doesn't block proposal generation
4. Check that the opening line uses the suggested hook or something better
