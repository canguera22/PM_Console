import { supabase } from './supabase';
import { ReleaseGenerationInput, ReleaseGenerationResult } from '@/types/release';

export async function generateReleaseDocumentation(
  input: ReleaseGenerationInput
): Promise<ReleaseGenerationResult> {
  const { data, error } = await supabase.functions.invoke('release-communications', {
    body: input,
  });

  if (error) {
    console.error('Error calling release-communications edge function:', error);
    throw new Error(error.message || 'Failed to generate release documentation');
  }

  return {
    output: data.output,
  };
}
