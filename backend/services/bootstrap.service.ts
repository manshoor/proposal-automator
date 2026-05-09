// @ts-nocheck — TODO: tighten types in a follow-up iter
import { getProfileOrDefault } from './profile.service.js';
import * as templateRepo from '../repositories/template.repository.js';
import * as projectRepo from '../repositories/project.repository.js';
import * as settingsRepo from '../repositories/settings.repository.js';
import * as proposalRepo from '../repositories/proposal.repository.js';
import { cacheGet, cacheSet, cacheDel } from '../lib/redis.js';

const TTL_SECONDS = 600;

/**
 * Compose the bootstrap payload (profile + templates + projects + settings + recent URLs).
 * Cached for 10 minutes per user. Shared between /bootstrap and /popup-init.
 *
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getBootstrap(userId) {
  const cacheKey = `bootstrap:${userId}`;

  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const [profile, templates, projects, settings, recentUrls] = await Promise.all([
    getProfileOrDefault(userId),
    templateRepo.findAll({}, userId),
    projectRepo.findAll({}, userId),
    settingsRepo.findFirst(userId).catch(() => ({})),
    proposalRepo.findRecentUrls(userId, 100),
  ]);

  const result = {
    profile: {
      full_name: profile.full_name,
      title: profile.title,
      summary: profile.summary,
      skills: profile.skills,
      experience: profile.experience,
      portfolio: profile.portfolio,
      default_hourly_rate: profile.default_hourly_rate,
    },
    templates: (templates || []).map(t => ({
      id: t.id, name: t.name, content: t.content, platform: t.platform,
    })),
    projects: (projects || []).map(p => ({
      id: p.id, name: p.name, description: p.description,
      technologies: p.technologies, outcome: p.outcome, is_featured: p.is_featured,
    })),
    settings: {
      notification_enabled: settings.notification_enabled || false,
      notification_interval: settings.notification_interval || 15,
      skills_include: settings.skills_include || [],
      keywords_include: settings.keywords_include || [],
      keywords_exclude: settings.keywords_exclude || [],
      budget_min: settings.budget_min || null,
      budget_max: settings.budget_max || null,
      locations: settings.locations || [],
      min_spent: settings.min_spent || 1000,
      min_hire_rate: settings.min_hire_rate || 30,
      min_reviews: settings.min_reviews || 3,
    },
    recentProposalUrls: recentUrls,
  };

  await cacheSet(cacheKey, JSON.stringify(result), TTL_SECONDS);
  return result;
}

export async function invalidateBootstrap(userId) {
  await cacheDel(`bootstrap:${userId}`);
}