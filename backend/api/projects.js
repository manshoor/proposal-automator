import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as projectService from '../services/project.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const projects = await projectService.listProjects(req.query, req.user.id);
  res.json(projects);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const project = await projectService.getProject(req.params.id, req.user.id);
  res.json(project);
}));

router.post('/', asyncHandler(async (req, res) => {
  const project = await projectService.createProject(req.body, req.user.id);
  res.status(201).json(project);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const project = await projectService.updateProject(req.params.id, req.body, req.user.id);
  res.json(project);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await projectService.deleteProject(req.params.id, req.user.id);
  res.json(result);
}));

export default router;
