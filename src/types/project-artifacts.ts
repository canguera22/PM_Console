export interface ProjectArtifact {
  id: string;
  created_at: string;
  updated_at?: string;
  project_id: string;
  project_name: string;
  artifact_type: string;
  artifact_name: string | null;
  input_data: Record<string, unknown> | null;
  output_data: string | null;
  metadata: Record<string, unknown> | null;
  advisor_feedback: string | null;
  advisor_reviewed_at: string | null;
  status: 'active' | 'archived' | 'deleted';
}

