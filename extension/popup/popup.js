/**
 * popup.js
 * Drives the extension popup UI.
 * All DOM manipulation and chrome API calls happen here.
 */

'use strict';

// ---- DOM references ----
const statusBar       = document.getElementById('status-bar');
const statusDot       = document.getElementById('status-dot');
const statusText      = document.getElementById('status-text');
const mainContent     = document.getElementById('main-content');
const notUpworkMsg    = document.getElementById('not-upwork-msg');

const jobTitleText    = document.getElementById('job-title-text');
const jobBudgetText   = document.getElementById('job-budget-text');
const jobProposalsText= document.getElementById('job-proposals-text');

const vettingBadge        = document.getElementById('vetting-overall-badge');
const dotLocation         = document.getElementById('dot-location');
const dotSpending         = document.getElementById('dot-spending');
const dotHireRate         = document.getElementById('dot-hirerate');
const dotReviews          = document.getElementById('dot-reviews');
const dotRating           = document.getElementById('dot-rating');
const dotCompetition      = document.getElementById('dot-competition');
const dotActivity         = document.getElementById('dot-activity');
const msgLocation         = document.getElementById('msg-location');
const msgSpending         = document.getElementById('msg-spending');
const msgHireRate         = document.getElementById('msg-hirerate');
const msgReviews          = document.getElementById('msg-reviews');
const msgRating           = document.getElementById('msg-rating');
const msgCompetition      = document.getElementById('msg-competition');
const msgActivity         = document.getElementById('msg-activity');

const locationWarning     = document.getElementById('location-warning');
const locationWarningText = document.getElementById('location-warning-text');
const hiddenInstrAlert    = document.getElementById('hidden-instructions-alert');
const hiddenInstrList     = document.getElementById('hidden-instructions-list');

const btnGenerate     = document.getElementById('btn-generate');
const loadingSpinner  = document.getElementById('loading-spinner');
const proposalPreview = document.getElementById('proposal-preview');
const suggestedRate   = document.getElementById('suggested-rate');
const coverLetterText = document.getElementById('cover-letter-text');

const btnAutofill     = document.getElementById('btn-autofill');
const btnCopy         = document.getElementById('btn-copy');

const btnRegenerate   = document.getElementById('btn-regenerate');

const templateSelector = document.getElementById('template-selector');
const templateDropdown = document.getElementById('template-dropdown');

const loomUrlInput = document.getElementById('loom-url-input');

// ---- Record button — open record page in a new tab ----
const btnLoomRecord = document.getElementById('btn-loom-record');
if (btnLoomRecord) {
  btnLoomRecord.addEventListener('click', async () => {
    try {
      const url = chrome.runtime.getURL('record/record.html');
      await chrome.tabs.create({ url, active: true });
    } catch (err) {
      alert('Could not open recorder: ' + (err && err.message ? err.message : 'unknown error'));
    }
  });
}

const btnAbTest       = document.getElementById('btn-ab-test');
const abComparison    = document.getElementById('ab-comparison');

const btnOpenOptions  = document.getElementById('btn-open-options');
const linkSettings    = document.getElementById('link-settings');
const linkDashboard   = document.getElementById('link-dashboard');

// ---- State ----
let _currentJobData  = null;
let _currentVetting  = null;
let _activeTabId     = null;
let _generatedProposal = null;
let _profileSkills   = [];
// A/B variant tracking — set when user picks a variant card; cleared on new generation
let _chosenVariant   = null;  // 'A' | 'B' | null
let _chosenProposalId = null; // proposalId of the chosen variant row

// ---- Helpers ----

/**
 * Map a vetting status string to a dot CSS class.
 * @param {string} status
 * @returns {string}
 */
function statusToDotClass(status) {
  switch (status) {
    case 'good':    return 'dot-green';
    case 'warning':
    case 'low':
    case 'few':     return 'dot-yellow';
    case 'none':    return 'dot-red';
    default:        return 'dot-grey';
  }
}

/**
 * Map a competition level to a dot CSS class.
 * @param {string} level
 * @returns {string}
 */
function competitionToDotClass(level) {
  switch (level) {
    case 'low':    return 'dot-green';
    case 'medium': return 'dot-yellow';
    case 'high':   return 'dot-red';
    default:       return 'dot-grey';
  }
}

/**
 * Apply a dot colour class to an element, removing prior colour classes.
 * @param {HTMLElement} el
 * @param {string} cls
 */
function setDotClass(el, cls) {
  el.classList.remove('dot-green', 'dot-yellow', 'dot-red', 'dot-grey');
  el.classList.add(cls);
}

/**
 * Apply a badge CSS class.
 * @param {HTMLElement} el
 * @param {'green'|'yellow'|'red'|'grey'} colour
 * @param {string} label
 */
function setBadge(el, colour, label) {
  el.className = `badge badge-${colour}`;
  el.textContent = label;
}

/**
 * Format a budget object into a human-readable string.
 * @param {{ type: string, min: number|null, max: number|null, amount: number|null }} budget
 * @returns {string}
 */
function formatBudget(budget) {
  if (!budget) return '—';
  const { type, min, max, amount } = budget;

  const fmt = (n) => n != null ? `$${Math.round(n).toLocaleString()}` : null;

  let str = '';
  if (min != null && max != null) {
    str = `${fmt(min)}–${fmt(max)}`;
  } else if (amount != null) {
    str = fmt(amount);
  } else {
    return '—';
  }

  if (type === 'hourly') str += '/hr';
  return str;
}

/**
 * Show the "Copy!" feedback on the copy button temporarily.
 */
function flashCopyButton() {
  const original = btnCopy.textContent;
  btnCopy.textContent = 'Copied!';
  btnCopy.disabled = true;
  setTimeout(() => {
    btnCopy.textContent = original;
    btnCopy.disabled = false;
  }, 2000);
}

// ---- Job Fit Score ----

function calculateFitScore(jobSkills, profileSkills) {
  if (!jobSkills || jobSkills.length === 0) return -1; // can't calculate
  if (!profileSkills || profileSkills.length === 0) return 0;
  const jobLower = jobSkills.map(s => s.toLowerCase().trim());
  const profileLower = profileSkills.map(s => s.toLowerCase().trim());
  const matched = jobLower.filter(s => profileLower.some(p => p.includes(s) || s.includes(p)));
  return Math.round((matched.length / jobLower.length) * 100);
}

function showFitScore(score) {
  const badge = document.getElementById('fit-score-badge');
  if (score < 0) { badge.classList.add('hidden'); return; }
  badge.classList.remove('hidden');
  badge.textContent = `${score}% fit`;
  badge.className = 'fit-score-badge ' + (score >= 70 ? 'fit-high' : score >= 40 ? 'fit-med' : 'fit-low');
}

