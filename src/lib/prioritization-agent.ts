import { supabase } from './supabase';
import { WSJFCalculationInput, WSJFCalculationResult } from '@/types/prioritization';

export async function calculateWSJF(
  input: WSJFCalculationInput
): Promise<WSJFCalculationResult> {
  const { data, error } = await supabase.functions.invoke('prioritization', {
    body: input,
  });

  if (error) {
    console.error('Error calling prioritization edge function:', error);
    throw new Error(error.message || 'Failed to calculate WSJF');
  }

  return {
    output: data.output,
  };
}
