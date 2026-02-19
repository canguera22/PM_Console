import { supabase } from './supabase';
import { getFunctionErrorMessage } from './function-errors';

export interface DocumentationInput {
  problem_statement: string;
  target_user_persona: string;
  business_goals: string;
  assumptions_constraints: string;
  functional_requirements: string;
  dependencies: string;
  non_functional_requirements?: string;
  user_pain_points?: string;
  competitive_context?: string;
  technical_constraints?: string;
  success_metrics?: string;
  target_timeline?: string;
  epic_impact?: string;
  selected_outputs: string[];
}

export interface DocumentationResult {
  output: string;
  session_id?: string;
  artifact_id?: string;
}

type DocumentationEdgeResponse = {
  output: string;
  session_id?: string;
  artifact_id?: string;
};

export async function generateDocumentation(
  input: DocumentationInput
): Promise<DocumentationResult> {
  const { data, error } = await supabase.functions.invoke<DocumentationEdgeResponse>(
    'product-documentation',
    { body: input }
  );

  if (error) {
    console.error('Error calling product-documentation edge function:', error);
    const message = await getFunctionErrorMessage(
      error,
      'Failed to generate documentation'
    );
    throw new Error(message);
  }

  if (!data || typeof data.output !== 'string') {
    console.error('Unexpected product-documentation response:', data);
    throw new Error('Edge function returned an unexpected response (missing output).');
  }

  return {
    output: data.output,
    session_id: data.session_id,
    artifact_id: data.artifact_id,
  };
}
