import { supabase } from './supabase';
import { ReleaseGenerationInput, ReleaseGenerationResult, ReleaseOutputSection } from '@/types/release';
import { getFunctionErrorMessage } from './function-errors';

type ReleaseEdgeResponse = {
  output: string;
  artifact_id?: string;
  sections?: ReleaseOutputSection[];
  // optional future fields:
  // run_id?: string;
  // metadata?: Record<string, any>;
};

export async function generateReleaseDocumentation(
  input: ReleaseGenerationInput
): Promise<ReleaseGenerationResult> {
  const { data, error } = await supabase.functions.invoke<ReleaseEdgeResponse>(
    'release-communications',
    { body: input }
  );

  if (error) {
    console.error('Error calling release-communications edge function:', error);
    const message = await getFunctionErrorMessage(
      error,
      'Failed to generate release documentation'
    );
    throw new Error(message);
  }

  if (!data || typeof data.output !== 'string') {
    console.error('Unexpected release-communications response:', data);
    throw new Error('Edge function returned an unexpected response (missing output).');
  }

  return {
    output: data.output,
    artifact_id: data.artifact_id,
    sections: data.sections,
  };
}