function showBidGuidance(fitScore, vettingOverall) {
  const el = document.getElementById('bid-guidance');
  const icon = document.getElementById('bid-guidance-icon');
  const text = document.getElementById('bid-guidance-text');
  el.classList.remove('hidden', 'bid-strong', 'bid-moderate', 'bid-weak');

  if (fitScore >= 70 && vettingOverall !== 'red') {
    el.classList.add('bid-strong');
    icon.textContent = '✅';
    text.textContent = 'Strong Match — Bid Now';
  } else if (fitScore >= 40 || vettingOverall === 'green') {
    el.classList.add('bid-moderate');
    icon.textContent = '⚠️';
    text.textContent = 'Worth Reviewing — Check Details';
  } else if (fitScore >= 0) {
    el.classList.add('bid-weak');
    icon.textContent = '❌';
    text.textContent = 'Weak Match — Consider Skipping';
  } else {
    el.classList.add('bid-moderate');
    icon.textContent = '❓';
    text.textContent = 'Add skills to your profile for match scoring';
  }
}

// ---- Quality Indicators ----

function showQualityIndicators(coverLetter) {
  const container = document.getElementById('quality-indicators');
  const wordsEl = document.getElementById('qi-words');
  const parasEl = document.getElementById('qi-paragraphs');
  const hiddenEl = document.getElementById('qi-hidden');

  if (!coverLetter) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');

  const words = coverLetter.trim().split(/\s+/).length;
  const paragraphs = coverLetter.trim().split(/\n\s*\n/).length;

  wordsEl.textContent = `${words} words`;
  wordsEl.className = 'qi-badge ' + (words >= 80 && words <= 200 ? 'qi-good' : 'qi-warn');

  parasEl.textContent = `${paragraphs} paragraphs`;
  parasEl.className = 'qi-badge ' + (paragraphs >= 2 && paragraphs <= 5 ? 'qi-good' : 'qi-warn');

  // Check if hidden instruction was detected and included
  if (_currentJobData && _currentJobData._hiddenInstructions && _currentJobData._hiddenInstructions.found) {
    hiddenEl.classList.remove('hidden');
    hiddenEl.textContent = 'Hidden instruction included';
    hiddenEl.className = 'qi-badge qi-good';
  }
}

// ---- Hook Validation (Phase 1: Hook Surgeon) ----

/**
 * Render the hook score widget for the first 230 chars of a generated proposal.
 * @param {object} validation - { score, issues, blockers, hasBlocker, failureSummary, hookText }
 * @param {string|null} hookStyle - One of HOOK_STYLES keys
 */
function showHookValidation(validation, hookStyle) {
  const container = document.getElementById('hook-validation');
  if (!validation) { container.classList.add('hidden'); return; }

  const scoreEl = document.getElementById('hv-score');
  const styleEl = document.getElementById('hv-style');
  const checksEl = document.getElementById('hv-checks');
  const bannerEl = document.getElementById('hv-blocker-banner');

  container.classList.remove('hidden');

  const score = typeof validation.score === 'number' ? validation.score : 0;
  scoreEl.textContent = `${score}/100`;
  scoreEl.className = 'hv-score-badge ' + (score >= 80 ? 'hv-good' : score >= 50 ? 'hv-fair' : 'hv-poor');

  if (hookStyle) {
    styleEl.classList.remove('hidden');
    styleEl.textContent = hookStyle.replace(/-/g, ' ');
  } else {
    styleEl.classList.add('hidden');
  }

  // Clear existing children safely (no innerHTML — avoids XSS even if content is static)
  while (checksEl.firstChild) checksEl.removeChild(checksEl.firstChild);

  const blockers = Array.isArray(validation.blockers) ? validation.blockers : [];
  const issues = Array.isArray(validation.issues) ? validation.issues : [];

  if (blockers.length === 0 && issues.length === 0) {
    appendHookCheckRow(checksEl, 'pass', 'All checks passed — opening looks click-worthy.');
  } else {
    blockers.forEach(b => appendHookCheckRow(checksEl, 'block', b.message || b.phrase || b.type));
    issues.forEach(i => appendHookCheckRow(checksEl, 'warn', i.message || i.phrase || i.type));
  }

  if (validation.hasBlocker) {
    bannerEl.textContent = 'Submission blocked — fix the issues above before sending. Regenerate or edit the opening.';
    bannerEl.classList.remove('hidden');
  } else {
    bannerEl.classList.add('hidden');
  }
}

function appendHookCheckRow(parent, kind, message) {
  const li = document.createElement('li');
  const icon = document.createElement('span');
  icon.className = 'hv-icon hv-' + kind;
  icon.textContent = kind === 'pass' ? '✓' : (kind === 'block' ? '✕' : '!');
  const msg = document.createElement('span');
  msg.className = 'hv-msg ' + (kind === 'block' ? 'hv-msg-block' : kind === 'warn' ? 'hv-msg-warn' : '');
  msg.textContent = message;
  li.appendChild(icon);
  li.appendChild(msg);
  parent.appendChild(li);
}

// ---- Phase 4: Screening Answers ----

/**
 * Render the screening question answers block.
 * Hides the container when there are no answers (backwards-compat default).
 * @param {string[]} answers - Array of answer strings, one per screening question
 */
function showScreeningAnswers(answers) {
  const container = document.getElementById('screening-answers');
  if (!container) return;
  if (!Array.isArray(answers) || answers.length === 0) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  const list = document.getElementById('sa-list');
  // Clear existing children safely (no innerHTML — there's a security hook)
  while (list.firstChild) list.removeChild(list.firstChild);
  for (const ans of answers) {
    const li = document.createElement('li');
    li.textContent = ans;
    list.appendChild(li);
  }
}

// ---- Phase 4: Follow-up scheduler ----

function showFollowUpSection(proposal) {
  const container = document.getElementById('follow-up-section');
  if (!container) return;
  // Only show when the proposal was actually persisted (we need the proposalId
  // for the POST). If persistence failed (proposalId null), hide the section.
  if (!proposal || !proposal.proposalId) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  // Reset state from any prior generation
  const status = document.getElementById('fu-status');
  const preview = document.getElementById('fu-preview');
  status.classList.add('hidden');
  status.textContent = '';
  preview.classList.add('hidden');
  preview.textContent = '';

  // Re-enable buttons in case they were disabled by a prior schedule
  const buttons = document.querySelectorAll('#fu-actions .fu-btn');
  buttons.forEach((btn) => { btn.disabled = false; });
}

