import { supabase } from './supabase';
import { getFunctionErrorMessage } from './function-errors';
import type { OutputLanguage } from '@/types/output-language';

export interface ReviseArtifactInput {
  project_id: string;
  project_name?: string;
  artifact_id: string;
  artifact_name?: string | null;
  module_type: 'product_documentation' | 'release_communications' | 'prioritization' | 'meeting_intelligence';
  artifact_type?: string;
  original_input?: unknown;
  original_output: string;
  advisor_feedback: string;
  selected_outputs?: string[];
  output_language?: OutputLanguage;
}

export interface ReviseArtifactResult {
  output: string;
}

export async function reviseArtifactWithAdvisor(
  input: ReviseArtifactInput
): Promise<ReviseArtifactResult> {
  const { data, error } = await supabase.functions.invoke<ReviseArtifactResult>(
    'artifact-revision',
    { body: input }
  );

  if (error) {
    const message = await getFunctionErrorMessage(error, 'Failed to revise artifact');
    throw new Error(message);
  }

  if (!data || typeof data.output !== 'string') {
    throw new Error('Revision service returned an unexpected response.');
  }

  return data;
}

