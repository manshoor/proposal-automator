// Allowed client locations for targeting
var ALLOWED_LOCATIONS = [
  // North America
  'United States',
  'Canada',
  // Europe
  'United Kingdom',
  'Germany',
  'France',
  'Netherlands',
  'Switzerland',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Ireland',
  'Belgium',
  'Austria',
  'Luxembourg',
  'Italy',
  'Spain',
  // Middle East
  'United Arab Emirates',
  'Abu Dhabi',
  'Dubai',
  'Saudi Arabia',
  'Qatar',
  'Bahrain',
  'Kuwait',
  'Oman',
  'Israel',
  // Asia-Pacific
  'Singapore',
  'Malaysia',
  'Australia',
  'New Zealand',
  'Japan',
  'South Korea'
];

// Vetting thresholds
var VETTING_THRESHOLDS = {
  minSpent: 1000,
  minHireRate: 30,
  minReviews: 3
};

// Default backend URL
var BACKEND_URL_DEFAULT = 'http://localhost:3002';

// Upwork DOM selectors — verified against live Upwork job detail pages (March 2026)
var SELECTORS = {
  // Job detail page
  jobTitle: [
    'h1.m-0',
    'h1'
  ],
  jobDescription: [
    '[data-test="Description"]',
    'div.break.mt-2',
    '.break.mt-2'
  ],
  // Skills — span badges inside the skills section
  skills: [
    'span.air3-badge.air3-badge-highlight'
  ],
  // Client info — uses data-qa attributes
  clientLocation: [
    '[data-qa="client-location"] > strong'
  ],
  clientLocationFull: [
    '[data-qa="client-location"]'
  ],
  clientSpent: [
    '[data-qa="client-spend"]'
  ],
  clientHires: [
    '[data-qa="client-hires"]'
  ],
  clientMemberSince: [
    '[data-qa="client-contract-date"]'
  ],
  // Client rating
  clientRating: [
    '[data-testid="buyer-rating"]',
    '[data-qa="client-rating"]',
    '.rating .value'
  ],
  // Job activity section
  jobActivity: [
    '.ca-item',
    '[data-test="job-activity"]',
    '.job-activity'
  ],
  // Preferred qualifications
  qualifications: [
    '.qualification',
    '[data-test="qualifications"]',
    '.preferred-qualifications'
  ],
  // Proposal form selectors (for autofill)
  coverLetterField: [
    'textarea.air3-textarea.inner-textarea',
    'textarea[aria-labelledby="cover_letter_label"]',
    'textarea[name="coverLetter"]',
    'textarea.cover-letter',
    '#cover_letter',
    '.cover-letter-area textarea',
    'textarea[aria-label*="cover letter" i]',
    'textarea[aria-label*="proposal" i]',
    'form textarea'
  ],
  hourlyRateField: [
    'input[name="rate"]',
    'input[data-test="bid-amount"]',
    'input[aria-label*="hourly rate" i]',
    'input[aria-label*="bid" i]',
    '.proposal-rate input[type="number"]',
    'input[type="number"]'
  ],
  // Milestone amount field (for fixed-price jobs)
  milestoneAmountField: [
    '[data-test="milestone-amount"] input',
    '[data-test="currency-input"]'
  ]
};

// Hidden instruction detection patterns
var HIDDEN_INSTRUCTION_PATTERNS = [
  /start\s+your\s+(proposal|cover\s*letter|application|response)\s+with\s+["']?(.+?)["']?[.\n]/gi,
  /begin\s+(your|the)\s+(proposal|cover\s*letter|response|message)\s+(with|by)\s+["']?(.+?)["']?[.\n]/gi,
  /mention\s+the\s+word\s+["']?(.+?)["']?/gi,
  /include\s+the\s+(word|phrase|code)\s+["']?(.+?)["']?/gi,
  /say\s+["']?(.+?)["']?\s+(at\s+the\s+beginning|at\s+the\s+start|in\s+your\s+first\s+line)/gi,
  /write\s+["']?(.+?)["']?\s+as\s+(your|the)\s+first\s+(word|line|sentence)/gi,
  /use\s+the\s+(code|keyword|phrase)\s+["']?(.+?)["']?/gi,
  /put\s+["']?(.+?)["']?\s+(in\s+the\s+subject|at\s+the\s+top|at\s+the\s+beginning)/gi,
  /the\s+(secret|magic|hidden)\s+(word|code|phrase)\s+is\s+["']?(.+?)["']?/gi,
  /type\s+["']?(.+?)["']?\s+(at\s+the\s+beginning|first|to\s+prove)/gi
];

// Expose under single namespace to reduce global pollution
// (Globals are preserved for backward compatibility with existing scripts.)
(function () {
  var g = (typeof window !== 'undefined') ? window : self;
  if (!g.__UPA) g.__UPA = {};
  g.__UPA.ALLOWED_LOCATIONS = ALLOWED_LOCATIONS;
  g.__UPA.VETTING_THRESHOLDS = VETTING_THRESHOLDS;
  g.__UPA.BACKEND_URL_DEFAULT = BACKEND_URL_DEFAULT;
  g.__UPA.SELECTORS = SELECTORS;
  g.__UPA.HIDDEN_INSTRUCTION_PATTERNS = HIDDEN_INSTRUCTION_PATTERNS;
})();