async function handleFollowUpClick(btn) {
  if (!_generatedProposal || !_generatedProposal.proposalId) return;
  const days = parseInt(btn.dataset.days, 10);
  if (!Number.isFinite(days) || days <= 0) return;

  const buttons = document.querySelectorAll('#fu-actions .fu-btn');
  buttons.forEach((b) => { b.disabled = true; });

  try {
    const result = await apiFetch('/api/v1/follow-ups', {
      method: 'POST',
      body: JSON.stringify({
        proposalId: _generatedProposal.proposalId,
        intervalDays: days,
        autoGenerate: true,
      }),
    });
    const status = document.getElementById('fu-status');
    const preview = document.getElementById('fu-preview');

    const date = new Date(result.scheduledAt);
    const formatted = date.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    status.textContent = 'Scheduled for ' + formatted;
    status.classList.remove('hidden');

    if (result.messageText) {
      preview.textContent = result.messageText;
      preview.classList.remove('hidden');
    }
  } catch (err) {
    alert('Could not schedule follow-up: ' + (err && err.message ? err.message : 'unknown error'));
    buttons.forEach((b) => { b.disabled = false; });
  }
}

// ---- Phase 2: Inbox Top render helpers ----

function showPhase2Metrics(alignment, boostDecision) {
  const container = document.getElementById('phase2-metrics');
  if (!alignment && !boostDecision) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');

  if (alignment) {
    const score = Number(alignment.overall) || 0;
    const scoreEl = document.getElementById('p2-align-score');
    const detailEl = document.getElementById('p2-align-detail');
    scoreEl.textContent = `${score.toFixed(1)}/10`;
    scoreEl.className = 'p2-score ' + (score >= 7 ? 'p2-good' : score >= 5 ? 'p2-fair' : 'p2-poor');
    const shared = Array.isArray(alignment.breakdown?.sharedSkills) ? alignment.breakdown.sharedSkills.slice(0, 3).join(', ') : '';
    const rateNote = alignment.rateFit && alignment.rateFit !== 'unknown' ? ` · rate ${alignment.rateFit}` : '';
    detailEl.textContent = `Skills overlap ${Math.round((alignment.skillOverlap || 0) * 100)}%${shared ? ` (${shared})` : ''}${rateNote}`;
  }

  if (boostDecision) {
    const recEl = document.getElementById('p2-boost-rec');
    const reasonEl = document.getElementById('p2-boost-reason');
    const rec = boostDecision.recommendation || 'unknown';
    recEl.textContent = rec;
    recEl.className = 'p2-rec p2-' + rec;
    reasonEl.textContent = boostDecision.reason || '';
  }
}

function showPreflight(preflight) {
  const container = document.getElementById('preflight');
  if (!preflight || !Array.isArray(preflight.gates)) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');

  const gatesEl = document.getElementById('pf-gates');
  const summaryEl = document.getElementById('pf-summary');
  const overrideRow = document.getElementById('pf-override-row');
  const overrideCb = document.getElementById('pf-override');

  const total = preflight.gates.length;
  const passed = preflight.gates.filter(g => g.passed).length;
  const blockers = preflight.gates.filter(g => !g.passed && g.severity === 'block').length;
  summaryEl.textContent = `${passed}/${total} passed`;
  summaryEl.className = 'pf-summary ' + (blockers > 0 ? 'pf-block' : passed < total ? 'pf-warn' : 'pf-pass');

  while (gatesEl.firstChild) gatesEl.removeChild(gatesEl.firstChild);
  for (const g of preflight.gates) appendPreflightRow(gatesEl, g);

  if (blockers > 0) {
    overrideRow.classList.remove('hidden');
    if (overrideCb) overrideCb.checked = false;
  } else {
    overrideRow.classList.add('hidden');
  }
}

function appendPreflightRow(parent, gate) {
  const li = document.createElement('li');
  const kind = gate.passed ? 'pass' : (gate.severity === 'block' ? 'block' : 'warn');
  const icon = document.createElement('span');
  icon.className = 'pf-icon pf-' + kind;
  icon.textContent = kind === 'pass' ? '✓' : (kind === 'block' ? '✕' : '!');
  const name = document.createElement('span');
  name.className = 'pf-name';
  name.textContent = (gate.name || gate.id || '') + ':';
  const msg = document.createElement('span');
  msg.className = 'pf-msg ' + (kind === 'block' ? 'pf-msg-block' : kind === 'warn' ? 'pf-msg-warn' : '');
  msg.textContent = ' ' + (gate.message || '');
  li.appendChild(icon);
  li.appendChild(name);
  li.appendChild(msg);
  parent.appendChild(li);
}

function showAIGeneric(aiGeneric) {
  const container = document.getElementById('ai-generic');
  if (!aiGeneric || !aiGeneric.flagged) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');

  const scoreEl = document.getElementById('ag-score');
  const reasoningEl = document.getElementById('ag-reasoning');
  const phrasesEl = document.getElementById('ag-phrases');
  const actionsEl = document.getElementById('ag-actions');

  scoreEl.textContent = `${aiGeneric.score}/10`;
  reasoningEl.textContent = aiGeneric.reasoning || 'Generic AI tone detected.';

  while (phrasesEl.firstChild) phrasesEl.removeChild(phrasesEl.firstChild);
  const judgePhrases = Array.isArray(aiGeneric.genericPhrases) ? aiGeneric.genericPhrases : [];
  const rulePhrases = Array.isArray(aiGeneric.ruleHits) ? aiGeneric.ruleHits.map(h => h.phrase) : [];
  const all = [...new Set([...judgePhrases, ...rulePhrases])].slice(0, 5);
  for (const p of all) {
    const li = document.createElement('li');
    li.textContent = p;
    phrasesEl.appendChild(li);
  }

  if (aiGeneric.rewriteSuggestion) actionsEl.classList.remove('hidden');
  else actionsEl.classList.add('hidden');
}

// ---- UI state transitions ----

function showNotUpwork() {
  statusBar.className = 'status-bar status-inactive';
  statusText.textContent = 'Not on an Upwork job page';
  mainContent.classList.add('hidden');
  notUpworkMsg.classList.remove('hidden');
}

function showOnUpwork() {
  statusBar.className = 'status-bar status-active';
  statusText.textContent = 'Upwork job page detected';
  mainContent.classList.remove('hidden');
  notUpworkMsg.classList.add('hidden');
}

/**
 * Populate the job summary strip.
 * @param {object} jobData
 */
function populateJobSummary(jobData) {
  jobTitleText.textContent = jobData.title || '(no title found)';
  jobBudgetText.textContent = formatBudget(jobData.budget);
  jobProposalsText.textContent = jobData.proposalCountText
    ? jobData.proposalCountText + ' proposals'
    : jobData.proposalCount
      ? `${jobData.proposalCount} proposals`
      : 'Proposals: unknown';

  // Show Connect cost if available
  const connectsEl = document.getElementById('job-connects-text');
  if (jobData.connectCost) {
    const usd = (jobData.connectCost * 0.30).toFixed(2);
    connectsEl.textContent = `${jobData.connectCost} Connects ($${usd})`;
    connectsEl.classList.remove('hidden');
  }
}

