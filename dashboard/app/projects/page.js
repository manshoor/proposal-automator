import { serverFetch } from '../../lib/server-api';
import { requireSession } from '../../lib/session';
import ProjectsClient from './projects-client';

export default async function ProjectsPage() {
  await requireSession();
  const projects = await serverFetch('/projects').catch(() => []);
  return <ProjectsClient initialProjects={Array.isArray(projects) ? projects : []} />;
}
