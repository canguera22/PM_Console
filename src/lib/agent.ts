import { supabase } from './supabase';

export interface MeetingAnalysisInput {
  meeting_transcript: string;
  meeting_type?: string;
  project_name?: string;
  participants?: string;
}

export interface MeetingAnalysisResult {
  output: string;
  session_id?: string;
}

export async function analyzeMeeting(
  input: MeetingAnalysisInput
): Promise<MeetingAnalysisResult> {
  const { data, error } = await supabase.functions.invoke('meeting-intelligence', {
    body: input,
  });

  if (error) {
    console.error('Error calling meeting-intelligence edge function:', error);
    throw new Error(error.message || 'Failed to analyze meeting');
  }

  return {
    output: data.output,
  };
}