/**
 * Populate the vetting card using pre-computed vetting results.
 * @param {object} vetting - Return value of vetClient()
 */
function populateVetting(vetting) {
  const { overall, locationCheck, spendingCheck, hireRateCheck, reviewsCheck, ratingCheck, activityCheck, proposalCompetition, preferredQualifications } = vetting;

  // Overall badge
  const badgeLabels = { green: 'Good', yellow: 'Caution', red: 'Risk' };
  setBadge(vettingBadge, overall, badgeLabels[overall] || overall);

  // Individual dots + messages
  setDotClass(dotLocation,    statusToDotClass(locationCheck.status));
  msgLocation.textContent = locationCheck.message;

  setDotClass(dotSpending,    statusToDotClass(spendingCheck.status));
  msgSpending.textContent = spendingCheck.message;

  setDotClass(dotHireRate,    statusToDotClass(hireRateCheck.status));
  msgHireRate.textContent = hireRateCheck.message;

  setDotClass(dotReviews,     statusToDotClass(reviewsCheck.status));
  msgReviews.textContent = reviewsCheck.message;

  // Rating
  if (ratingCheck) {
    var ratingDotMap = { good: 'dot-green', fair: 'dot-yellow', low: 'dot-red', unknown: 'dot-grey' };
    setDotClass(dotRating, ratingDotMap[ratingCheck.status] || 'dot-grey');
    msgRating.textContent = ratingCheck.message;
  }

  setDotClass(dotCompetition, competitionToDotClass(proposalCompetition.level));
  msgCompetition.textContent = proposalCompetition.message;

  // Activity
  if (activityCheck) {
    var activityDotMap = { active: 'dot-green', slow: 'dot-yellow', inactive: 'dot-red', unknown: 'dot-grey' };
    setDotClass(dotActivity, activityDotMap[activityCheck.status] || 'dot-grey');
    msgActivity.textContent = activityCheck.message;
  }

  // Preferred Qualifications
  var qualsSection = document.getElementById('qualifications-section');
  var qualsList = document.getElementById('qualifications-list');
  if (preferredQualifications && preferredQualifications.length > 0) {
    qualsSection.classList.remove('hidden');
    qualsList.innerHTML = '';
    for (var qi = 0; qi < preferredQualifications.length; qi++) {
      var qli = document.createElement('li');
      qli.textContent = preferredQualifications[qi];
      qli.style.cssText = 'padding:2px 0;border-bottom:1px solid #dbeafe;';
      qualsList.appendChild(qli);
    }
  } else {
    qualsSection.classList.add('hidden');
  }

  // Location warning banner
  if (locationCheck.status === 'warning') {
    locationWarning.classList.remove('hidden');
    locationWarningText.textContent = ` ${locationCheck.message}`;
    if (overall === 'red') {
      locationWarning.className = 'alert alert-error';
    } else {
      locationWarning.className = 'alert alert-warning';
    }
  } else {
    locationWarning.classList.add('hidden');
  }

  // Red Flags
  const redFlagsSection = document.getElementById('red-flags-section');
  const redFlagsList = document.getElementById('red-flags-list');
  const flags = vetting.redFlags || [];

  if (flags.length > 0) {
    redFlagsSection.classList.remove('hidden');
    redFlagsList.innerHTML = '';
    for (const flag of flags) {
      const li = document.createElement('li');
      const severitySpan = document.createElement('span');
      severitySpan.className = 'rf-severity rf-' + (flag.severity || 'low');
      const textSpan = document.createElement('span');
      textSpan.className = 'rf-text';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'rf-flag-name';
      nameSpan.textContent = flag.flag;
      const detailSpan = document.createElement('span');
      detailSpan.className = 'rf-detail';
      detailSpan.textContent = flag.detail;
      textSpan.appendChild(nameSpan);
      textSpan.appendChild(document.createTextNode(' — '));
      textSpan.appendChild(detailSpan);
      li.appendChild(severitySpan);
      li.appendChild(textSpan);
      redFlagsList.appendChild(li);
    }
  } else {
    redFlagsSection.classList.add('hidden');
  }
}

/**
 * Populate the hidden instructions alert.
 * @param {{ found: boolean, instructions: string[] }} hiddenInstructions
 */
function populateHiddenInstructions(hiddenInstructions) {
  if (!hiddenInstructions || !hiddenInstructions.found) {
    hiddenInstrAlert.classList.add('hidden');
    return;
  }

  hiddenInstrAlert.classList.remove('hidden');
  hiddenInstrList.innerHTML = '';
  for (const instr of hiddenInstructions.instructions) {
    const li = document.createElement('li');
    li.textContent = instr;
    hiddenInstrList.appendChild(li);
  }
}

/**
 * Show the generated proposal in the preview panel.
 * @param {{ coverLetter: string, hourlyRate?: number }} proposal
 */
