import { supabase } from './supabase';
import { ReleaseGenerationInput, ReleaseGenerationResult } from '@/types/release';

type ReleaseEdgeResponse = {
  output: string;
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

    const details =
      (error as any)?.context?.statusText ||
      (error as any)?.details ||
      (error as any)?.message ||
      JSON.stringify(error);

    throw new Error(details || 'Failed to generate release documentation');
  }

  if (!data || typeof data.output !== 'string') {
    console.error('Unexpected release-communications response:', data);
    throw new Error('Edge function returned an unexpected response (missing output).');
  }

  return { output: data.output };
}
