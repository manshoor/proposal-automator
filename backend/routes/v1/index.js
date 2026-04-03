import { Router } from 'express';
import generateProposalRouter from '../../api/generate-proposal.js';
import generateMessageRouter from '../../api/generate-message.js';
import profileRouter from '../../api/profile.js';
import proposalsRouter from '../../api/proposals.js';
import templatesRouter from '../../api/templates.js';
import analyticsRouter from '../../api/analytics.js';
import parseResumeRouter from '../../api/parse-resume.js';
import settingsRouter from '../../api/settings.js';
import projectsRouter from '../../api/projects.js';
import parseProjectsRouter from '../../api/parse-projects.js';
import uploadRouter from '../../api/upload.js';
import promptsRouter from '../../api/prompts.js';
import analyzeProposalRouter from '../../api/analyze-proposal.js';
import analyzeProfileRouter from '../../api/analyze-profile.js';
import generateHooksRouter from '../../api/generate-hooks.js';

const router = Router();

router.use('/generate-proposal', generateProposalRouter);
router.use('/generate-message', generateMessageRouter);
router.use('/profile', profileRouter);
router.use('/proposals', proposalsRouter);
router.use('/templates', templatesRouter);
router.use('/analytics', analyticsRouter);
router.use('/parse-resume', parseResumeRouter);
router.use('/settings', settingsRouter);
router.use('/projects', projectsRouter);
router.use('/parse-projects', parseProjectsRouter);
router.use('/upload', uploadRouter);
router.use('/prompts', promptsRouter);
router.use('/analyze-proposal', analyzeProposalRouter);
router.use('/analyze-profile', analyzeProfileRouter);
router.use('/generate-hooks', generateHooksRouter);

export default router;