function showProposalPreview(proposal) {
  _generatedProposal = proposal;

  coverLetterText.value = proposal.coverLetter || '';
  if (proposal.hourlyRate) {
    suggestedRate.textContent = `Suggested: $${proposal.hourlyRate}/hr`;
    suggestedRate.classList.remove('hidden');
  } else {
    suggestedRate.classList.add('hidden');
  }

  // Show milestones if present
  const milestonesContainer = document.getElementById('milestones-preview');
  if (milestonesContainer) {
    if (proposal.milestones && proposal.milestones.length > 0) {
      let html = '<div class="milestones-header"><strong>Milestones</strong></div>';
      for (const ms of proposal.milestones) {
        html += `<div class="milestone-item"><span class="milestone-desc">${ms.description}</span><span class="milestone-amt">$${ms.amount.toFixed(2)}</span></div>`;
      }
      const total = proposal.milestones.reduce((s, m) => s + m.amount, 0);
      html += `<div class="milestone-item milestone-total"><span>Total</span><span>$${total.toFixed(2)}</span></div>`;
      milestonesContainer.innerHTML = html;
      milestonesContainer.classList.remove('hidden');
    } else {
      milestonesContainer.classList.add('hidden');
    }
  }

  // Show budget warning if present
  const warningContainer = document.getElementById('budget-warning');
  if (warningContainer) {
    if (proposal.budgetWarning) {
      warningContainer.textContent = proposal.budgetWarning;
      warningContainer.classList.remove('hidden');
    } else {
      warningContainer.classList.add('hidden');
    }
  }

  showScreeningAnswers(proposal.screeningAnswers);
  showQualityIndicators(proposal.coverLetter);
  showHookValidation(proposal.hookValidation, proposal.hookStyle);
  showPhase2Metrics(proposal.alignment, proposal.boostDecision);
  showPreflight(proposal.preflight);
  showAIGeneric(proposal.aiGeneric);
  showFollowUpSection(proposal);

  proposalPreview.classList.remove('hidden');
  proposalPreview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- Chrome messaging helpers ----

/**
 * Send a message to the content script in the given tab.
 * @param {number} tabId
 * @param {object} message
 * @returns {Promise<any>}
 */
function sendToContent(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Send a message to the background service worker.
 * @param {object} message
 * @returns {Promise<any>}
 */
function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ---- Initialisation ----

/**
 * Phase 3 — sync the user's outcome_tracking_enabled flag from the backend
 * into chrome.storage.local so the outcome-detector content script knows whether
 * to run on Upwork pages.
 */
async function syncOutcomeTrackingFlag() {
  try {
    const data = await apiFetch('/api/v1/outcomes/tracking');
    const enabled = !!(data && data.enabled);
    await chrome.storage.local.set({ outcome_tracking_enabled: enabled });
  } catch (err) {
    // Non-fatal — leave existing flag value as-is on failure
    console.warn('[popup] outcome tracking sync failed', err?.message || err);
  }
}

async function init() {
  // Check login status first
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    document.getElementById('login-required-msg').classList.remove('hidden');
    mainContent.classList.add('hidden');
    notUpworkMsg.classList.add('hidden');
    document.getElementById('btn-open-login').addEventListener('click', function() {
      chrome.runtime.openOptionsPage();
    });
    return;
  }

  // Sync the outcome-tracking flag (non-blocking — content scripts pick up next page load)
  syncOutcomeTrackingFlag();

  // Find the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showNotUpwork();
    return;
  }

  _activeTabId = tab.id;

  // Check if we're on an Upwork job page
  const isUpwork = tab.url && tab.url.match(
    /^https:\/\/www\.upwork\.com\/(jobs|ab\/proposals\/job|nx\/proposals\/job|freelance-jobs\/apply|nx\/find-work)\//
  );

  if (!isUpwork) {
    showNotUpwork();
    return;
  }

  showOnUpwork();

  // Load bootstrap data and vetting in PARALLEL
  try {
    const [response, bootstrap] = await Promise.all([
      sendToContent(_activeTabId, { type: 'GET_VETTING' }),
      loadBootstrapData(),
    ]);

    if (!response) {
      statusText.textContent = 'Content script not responding. Reload the page and try again.';
      return;
    }

    if (!response.success) {
      statusText.textContent = 'Error reading page: ' + (response.error || 'Unknown');
      console.error('[Popup] Content script error:', response.error);
      return;
    }

    const { jobData, vetting, hiddenInstructions } = response.data;
    _currentJobData = jobData;
    _currentVetting = vetting;

    populateJobSummary(jobData);
    populateVetting(vetting);
    populateHiddenInstructions(hiddenInstructions);

    // Use bootstrap data for profile skills, templates, projects, settings, duplicates
    if (bootstrap) {
      // Sync notification settings
      const s = bootstrap.settings || {};
      chrome.storage.sync.set({
        jobFilters: {
          enabled: true,
          skillsInclude: s.skills_include || [],
          keywordsInclude: s.keywords_include || [],
          keywordsExclude: s.keywords_exclude || [],
          budgetMin: s.budget_min || null,
          budgetMax: s.budget_max || null,
        }
      });
      chrome.runtime.sendMessage({
        type: 'ENABLE_FEED_NOTIFICATIONS',
        enabled: s.notification_enabled || false,
        intervalMinutes: s.notification_interval || 15
      });

      // Profile skills for fit score
      _profileSkills = Array.isArray(bootstrap.profile?.skills) ? bootstrap.profile.skills : [];

      // Templates dropdown
      const templates = bootstrap.templates || [];
      if (templates.length > 0) {
        templateSelector.classList.remove('hidden');
        templates.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.name;
          opt.dataset.content = t.content;
          templateDropdown.appendChild(opt);
        });
      }

      // Project checkboxes
      const projects = bootstrap.projects || [];
      if (projects.length > 0) {
        const container = document.getElementById('project-selector');
        const checkboxes = document.getElementById('project-checkboxes');
        container.classList.remove('hidden');

        const selectAllDiv = document.createElement('div');
        selectAllDiv.className = 'project-check-item';
        selectAllDiv.style.borderBottom = '1px solid #e5e7eb';
        selectAllDiv.style.paddingBottom = '6px';
        selectAllDiv.style.marginBottom = '4px';
        const selectAllCb = document.createElement('input');
        selectAllCb.type = 'checkbox';
        selectAllCb.id = 'project-select-all';
        const selectAllLabel = document.createElement('div');
        selectAllLabel.innerHTML = '<span class="project-check-name" style="color:#2563eb;">Select All Projects</span>';
        selectAllCb.addEventListener('change', function () {
          checkboxes.querySelectorAll('input[type="checkbox"]:not(#project-select-all)').forEach(function (cb) { cb.checked = selectAllCb.checked; });
        });
        selectAllDiv.appendChild(selectAllCb);
        selectAllDiv.appendChild(selectAllLabel);
        checkboxes.appendChild(selectAllDiv);

        projects.forEach(p => {
          const div = document.createElement('div');
          div.className = 'project-check-item';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.dataset.projectId = p.id;
          cb.dataset.projectName = p.name;
          cb.dataset.projectDesc = p.description || '';
          cb.dataset.projectTech = Array.isArray(p.technologies) ? p.technologies.join(', ') : '';
          cb.dataset.projectOutcome = p.outcome || '';
          if (p.is_featured) cb.checked = true;
          const label = document.createElement('div');
          const nameSpan = document.createElement('span');
          nameSpan.className = 'project-check-name';
          nameSpan.textContent = p.name;
          label.appendChild(nameSpan);
          if (p.technologies && p.technologies.length) {
            label.appendChild(document.createElement('br'));
            const techSpan = document.createElement('span');
            techSpan.className = 'project-check-tech';
            techSpan.textContent = p.technologies.join(', ');
            label.appendChild(techSpan);
          }
          div.appendChild(cb);
          div.appendChild(label);
          checkboxes.appendChild(div);
        });
      }

      // Check for duplicate proposals
      const recentUrls = bootstrap.recentProposalUrls || [];
      const currentUrl = jobData.url || '';
      if (recentUrls.some(url => url && currentUrl.includes(url.replace(/.*~/, '~')))) {
        document.getElementById('duplicate-warning').classList.remove('hidden');
      }
    }

    // Calculate and show Job Fit Score + Bid Guidance
    const fitScore = calculateFitScore(jobData.skills || [], _profileSkills);
    showFitScore(fitScore);
    showBidGuidance(fitScore, vetting.overall);

    // Enable generate button
    if (jobData.title || jobData.description) {
      btnGenerate.disabled = false;
      btnAbTest.disabled = false;
    } else {
      statusText.textContent = 'Page loaded but no job data found. The selectors may need updating.';
    }

    // Restore previously generated proposal for this job URL (if any)
    try {
      const cached = await new Promise((resolve) => {
        chrome.storage.local.get(['lastProposal'], (r) => resolve(r.lastProposal));
      });
      if (cached && cached.jobUrl === jobData.url) {
        _generatedProposal = cached;
        showProposalPreview(cached);
        // Restore persisted Loom URL into the input field
        if (loomUrlInput && cached.loomUrl) {
          loomUrlInput.value = cached.loomUrl;
        }
      }
    } catch (e) {
      // ignore — no cached proposal
    }
  } catch (err) {
    statusText.textContent = 'Content script not loaded. Please reload the Upwork page.';
    console.error('[Popup] init error:', err);
  }
}

