/**
 * autofill.js
 * Fills in the Upwork proposal form fields using React-compatible value setting.
 * Handles: cover letter, hourly rate, milestone mode selection, and milestone fields.
 */

/**
 * Set a value on an input/textarea in a React-compatible way.
 * Uses the native prototype value setter to bypass React's controlled component.
 */
function setNativeValue(element, value) {
  var setter = null;

  if (element.tagName === 'TEXTAREA') {
    setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  }
  if (!setter || !setter.set) {
    setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  }

  if (setter && setter.set) {
    setter.set.call(element, value);
  } else {
    element.value = value;
  }

  // Dispatch all events React might listen to
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Most reliable React-compatible value setter.
 * Uses execCommand('insertText') which simulates real keyboard input
 * and is recognized by React's event system at the fiber level.
 */
function forceSetValue(element, value) {
  element.focus();
  element.dispatchEvent(new Event('focus', { bubbles: true }));

  // Select all existing content then replace with insertText
  element.select ? element.select() : document.execCommand('selectAll');

  // execCommand('insertText') triggers React's onChange via the browser's native input path
  var inserted = document.execCommand('insertText', false, value);

  if (!inserted || element.value !== value) {
    // Fallback: native setter approach
    setNativeValue(element, value);
  }

  if (element.value !== value) {
    // Last resort: direct assignment + full event dispatch
    element.value = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Click an element in a React-compatible way.
 */
function clickElement(el) {
  if (!el) return;
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function findField(selectors) {
  for (var i = 0; i < selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
    if (el) return el;
  }
  return null;
}

function waitMs(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

/**
 * Fill the cover letter textarea.
 */
function fillCoverLetter(text) {
  var field = findField(SELECTORS.coverLetterField);
  if (!field) {
    return { success: false, message: 'Cover letter field not found.' };
  }
  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  forceSetValue(field, text);
  return { success: true, message: 'Cover letter filled.' };
}

/**
 * Fill the hourly rate input.
 */
function fillHourlyRate(rate) {
  if (rate === null || rate === undefined || rate === '') {
    return { success: false, message: 'No hourly rate provided.' };
  }
  var field = findField(SELECTORS.hourlyRateField);
  if (!field) {
    return { success: false, message: 'Hourly rate field not found (may be fixed-price).' };
  }
  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  forceSetValue(field, String(rate));
  return { success: true, message: 'Hourly rate set to $' + rate + '.' };
}

/**
 * Select "By milestone" radio button.
 */
function selectMilestoneMode() {
  var radio = document.querySelector('input[name="milestoneMode"][value="milestone"]');
  if (!radio) return { success: false, message: 'Milestone radio not found.' };

  if (!radio.checked) {
    var label = radio.closest('label');
    if (label) {
      clickElement(label);
    } else {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  return { success: true, message: 'Selected "By milestone" mode.' };
}

/**
 * Fill milestone fields on the proposal page.
 */
async function fillMilestones(milestones) {
  if (!milestones || milestones.length === 0) {
    return { success: false, message: 'No milestones to fill.' };
  }

  var modeResult = selectMilestoneMode();
  if (!modeResult.success) return modeResult;

  await waitMs(1000);

  var results = [];

  for (var i = 0; i < milestones.length; i++) {
    var milestone = milestones[i];

    // Add more milestone rows if needed
    var existingRows = document.querySelectorAll('[data-test="milestone"]');
    if (i >= existingRows.length) {
      var addBtn = document.querySelector('button.milestone-add');
      if (addBtn) {
        clickElement(addBtn);
        await waitMs(700);
      }
    }

    var rows = document.querySelectorAll('[data-test="milestone"]');
    if (i >= rows.length) {
      results.push({ success: false, message: 'Could not create milestone row ' + (i + 1) });
      continue;
    }

    var row = rows[i];
    var descFilled = false;
    var amtFilled = false;

    // Fill description
    var descField = row.querySelector('[data-test="milestone-description"]');
    if (!descField) descField = row.querySelector('input.milestone-description');
    if (!descField) descField = row.querySelector('.up-fe-milestone-description input');
    if (descField) {
      forceSetValue(descField, milestone.description);
      descFilled = (descField.value === milestone.description);
      console.log('[Autofill] Milestone ' + (i+1) + ' desc: "' + milestone.description + '", field value: "' + descField.value + '", success: ' + descFilled);
    } else {
      console.log('[Autofill] Milestone ' + (i+1) + ' desc field NOT FOUND');
    }

    await waitMs(200);

    // Fill amount
    var amountField = row.querySelector('[data-test="currency-input"]');
    if (!amountField) amountField = row.querySelector('[data-test="milestone-amount"] input');
    if (amountField) {
      forceSetValue(amountField, milestone.amount.toFixed(2));
      amtFilled = true;
    }

    results.push({
      success: descFilled && amtFilled,
      message: 'Milestone ' + (i + 1) + ': ' + milestone.description + ' — $' + milestone.amount.toFixed(2)
    });

    await waitMs(300);
  }

  var allSuccess = results.every(function (r) { return r.success; });
  return {
    success: allSuccess,
    message: results.map(function (r) { return r.message; }).join('\n'),
    details: results
  };
}

/**
 * Autofill the Upwork proposal form.
 * Does NOT click submit — autofill only.
 */
async function autofillProposal(options) {
  var opts = options || {};
  var results = {
    coverLetter: { success: false, message: 'No cover letter provided.' },
    hourlyRate: { success: false, message: 'No hourly rate provided.' },
    milestones: { success: false, message: 'No milestones provided.' }
  };

  if (opts.coverLetter) {
    results.coverLetter = fillCoverLetter(opts.coverLetter);
  }

  if (opts.hourlyRate !== undefined && opts.hourlyRate !== null) {
    results.hourlyRate = fillHourlyRate(opts.hourlyRate);
  }

  if (opts.milestones && opts.milestones.length > 0) {
    results.milestones = await fillMilestones(opts.milestones);
  }

  return results;
}
