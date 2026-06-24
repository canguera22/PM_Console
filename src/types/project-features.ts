import type { ProjectArtifact } from '@/types/project-artifacts';

export type ProjectFeaturePriority = 'low' | 'medium' | 'high';
export type ProjectFeatureStatus = 'active' | 'archived' | 'deleted';
export type FeatureLinkRole = 'source' | 'reference' | 'background';

export interface ProjectFeature {
  id: string;
  created_at: string;
  updated_at: string;
  project_id: string;
  name: string;
  description: string | null;
  priority: ProjectFeaturePriority;
  status: ProjectFeatureStatus;
  created_by_user_id?: string | null;
  created_by_email?: string | null;
  updated_by_user_id?: string | null;
  updated_by_email?: string | null;
}

export interface CreateProjectFeatureInput {
  project_id: string;
  name: string;
  description?: string | null;
  priority?: ProjectFeaturePriority;
}

export interface UpdateProjectFeatureInput {
  name?: string;
  description?: string | null;
  priority?: ProjectFeaturePriority;
  status?: ProjectFeatureStatus;
}

export interface ProjectContextDocument {
  id: string;
  project_id: string;
  name: string;
  doc_type?: string | null;
  document_type?: string | null;
  storage_path?: string | null;
  extracted_text?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  status: 'active' | 'archived' | 'deleted';
}

export interface FeatureArtifactLink {
  feature_id: string;
  artifact_id: string;
  project_id: string;
  role: FeatureLinkRole;
  created_at: string;
  artifact?: ProjectArtifact | null;
}

export interface FeatureDocumentLink {
  feature_id: string;
  document_id: string;
  project_id: string;
  role: FeatureLinkRole;
  created_at: string;
  document?: ProjectContextDocument | null;
}