async function loadBootstrapData() {
  try {
    let data = await getBootstrapCache();
    if (data) return data;

    const res = await apiFetch('/api/v1/bootstrap');
    if (res.ok) {
      data = await res.json();
      setBootstrapCache(data);
      return data;
    }
  } catch (e) {
    console.warn('[Popup] Bootstrap fetch failed:', e);
  }
  return null;
}

// ---- Loom URL helpers ----

/**
 * Read, trim and validate the Loom URL input.
 * Returns the trimmed URL string (or null if empty).
 * Alerts the user when the value looks invalid but lets them continue.
 * @returns {string|null}
 */
function readLoomUrl() {
  const raw = (loomUrlInput?.value || '').trim();
  if (!raw) return null;
  const valid = raw.startsWith('https://www.loom.com/share/') ||
                raw.startsWith('https://loom.com/share/');
  if (!valid) {
    const proceed = confirm(
      `The Loom URL doesn't look right:\n"${raw}"\n\n` +
      'Expected format: https://www.loom.com/share/...\n\n' +
      'Continue anyway?'
    );
    if (!proceed) return undefined; // sentinel: user cancelled
  }
  return raw;
}

// ---- Event listeners ----

// Generate Proposal
btnGenerate.addEventListener('click', async () => {
  if (!_currentJobData) return;

  const loomUrl = readLoomUrl();
  if (loomUrl === undefined) return; // user cancelled the invalid-URL dialog

  // Regular generation — clear any stale A/B tracking state
  _chosenVariant = null;
  _chosenProposalId = null;

  btnGenerate.disabled = true;
  loadingSpinner.classList.remove('hidden');
  proposalPreview.classList.add('hidden');

  try {
    // Get selected template content (if any)
    const selectedOpt = templateDropdown.options[templateDropdown.selectedIndex];
    const templateContent = selectedOpt && selectedOpt.dataset.content ? selectedOpt.dataset.content : null;

    // Get selected projects
    const selectedProjects = [];
    document.querySelectorAll('#project-checkboxes input:checked').forEach(cb => {
      selectedProjects.push({
        name: cb.dataset.projectName,
        description: cb.dataset.projectDesc,
        technologies: cb.dataset.projectTech,
        outcome: cb.dataset.projectOutcome
      });
    });

    const response = await sendToBackground({
      type: 'GENERATE_PROPOSAL',
      jobData: _currentJobData,
      templateContent: templateContent,
      selectedProjects: selectedProjects.length > 0 ? selectedProjects : null,
      loomUrl: loomUrl
    });

    if (!response || !response.success) {
      alert(`Error: ${(response && response.error) || 'Unknown error from backend'}`);
    } else {
      showProposalPreview(response.data);
      // Reflect persisted loomUrl back from response if available
      if (loomUrlInput && response.data.loomUrl != null) {
        loomUrlInput.value = response.data.loomUrl;
      }
      const toCache = Object.assign({}, response.data, { jobUrl: _currentJobData.url });
      chrome.storage.local.set({ lastProposal: toCache });
    }
  } catch (err) {
    alert(`Failed to generate proposal: ${err.message}`);
  } finally {
    loadingSpinner.classList.add('hidden');
    btnGenerate.disabled = false;
  }
});

// Regenerate Proposal
btnRegenerate.addEventListener('click', async () => {
  if (!_currentJobData) return;

  // Preserve current loomUrl value across regeneration — do not clear it
  const loomUrl = readLoomUrl();
  if (loomUrl === undefined) return; // user cancelled the invalid-URL dialog

  // Clear cached proposal
  chrome.storage.local.remove('lastProposal');
  _generatedProposal = null;
  proposalPreview.classList.add('hidden');

  // Trigger generation (same as Generate button)
  btnGenerate.disabled = true;
  loadingSpinner.classList.remove('hidden');

  try {
    // Get selected template content (if any)
    const selectedOpt = templateDropdown.options[templateDropdown.selectedIndex];
    const templateContent = selectedOpt && selectedOpt.dataset.content ? selectedOpt.dataset.content : null;

    // Get selected projects
    const selectedProjects = [];
    document.querySelectorAll('#project-checkboxes input:checked').forEach(cb => {
      selectedProjects.push({
        name: cb.dataset.projectName,
        description: cb.dataset.projectDesc,
        technologies: cb.dataset.projectTech,
        outcome: cb.dataset.projectOutcome
      });
    });

    const response = await sendToBackground({
      type: 'GENERATE_PROPOSAL',
      jobData: _currentJobData,
      templateContent: templateContent,
      selectedProjects: selectedProjects.length > 0 ? selectedProjects : null,
      loomUrl: loomUrl
    });

    if (!response || !response.success) {
      alert(`Error: ${(response && response.error) || 'Unknown error from backend'}`);
    } else {
      showProposalPreview(response.data);
      // Reflect persisted loomUrl back from response if available
      if (loomUrlInput && response.data.loomUrl != null) {
        loomUrlInput.value = response.data.loomUrl;
      }
      const toCache = Object.assign({}, response.data, { jobUrl: _currentJobData.url });
      chrome.storage.local.set({ lastProposal: toCache });
    }
  } catch (err) {
    alert(`Failed to generate proposal: ${err.message}`);
  } finally {
    loadingSpinner.classList.add('hidden');
    btnGenerate.disabled = false;
  }
});

