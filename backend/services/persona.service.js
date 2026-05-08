/**
 * Client persona classifier.
 * Rule-based v1 — deterministic. Map a client's signals to one of 5 personas
 * defined in migration 015_learning_coach.sql / client_personas table.
 */

const US_LIKE = /\b(united\s+states|usa|u\.s\.a?\.?|america)\b/i;

/**
 * Classify a client into one of: enterprise-us-high-spend, agency-mid-spend,
 * new-startup, low-budget-shopper, unverified-risky.
 *
 * @param {object} client    - jobData.client: { totalSpent, hireRate, reviewCount, paymentVerified, location }
 * @param {object} job       - jobData (for budget signals)
 * @returns {{ id: string, label: string, confidence: 'low'|'medium'|'high' }}
 */
export function classify(client, job) {
  const c = client || {};
  const j = job || {};

  const spend = num(c.totalSpent, 0);
  const hireRate = num(c.hireRate, 0);
  const reviews = num(c.reviewCount, 0);
  const paymentVerified = !!c.paymentVerified;
  const isUS = typeof c.location === 'string' && US_LIKE.test(c.location);

  const budgetMax = num(j?.budget?.amount ?? j?.budgetAmount ?? j?.budgetMax ?? j?.budget?.max, null);

  // Hard rule: payment unverified or zero reviews on a low-spend client → risky
  if (!paymentVerified && spend < 500) {
    return persona('unverified-risky', 'high');
  }
  if (reviews === 0 && spend < 100) {
    return persona('unverified-risky', 'high');
  }

  // Low-budget shopper: very low budget OR low spend with very low budget
  if (budgetMax !== null && budgetMax > 0 && budgetMax < 200) {
    return persona('low-budget-shopper', 'high');
  }
  if (spend < 200 && hireRate < 30 && reviews < 5) {
    return persona('low-budget-shopper', 'medium');
  }

  // Enterprise US high spend
  if (spend >= 5000 && hireRate >= 40 && paymentVerified && isUS) {
    return persona('enterprise-us-high-spend', 'high');
  }

  // Mid-spend agency
  if (spend >= 1000 && spend < 5000 && hireRate >= 30 && paymentVerified) {
    return persona('agency-mid-spend', 'medium');
  }

  // New startup: verified, lowish spend, possibly new
  if (paymentVerified && spend < 1000 && reviews < 5) {
    return persona('new-startup', 'medium');
  }

  // Fallback: agency-mid-spend if spend is reasonable, else new-startup
  if (spend >= 500) return persona('agency-mid-spend', 'low');
  return persona('new-startup', 'low');
}

function persona(id, confidence) {
  const labels = {
    'enterprise-us-high-spend': 'Enterprise US (high spend)',
    'agency-mid-spend':         'Agency / mid-spend',
    'new-startup':              'New startup / first-timer',
    'low-budget-shopper':       'Low-budget shopper',
    'unverified-risky':         'Unverified / risky',
  };
  return { id, label: labels[id] || id, confidence };
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Derive a coarse "niche" key from job skills + title for pattern bucketing.
 * Falls back to 'general' when nothing useful is found.
 */
export function classifyNiche(jobData) {
  const skills = Array.isArray(jobData?.skills) ? jobData.skills.map((s) => String(s).toLowerCase()) : [];
  const title = (jobData?.title || '').toLowerCase();

  // Top-level niche buckets — chosen for typical Upwork freelancer specializations.
  // Order matters: more specific buckets come first so that e.g. "React Native"
  // matches `mobile` before `web-frontend`'s broader `react` substring match fires.
  const buckets = [
    { id: 'mobile',       match: ['react native', 'ios', 'android', 'flutter', 'mobile app'] },
    { id: 'shopify',      match: ['shopify', 'liquid'] },
    { id: 'wordpress',    match: ['wordpress', 'wp', 'woocommerce', 'elementor'] },
    { id: 'fullstack',    match: ['fullstack', 'full-stack', 'mern', 'mean'] },
    { id: 'data-ml',      match: ['machine learning', 'data science', 'ml', 'pytorch', 'tensorflow', 'nlp', 'llm'] },
    { id: 'devops',       match: ['aws', 'docker', 'kubernetes', 'ci/cd', 'devops', 'terraform'] },
    { id: 'web-frontend', match: ['react', 'vue', 'angular', 'next.js', 'svelte', 'tailwind', 'css', 'frontend'] },
    { id: 'web-backend',  match: ['node', 'express', 'django', 'flask', 'rails', 'laravel', 'php', 'backend', 'api'] },
    { id: 'design',       match: ['figma', 'ui design', 'ux design', 'photoshop'] },
    { id: 'writing',      match: ['copywriting', 'content writing', 'blog', 'seo writing'] },
    { id: 'automation',   match: ['zapier', 'make.com', 'integromat', 'automation', 'no-code'] },
  ];

  for (const b of buckets) {
    for (const m of b.match) {
      if (skills.includes(m) || skills.some((s) => s.includes(m)) || title.includes(m)) {
        return b.id;
      }
    }
  }
  return 'general';
}
