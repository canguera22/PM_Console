import { supabase } from './supabase';
import { getFunctionErrorMessage } from './function-errors';

export interface MeetingAnalysisInput {
  // ✅ REQUIRED: UUID string so Edge Function can store artifact under the correct project
  project_id: string;

  meeting_transcript: string;

  // optional context
  meeting_type?: string;
  project_name?: string;
  participants?: string;
  artifact_name?: string;
}

export interface MeetingAnalysisResult {
  output: string;
  session_id?: string;
  artifact_id?: string;
}

type MeetingEdgeResponse = {
  output: string;
  session_id?: string;
  artifact_id?: string;
};

export async function analyzeMeeting(
  input: MeetingAnalysisInput
): Promise<MeetingAnalysisResult> {
  const { data, error } = await supabase.functions.invoke<MeetingEdgeResponse>('meeting-intelligence', {
    body: input,
  });

  if (error) {
    console.error('Error calling meeting-intelligence edge function:', error);
    const message = await getFunctionErrorMessage(error, 'Failed to analyze meeting');
    throw new Error(message);
  }

  // Defensive: ensure we got what we expect
  if (!data || typeof data.output !== 'string') {
    console.error('Unexpected response from meeting-intelligence:', data);
    throw new Error('Invalid response from meeting intelligence service');
  }

  return {
    output: data.output,
    session_id: data.session_id,
    artifact_id: data.artifact_id,
  };
}