// Auto-fill Form
btnAutofill.addEventListener('click', async () => {
  if (!_generatedProposal || !_activeTabId) return;

  // Phase 2 Pre-flight — block autofill on any block-severity gate unless user explicitly overrides.
  const preflight = _generatedProposal.preflight;
  if (preflight && preflight.blockedSubmit) {
    const overrideCb = document.getElementById('pf-override');
    if (!overrideCb || !overrideCb.checked) {
      alert(
        'Pre-flight checklist has blocking issues. Tick the "Override" box below the checklist to submit anyway, ' +
        'or regenerate / edit the proposal first.'
      );
      return;
    }
    console.log('[preflight] override applied; submitting with blockers:', preflight.gates.filter(g => !g.passed && g.severity === 'block'));
  }

  // Phase 1 Hook Surgeon — secondary check: hook-only blockers (in case preflight missed)
  const validation = _generatedProposal.hookValidation;
  if (validation && validation.hasBlocker && (!preflight || !preflight.blockedSubmit)) {
    const proceed = confirm(
      'Hook validation found blocking issues in the first 230 chars:\n\n' +
      (validation.failureSummary || 'Banned phrases or generic opener detected.') +
      '\n\nSubmit anyway? (Recommended: regenerate or edit the opening first.)'
    );
    if (!proceed) return;
  }

  try {
    const response = await sendToContent(_activeTabId, {
      type: 'AUTOFILL_PROPOSAL',
      data: {
        coverLetter: _generatedProposal.coverLetter,
        hourlyRate: _generatedProposal.hourlyRate,
        milestones: _generatedProposal.milestones || []
      }
    });

    if (response && response.success) {
      const results = response.data;
      const messages = [];
      if (results.coverLetter) messages.push(results.coverLetter.message);
      if (results.hourlyRate)   messages.push(results.hourlyRate.message);
      if (messages.length) alert(messages.join('\n'));

      // A/B tracking: mark the chosen variant row so the learning loop knows which won
      if (_chosenVariant && _chosenProposalId) {
        try {
          await apiFetch('/api/v1/proposals/' + _chosenProposalId, {
            method: 'PATCH',
            body: JSON.stringify({ variantChosen: _chosenVariant })
          });
        } catch (patchErr) {
          // Non-fatal — tracking failure must not block the user
          console.warn('[A/B tracking] Failed to mark chosen variant:', patchErr.message);
        }
      }
    } else {
      alert(`Auto-fill failed: ${(response && response.error) || 'Unknown error'}`);
    }
  } catch (err) {
    alert(`Auto-fill error: ${err.message}`);
  }
});

// Copy to Clipboard
btnCopy.addEventListener('click', async () => {
  const text = coverLetterText.value;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    flashCopyButton();
  } catch (err) {
    // Fallback: select the textarea and copy
    coverLetterText.select();
    document.execCommand('copy');
    flashCopyButton();
  }
});

// Open Options Page
btnOpenOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

linkSettings.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Dashboard link — load from settings
linkDashboard.addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    const response = await sendToBackground({ type: 'GET_SETTINGS' });
    const backendUrl = (response && response.data && response.data.backendUrl) || 'http://localhost:3002';
    chrome.tabs.create({ url: `${backendUrl}/dashboard` });
  } catch {
    chrome.tabs.create({ url: 'http://localhost:3002/dashboard' });
  }
});

