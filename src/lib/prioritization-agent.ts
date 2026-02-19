import { supabase } from './supabase';
import { WSJFCalculationInput, WSJFCalculationResult } from '@/types/prioritization';
import { getFunctionErrorMessage } from './function-errors';

type PrioritizationEdgeResponse = {
  output: string;
  artifact_id?: string;
  session_id?: string;
};

export async function calculateWSJF(
  input: WSJFCalculationInput
): Promise<WSJFCalculationResult> {
  const { data, error } = await supabase.functions.invoke<PrioritizationEdgeResponse>('prioritization', {
    body: input,
  });

  if (error) {
    console.error('Error calling prioritization edge function:', error);
    const message = await getFunctionErrorMessage(error, 'Failed to calculate WSJF');
    throw new Error(message);
  }

  return {
    output: data.output,
    artifact_id: data.artifact_id,
    session_id: data.session_id,
  };
}
