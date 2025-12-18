import { supabase } from './supabase';

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
}

export async function generateDocumentation(
  input: DocumentationInput
): Promise<DocumentationResult> {
  const { data, error } = await supabase.functions.invoke('product-documentation', {
    body: input,
  });

  if (error) {
    console.error('Error calling product-documentation edge function:', error);
    throw new Error(error.message || 'Failed to generate documentation');
  }

  return {
    output: data.output,
  };
}
