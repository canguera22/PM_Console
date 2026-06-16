import { supabase } from './supabase';
import type { DiscoveryRequestInput, DiscoveryResult } from '@/types/discovery';
import { getFunctionErrorMessage } from './function-errors';

type DiscoveryEdgeResponse = {
  output: string;
  artifact_id?: string;
  session_id?: string;
};

export async function generateDiscovery(
  input: DiscoveryRequestInput
): Promise<DiscoveryResult> {
  const { data, error } = await supabase.functions.invoke<DiscoveryEdgeResponse>('prioritization', {
    body: input,
  });

  if (error) {
    console.error('Error calling discovery edge function:', error);
    const message = await getFunctionErrorMessage(error, 'Failed to generate discovery synthesis');
    throw new Error(message);
  }

  return {
    output: data.output,
    artifact_id: data.artifact_id,
    session_id: data.session_id,
  };
}

export async function calculatePrioritization(
  input: DiscoveryRequestInput
): Promise<DiscoveryResult> {
  return generateDiscovery(input);
}
