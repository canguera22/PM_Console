export const PROJECT_TASK_MODULES = [
  'meeting_intelligence',
  'product_documentation',
  'release_communications',
  'prioritization',
] as const;

export type ProjectTaskModule = typeof PROJECT_TASK_MODULES[number];
export type ProjectTaskStatus = 'open' | 'completed' | 'archived';

export const PROJECT_TASK_MODULE_LABELS: Record<ProjectTaskModule, string> = {
  meeting_intelligence: 'Meeting Intelligence',
  product_documentation: 'Product Documentation',
  release_communications: 'Release Communications',
  prioritization: 'Backlog Prioritization',
};

export interface ProjectTask {
  id: string;
  created_at: string;
  updated_at: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  related_module: ProjectTaskModule | null;
  status: ProjectTaskStatus;
  completed_at: string | null;
  completed_artifact_id?: string | null;
  completed_artifact_type?: ProjectTaskModule | null;
  created_by_user_id?: string | null;
  created_by_email?: string | null;
  updated_by_user_id?: string | null;
  updated_by_email?: string | null;
}

export interface CreateProjectTaskInput {
  project_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  related_module?: ProjectTaskModule | null;
}

export interface UpdateProjectTaskInput {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  related_module?: ProjectTaskModule | null;
  status?: ProjectTaskStatus;
  completed_at?: string | null;
  completed_artifact_id?: string | null;
  completed_artifact_type?: ProjectTaskModule | null;
}
