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
const dotCompetition      = document.getElementById('dot-competition');
const msgLocation         = document.getElementById('msg-location');
const msgSpending         = document.getElementById('msg-spending');
const msgHireRate         = document.getElementById('msg-hirerate');
const msgReviews          = document.getElementById('msg-reviews');
const msgCompetition      = document.getElementById('msg-competition');

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
  const { overall, locationCheck, spendingCheck, hireRateCheck, reviewsCheck, proposalCompetition } = vetting;

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

  setDotClass(dotCompetition, competitionToDotClass(proposalCompetition.level));
  msgCompetition.textContent = proposalCompetition.message;

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
      li.innerHTML = `<span class="rf-severity rf-${flag.severity}"></span><span class="rf-text"><span class="rf-flag-name">${flag.flag}</span> — <span class="rf-detail">${flag.detail}</span></span>`;
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

  showQualityIndicators(proposal.coverLetter);

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

async function init() {
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

  // Load vetting data (which also loads job data)
  try {
    const response = await sendToContent(_activeTabId, { type: 'GET_VETTING' });

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

    // Fetch profile skills for fit score
    try {
      const profileRes = await apiFetch('/api/v1/profile');
      if (profileRes.ok) {
        const profile = await profileRes.json();
        _profileSkills = Array.isArray(profile.skills) ? profile.skills : [];
      }
    } catch (e) { /* ignore */ }

    // Calculate and show Job Fit Score + Bid Guidance
    const fitScore = calculateFitScore(jobData.skills || [], _profileSkills);
    showFitScore(fitScore);
    showBidGuidance(fitScore, vetting.overall);

    // Enable generate button — even with partial data, the LLM can work with what we have
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
      }
    } catch (e) {
      // ignore — no cached proposal
    }

    // Load templates for the dropdown
    try {
      const res = await apiFetch('/api/v1/templates');
      if (res.ok) {
        const templates = await res.json();
        if (Array.isArray(templates) && templates.length > 0) {
          templateSelector.classList.remove('hidden');
          templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            opt.dataset.content = t.content;
            templateDropdown.appendChild(opt);
          });
        }
      }
    } catch (e) {
      // ignore — templates are optional
    }

    // Load projects for selection
    try {
      const pRes = await apiFetch('/api/v1/projects');
      if (pRes.ok) {
        const projects = await pRes.json();
        if (Array.isArray(projects) && projects.length > 0) {
          const container = document.getElementById('project-selector');
          const checkboxes = document.getElementById('project-checkboxes');
          container.classList.remove('hidden');

          // "Select All" toggle
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
            if (p.is_featured) cb.checked = true; // auto-select featured
            const label = document.createElement('div');
            label.innerHTML = '<span class="project-check-name">' + p.name + '</span>' +
              (p.technologies && p.technologies.length ? '<br><span class="project-check-tech">' + p.technologies.join(', ') + '</span>' : '');
            div.appendChild(cb);
            div.appendChild(label);
            checkboxes.appendChild(div);
          });
        }
      }
    } catch (e) { /* ignore */ }

    // Check for duplicate proposals (already submitted to this job)
    try {
      const pRes = await apiFetch('/api/v1/proposals?limit=100');
      if (pRes.ok) {
        const proposals = await pRes.json();
        if (Array.isArray(proposals)) {
          const currentUrl = jobData.url || '';
          const match = proposals.find(p => p.job_url && currentUrl.includes(p.job_url.replace(/.*~/, '~')));
          if (match) {
            document.getElementById('duplicate-warning').classList.remove('hidden');
          }
        }
      }
    } catch (e) {
      // ignore
    }
  } catch (err) {
    statusText.textContent = 'Content script not loaded. Please reload the Upwork page.';
    console.error('[Popup] init error:', err);
  }
}

// ---- Event listeners ----

// Generate Proposal
btnGenerate.addEventListener('click', async () => {
  if (!_currentJobData) return;

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
      selectedProjects: selectedProjects.length > 0 ? selectedProjects : null
    });

    if (!response || !response.success) {
      alert(`Error: ${(response && response.error) || 'Unknown error from backend'}`);
    } else {
      showProposalPreview(response.data);
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

  // Clear cached proposal
  chrome.storage.local.remove('lastProposal');
  _generatedProposal = null;
  proposalPreview.classList.add('hidden');

  // Trigger generation (same as Generate button)
  btnGenerate.disabled = true;
  loadingSpinner.classList.remove('hidden');

  try {
    const response = await sendToBackground({
      type: 'GENERATE_PROPOSAL',
      jobData: _currentJobData
    });

    if (!response || !response.success) {
      alert(`Error: ${(response && response.error) || 'Unknown error from backend'}`);
    } else {
      showProposalPreview(response.data);
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
        templateContent: templateContent
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
      impEl.innerHTML = '<strong style="font-size:11px;color:#6b7280;">Improvements:</strong><ol>' +
        a.improvements.map(i => '<li>' + i + '</li>').join('') + '</ol>';
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

// ---- Boot ----
document.addEventListener('DOMContentLoaded', init);
