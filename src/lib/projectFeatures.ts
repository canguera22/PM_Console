import { supabase } from '@/lib/supabase';
import type {
  CreateProjectFeatureInput,
  FeatureArtifactLink,
  FeatureDocumentLink,
  FeatureLinkRole,
  ProjectContextDocument,
  ProjectFeature,
  UpdateProjectFeatureInput,
} from '@/types/project-features';
import type { ProjectArtifact } from '@/types/project-artifacts';

export async function fetchProjectFeatures(projectId: string): Promise<ProjectFeature[]> {
  const { data, error } = await supabase
    .from('project_features')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ProjectFeature[];
}

export async function fetchProjectFeature(featureId: string): Promise<ProjectFeature | null> {
  const { data, error } = await supabase
    .from('project_features')
    .select('*')
    .eq('id', featureId)
    .maybeSingle();

  if (error) throw error;
  return data as ProjectFeature | null;
}

export async function createProjectFeature(
  input: CreateProjectFeatureInput
): Promise<ProjectFeature> {
  const { data, error } = await supabase
    .from('project_features')
    .insert({
      project_id: input.project_id,
      name: input.name,
      description: input.description ?? null,
      priority: input.priority ?? 'medium',
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;
  return data as ProjectFeature;
}

export async function updateProjectFeature(
  featureId: string,
  updates: UpdateProjectFeatureInput
): Promise<ProjectFeature> {
  const { data, error } = await supabase
    .from('project_features')
    .update(updates)
    .eq('id', featureId)
    .select()
    .single();

  if (error) throw error;
  return data as ProjectFeature;
}

export async function archiveProjectFeature(featureId: string): Promise<void> {
  const { error } = await supabase
    .from('project_features')
    .update({ status: 'archived' })
    .eq('id', featureId);

  if (error) throw error;
}

export async function fetchProjectArtifacts(projectId: string): Promise<ProjectArtifact[]> {
  const { data, error } = await supabase
    .from('project_artifacts')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .not('artifact_type', 'eq', 'pm_advisor_feedback')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ProjectArtifact[];
}

export async function fetchProjectContextDocuments(
  projectId: string
): Promise<ProjectContextDocument[]> {
  const { data, error } = await supabase
    .from('project_documents')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ProjectContextDocument[];
}

export async function fetchFeatureArtifactLinks(
  featureId: string
): Promise<FeatureArtifactLink[]> {
  const { data, error } = await supabase
    .from('feature_artifacts')
    .select('*, artifact:project_artifacts(*)')
    .eq('feature_id', featureId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as FeatureArtifactLink[];
}

export async function fetchFeatureDocumentLinks(
  featureId: string
): Promise<FeatureDocumentLink[]> {
  const { data, error } = await supabase
    .from('feature_documents')
    .select('*, document:project_documents(*)')
    .eq('feature_id', featureId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as FeatureDocumentLink[];
}

export async function linkFeatureArtifact(
  projectId: string,
  featureId: string,
  artifactId: string,
  role: FeatureLinkRole
): Promise<void> {
  const { error } = await supabase.from('feature_artifacts').upsert({
    project_id: projectId,
    feature_id: featureId,
    artifact_id: artifactId,
    role,
  });

  if (error) throw error;
}

export async function linkFeatureDocument(
  projectId: string,
  featureId: string,
  documentId: string,
  role: FeatureLinkRole
): Promise<void> {
  const { error } = await supabase.from('feature_documents').upsert({
    project_id: projectId,
    feature_id: featureId,
    document_id: documentId,
    role,
  });

  if (error) throw error;
}

export async function unlinkFeatureArtifact(
  featureId: string,
  artifactId: string
): Promise<void> {
  const { error } = await supabase
    .from('feature_artifacts')
    .delete()
    .eq('feature_id', featureId)
    .eq('artifact_id', artifactId);

  if (error) throw error;
}

export async function unlinkFeatureDocument(
  featureId: string,
  documentId: string
): Promise<void> {
  const { error } = await supabase
    .from('feature_documents')
    .delete()
    .eq('feature_id', featureId)
    .eq('document_id', documentId);

  if (error) throw error;
}
