import { supabaseFetch } from './supabase';
import {
  CreateProjectTaskInput,
  ProjectTask,
  ProjectTaskModule,
  UpdateProjectTaskInput,
} from '@/types/project-tasks';

function compareTasks(a: ProjectTask, b: ProjectTask): number {
  if (a.status !== b.status) {
    return a.status === 'open' ? -1 : 1;
  }

  const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) {
    return aDue - bDue;
  }

  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

export async function fetchProjectTasks(projectId: string): Promise<ProjectTask[]> {
  const data = await supabaseFetch<ProjectTask[]>(
    `/project_tasks?project_id=eq.${projectId}&order=updated_at.desc`
  );

  return [...(data ?? [])].sort(compareTasks);
}

export async function createProjectTask(
  input: CreateProjectTaskInput
): Promise<ProjectTask> {
  const response = await supabaseFetch<ProjectTask[]>('/project_tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (!response?.[0]) {
    throw new Error('Failed to create project task');
  }

  return response[0];
}

export async function updateProjectTask(
  taskId: string,
  updates: UpdateProjectTaskInput
): Promise<ProjectTask> {
  const response = await supabaseFetch<ProjectTask[]>(
    `/project_tasks?id=eq.${taskId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );

  if (!response?.[0]) {
    throw new Error('Failed to update project task');
  }

  return response[0];
}

export async function completeMatchingTaskForArtifact(
  projectId: string,
  module: ProjectTaskModule,
  artifactId: string
): Promise<ProjectTask | null> {
  const tasks = await fetchProjectTasks(projectId);
  const match = tasks.find(
    (task) => task.status === 'open' && task.related_module === module
  );

  if (!match) {
    return null;
  }

  return updateProjectTask(match.id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    completed_artifact_id: artifactId,
    completed_artifact_type: module,
  });
}
