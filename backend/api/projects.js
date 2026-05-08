import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { llmLimiter } from '../middleware/rate-limiter.js';
import { createProjectSchema, updateProjectSchema } from '../schemas/project.schema.js';
import * as projectService from '../services/project.service.js';
import { resolveLLMConfig, callLLM } from '../services/llm.service.js';

const router = Router();

const ENHANCE_PROMPT = (project) => {
  const techs = Array.isArray(project.technologies) ? project.technologies.join(', ') : (project.technologies || '');
  return {
    system: `You are a portfolio copywriter for a freelancer. Enhance project descriptions and outcomes to be compelling and metric-driven. Return ONLY valid JSON: {"outcome": "...", "description": "..."}`,
    user: `Enhance this project's description and outcome.

PROJECT:
- Name: ${project.name || ''}
- Description: ${project.description || 'none provided'}
- Technologies: ${techs || 'none provided'}
- Category: ${project.category || 'none provided'}
- Current outcome: ${project.outcome || 'none provided'}

RULES:
1. OUTCOME: Write a 1-2 sentence outcome with at least one specific metric (% improvement, time saved, users/traffic, revenue impact). If no real metrics are known, use realistic estimates typical for this project type.
2. DESCRIPTION: Write a 2-3 sentence description explaining what was built, the technical challenge, and the business value. Keep existing accurate details.
3. Sound natural and credible — not exaggerated.
4. Focus on business impact, not just technical details.

Return ONLY valid JSON: {"outcome": "...", "description": "..."}`
  };
};

router.get('/', asyncHandler(async (req, res) => {
  const projects = await projectService.listProjects(req.query, req.user.id);
  res.json(projects);
}));

// Bulk enhance must be BEFORE /:id to avoid path collision
router.post('/enhance-all', llmLimiter, asyncHandler(async (req, res) => {
  const projects = await projectService.listProjects({}, req.user.id);
  const weak = projects.filter(p => !p.outcome || p.outcome.length < 30);

  if (weak.length === 0) {
    return res.json({ projects: [], message: 'All projects already have strong outcomes.' });
  }

  const { provider, apiKey } = await resolveLLMConfig(req.body, req.user.id);
  const results = [];

  await Promise.all(weak.map(async (project) => {
    const prompt = ENHANCE_PROMPT(project);
    try {
      const raw = await callLLM({ provider, apiKey, systemPrompt: prompt.system, userPrompt: prompt.user, maxTokens: 512 });
      const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
      const parsed = JSON.parse(cleaned);
      results.push({
        id: project.id,
        name: project.name,
        currentOutcome: project.outcome || '',
        currentDescription: project.description || '',
        enhancedOutcome: parsed.outcome || '',
        enhancedDescription: parsed.description || '',
      });
    } catch (err) {
      req.log?.warn({ err, projectId: project.id }, 'Failed to enhance project');
    }
  }));

  res.json({ projects: results });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const project = await projectService.getProject(req.params.id, req.user.id);
  res.json(project);
}));

router.post('/', validate(createProjectSchema), asyncHandler(async (req, res) => {
  const project = await projectService.createProject(req.body, req.user.id);
  res.status(201).json(project);
}));

router.post('/:id/enhance', llmLimiter, asyncHandler(async (req, res) => {
  const project = await projectService.getProject(req.params.id, req.user.id);
  const { provider, apiKey } = await resolveLLMConfig(req.body, req.user.id);
  const prompt = ENHANCE_PROMPT(project);

  const raw = await callLLM({ provider, apiKey, systemPrompt: prompt.system, userPrompt: prompt.user, maxTokens: 512 });
  const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
  const parsed = JSON.parse(cleaned);

  res.json({ outcome: parsed.outcome || '', description: parsed.description || '' });
}));

router.put('/:id', validate(updateProjectSchema), asyncHandler(async (req, res) => {
  const project = await projectService.updateProject(req.params.id, req.body, req.user.id);
  res.json(project);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await projectService.deleteProject(req.params.id, req.user.id);
  res.json(result);
}));

export default router;
