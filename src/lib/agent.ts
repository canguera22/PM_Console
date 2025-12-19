import { supabase } from './supabase';

export interface MeetingAnalysisInput {
  // ✅ REQUIRED: UUID string so Edge Function can store artifact under the correct project
  project_id: string;

  meeting_transcript: string;

  // optional context
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

  // Defensive: ensure we got what we expect
  if (!data || typeof data.output !== 'string') {
    console.error('Unexpected response from meeting-intelligence:', data);
    throw new Error('Invalid response from meeting intelligence service');
  }

  return {
    output: data.output,
    session_id: data.session_id,
  };
}