// ---- Boot ----
// A/B Test
btnAbTest.addEventListener('click', async () => {
  if (!_currentJobData) return;

  const loomUrl = readLoomUrl();
  if (loomUrl === undefined) return; // user cancelled the invalid-URL dialog

  // Reset A/B tracking state for this new run
  _chosenVariant = null;
  _chosenProposalId = null;

  btnAbTest.disabled = true;
  btnGenerate.disabled = true;
  loadingSpinner.classList.remove('hidden');
  proposalPreview.classList.add('hidden');
  abComparison.classList.add('hidden');

  try {
    const selectedOpt = templateDropdown.options[templateDropdown.selectedIndex];
    const templateContent = selectedOpt && selectedOpt.dataset.content ? selectedOpt.dataset.content : null;

    const res = await apiFetch('/api/v1/generate-proposal/ab', {
      method: 'POST',
      body: JSON.stringify({
        jobData: _currentJobData,
        templateContent: templateContent,
        loomUrl: loomUrl
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      alert('A/B Test Error: ' + errText);
      return;
    }

    const data = await res.json();

    // Show comparison UI
    document.getElementById('ab-style-a').textContent = data.variantA.style;
    document.getElementById('ab-text-a').textContent = data.variantA.coverLetter;
    document.getElementById('ab-style-b').textContent = data.variantB.style;
    document.getElementById('ab-text-b').textContent = data.variantB.coverLetter;

    abComparison.classList.remove('hidden');

    // Click handlers for variant selection
    const cardA = document.getElementById('ab-variant-a');
    const cardB = document.getElementById('ab-variant-b');

    function selectVariant(variant) {
      const chosen = variant === 'A' ? data.variantA : data.variantB;
      cardA.classList.toggle('ab-selected', variant === 'A');
      cardB.classList.toggle('ab-selected', variant === 'B');

      // Track which variant the user picked so btnAutofill can PATCH the chosen row
      _chosenVariant = variant;
      _chosenProposalId = chosen.proposalId || null;

      // Show the selected variant in the proposal preview
      showProposalPreview(chosen);
      const toCache = Object.assign({}, chosen, { jobUrl: _currentJobData.url, abVariant: variant });
      chrome.storage.local.set({ lastProposal: toCache });
    }

    // Remove old listeners by cloning
    const newCardA = cardA.cloneNode(true);
    const newCardB = cardB.cloneNode(true);
    cardA.parentNode.replaceChild(newCardA, cardA);
    cardB.parentNode.replaceChild(newCardB, cardB);
    newCardA.addEventListener('click', () => selectVariant('A'));
    newCardB.addEventListener('click', () => selectVariant('B'));

  } catch (err) {
    alert('A/B Test failed: ' + err.message);
  } finally {
    loadingSpinner.classList.add('hidden');
    btnAbTest.disabled = false;
    btnGenerate.disabled = false;
  }
});

// Analyze Proposal
document.getElementById('btn-analyze').addEventListener('click', async () => {
  if (!_generatedProposal || !_currentJobData) return;

  const btn = document.getElementById('btn-analyze');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';

  try {
    const response = await sendToBackground({
      type: 'ANALYZE_PROPOSAL',
      coverLetter: _generatedProposal.coverLetter,
      jobTitle: _currentJobData.title,
      jobDescription: _currentJobData.description,
      jobSkills: _currentJobData.skills || []
    });

    if (!response || !response.success) {
      alert('Analysis failed: ' + ((response && response.error) || 'Unknown error'));
      return;
    }

    const a = response.data;
    const panel = document.getElementById('analysis-panel');

    // Overall score
    const scoreEl = document.getElementById('analysis-score');
    scoreEl.textContent = a.score;
    scoreEl.className = 'analysis-score ' + (a.score >= 80 ? 'score-high' : a.score >= 60 ? 'score-med' : 'score-low');

    // First 230 characters
    if (a.first230) {
      document.getElementById('analysis-first230-text').textContent = a.first230.text || _generatedProposal.coverLetter.substring(0, 230);
      const f230Score = document.getElementById('analysis-first230-score');
      f230Score.textContent = a.first230.score;
      f230Score.className = 'analysis-mini-score ' + (a.first230.score >= 80 ? 'score-high' : a.first230.score >= 60 ? 'score-med' : 'score-low');
      document.getElementById('analysis-first230-feedback').textContent = a.first230.feedback || '';

      if (a.first230.suggestion) {
        const sugSection = document.getElementById('analysis-first230-suggestion');
        sugSection.classList.remove('hidden');
        document.getElementById('analysis-suggestion-text').textContent = a.first230.suggestion;

        // Wire up Apply Suggestion button
        const applyBtn = document.getElementById('btn-apply-suggestion');
        const newApplyBtn = applyBtn.cloneNode(true);
        applyBtn.parentNode.replaceChild(newApplyBtn, applyBtn);
        newApplyBtn.addEventListener('click', () => {
          const current = coverLetterText.value;
          const newText = a.first230.suggestion + current.substring(230);
          coverLetterText.value = newText;
          _generatedProposal.coverLetter = newText;
          chrome.storage.local.set({ lastProposal: Object.assign({}, _generatedProposal, { jobUrl: _currentJobData.url }) });
          showQualityIndicators(newText);
          newApplyBtn.textContent = 'Applied!';
          newApplyBtn.disabled = true;
        });
      }
    }

    // Relevance
    if (a.relevance) {
      const relScore = document.getElementById('analysis-relevance-score');
      relScore.textContent = a.relevance.score;
      relScore.className = 'analysis-mini-score ' + (a.relevance.score >= 80 ? 'score-high' : a.relevance.score >= 60 ? 'score-med' : 'score-low');
      document.getElementById('analysis-relevance-feedback').textContent = a.relevance.feedback || '';

      const skillsEl = document.getElementById('analysis-skills');
      skillsEl.innerHTML = '';
      (a.relevance.matchedSkills || []).forEach(s => {
        skillsEl.innerHTML += '<span class="analysis-skill-matched">' + s + '</span>';
      });
      (a.relevance.missedSkills || []).forEach(s => {
        skillsEl.innerHTML += '<span class="analysis-skill-missed">' + s + '</span>';
      });
    }

    // Clarity
    if (a.clarity) {
      const clScore = document.getElementById('analysis-clarity-score');
      clScore.textContent = a.clarity.score;
      clScore.className = 'analysis-mini-score ' + (a.clarity.score >= 80 ? 'score-high' : a.clarity.score >= 60 ? 'score-med' : 'score-low');
      document.getElementById('analysis-clarity-feedback').textContent = a.clarity.feedback || '';
    }

    // Tone
    if (a.tone) {
      const toneScore = document.getElementById('analysis-tone-score');
      toneScore.textContent = a.tone.score;
      toneScore.className = 'analysis-mini-score ' + (a.tone.score >= 80 ? 'score-high' : a.tone.score >= 60 ? 'score-med' : 'score-low');
      document.getElementById('analysis-tone-feedback').textContent = a.tone.feedback || '';
    }

    // Improvements
    if (a.improvements && a.improvements.length > 0) {
      const impEl = document.getElementById('analysis-improvements');
      impEl.textContent = '';
      const heading = document.createElement('strong');
      heading.style.fontSize = '11px';
      heading.style.color = '#6b7280';
      heading.textContent = 'Improvements:';
      const ol = document.createElement('ol');
      a.improvements.forEach(function (item) {
        const li = document.createElement('li');
        li.textContent = item;
        ol.appendChild(li);
      });
      impEl.appendChild(heading);
      impEl.appendChild(ol);
    }

    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    alert('Analysis error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze';
  }
});

// Quick-Edit Toolbar
document.querySelectorAll('.qe-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!_currentJobData || !_generatedProposal) return;

    const instruction = btn.dataset.instruction;
    btn.disabled = true;
    loadingSpinner.classList.remove('hidden');

    try {
      const response = await sendToBackground({
        type: 'GENERATE_PROPOSAL',
        jobData: _currentJobData,
        extraInstruction: instruction,
        existingProposal: _generatedProposal.coverLetter
      });

      if (response && response.success) {
        showProposalPreview(response.data);
        const toCache = Object.assign({}, response.data, { jobUrl: _currentJobData.url });
        chrome.storage.local.set({ lastProposal: toCache });
      }
    } catch (err) {
      console.error('[Popup] Quick-edit error:', err);
    } finally {
      btn.disabled = false;
      loadingSpinner.classList.add('hidden');
    }
  });
});

// ---- Phase 2: AI-generic rewrite-apply handler ----

const btnAgRewrite = document.getElementById('btn-ag-rewrite');
if (btnAgRewrite) {
  btnAgRewrite.addEventListener('click', () => {
    if (!_generatedProposal || !_generatedProposal.aiGeneric || !_generatedProposal.aiGeneric.rewriteSuggestion) return;
    const newText = _generatedProposal.aiGeneric.rewriteSuggestion;
    coverLetterText.value = newText;
    _generatedProposal.coverLetter = newText;
    showQualityIndicators(newText);
    // Hide the AI-generic panel after applying — assume the rewrite resolved the warning.
    document.getElementById('ai-generic').classList.add('hidden');
  });
}

// ---- Phase 4: Follow-up scheduler button listeners ----
document.querySelectorAll('#fu-actions .fu-btn').forEach((btn) => {
  btn.addEventListener('click', () => handleFollowUpClick(btn));
});

// ---- Listen for LOOM_RECORDED messages from the record page ----
// Note: this listener only fires while the popup is open. If the user closes the popup
// before the recording finishes the message is silently dropped — the recording page's
// own success screen displays the URL so the user can paste it manually (v1 trade-off).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'LOOM_RECORDED' && typeof msg.url === 'string') {
    if (loomUrlInput) {
      loomUrlInput.value = msg.url;
      loomUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
      loomUrlInput.classList.add('loom-just-recorded');
      setTimeout(() => loomUrlInput.classList.remove('loom-just-recorded'), 2500);
    }
    sendResponse({ ok: true });
  }
  return true;
});

// ---- Boot ----
document.addEventListener('DOMContentLoaded', init);
