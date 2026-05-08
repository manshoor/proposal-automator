import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import authRouter from '../../api/auth.js';
import adminRouter from '../../api/admin.js';
import bootstrapRouter from '../../api/bootstrap.js';
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
import uploadsLoomRouter from '../../api/uploads-loom.js';
import promptsRouter from '../../api/prompts.js';
import analyzeProposalRouter from '../../api/analyze-proposal.js';
import analyzeProfileRouter from '../../api/analyze-profile.js';
import generateHooksRouter from '../../api/generate-hooks.js';
import jobsRouter from '../../api/jobs.js';
import bannedPhrasesRouter from '../../api/banned-phrases.js';
import followUpsRouter from '../../api/follow-ups.js';
import outcomesRouter from '../../api/outcomes.js';
import insightsRouter from '../../api/insights.js';
import connectsRouter from '../../api/connects.js';
import profileCoachRouter from '../../api/profile-coach.js';
import popupInitRouter from '../../api/popup-init.js';

const router = Router();

// Auth routes (no auth middleware needed)
router.use('/auth', authRouter);

// All other routes require authentication
router.use(authenticate);

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
router.use('/uploads/loom', uploadsLoomRouter);
router.use('/prompts', promptsRouter);
router.use('/analyze-proposal', analyzeProposalRouter);
router.use('/analyze-profile', analyzeProfileRouter);
router.use('/generate-hooks', generateHooksRouter);
router.use('/jobs', jobsRouter);
router.use('/banned-phrases', bannedPhrasesRouter);
router.use('/follow-ups', followUpsRouter);
router.use('/outcomes', outcomesRouter);
router.use('/insights', insightsRouter);
router.use('/connects', connectsRouter);
router.use('/profile-coach', profileCoachRouter);
router.use('/bootstrap', bootstrapRouter);
router.use('/popup-init', popupInitRouter);
router.use('/admin', requireAdmin, adminRouter);

export default router;
