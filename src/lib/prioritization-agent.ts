import { supabase } from './supabase';
import {
  PrioritizationCalculationInput,
  PrioritizationCalculationResult,
  WSJFCalculationInput,
  WSJFCalculationResult,
} from '@/types/prioritization';
import { getFunctionErrorMessage } from './function-errors';

type PrioritizationEdgeResponse = {
  output: string;
  artifact_id?: string;
  session_id?: string;
};

export async function calculateWSJF(
  input: WSJFCalculationInput
): Promise<WSJFCalculationResult> {
  return calculatePrioritization({
    ...input,
    model: 'WSJF',
  });
}

export async function calculatePrioritization(
  input: PrioritizationCalculationInput
): Promise<PrioritizationCalculationResult> {
  const { data, error } = await supabase.functions.invoke<PrioritizationEdgeResponse>('prioritization', {
    body: input,
  });

  if (error) {
    console.error('Error calling prioritization edge function:', error);
    const message = await getFunctionErrorMessage(error, 'Failed to calculate prioritization');
    throw new Error(message);
  }

  return {
    output: data.output,
    artifact_id: data.artifact_id,
    session_id: data.session_id,
  };
}
