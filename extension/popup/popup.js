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

const btnOpenOptions  = document.getElementById('btn-open-options');
const linkSettings    = document.getElementById('link-settings');
const linkDashboard   = document.getElementById('link-dashboard');

// ---- State ----
let _currentJobData  = null;
let _currentVetting  = null;
let _activeTabId     = null;
let _generatedProposal = null;

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

    // Enable generate button — even with partial data, the LLM can work with what we have
    if (jobData.title || jobData.description) {
      btnGenerate.disabled = false;
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
      const settings = await sendToBackground({ type: 'GET_SETTINGS' });
      const backendUrl = (settings && settings.data && settings.data.backendUrl) || 'http://localhost:3002';
      const res = await fetch(`${backendUrl}/api/templates`);
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

    // Check for duplicate proposals (already submitted to this job)
    try {
      const settings2 = await sendToBackground({ type: 'GET_SETTINGS' });
      const backendUrl2 = (settings2 && settings2.data && settings2.data.backendUrl) || 'http://localhost:3002';
      const pRes = await fetch(`${backendUrl2}/api/proposals?limit=100`);
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

    const response = await sendToBackground({
      type: 'GENERATE_PROPOSAL',
      jobData: _currentJobData,
      templateContent: templateContent
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
document.addEventListener('DOMContentLoaded', init);
