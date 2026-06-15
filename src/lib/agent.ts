import { supabase } from './supabase';
import { getFunctionErrorMessage } from './function-errors';
import type {
  ExtractedActionItem,
  ExtractedAssumption,
  ExtractedDecision,
  ExtractedOpenQuestion,
} from '@/types/meeting';
import type { OutputLanguage } from '@/types/output-language';

export interface MeetingAnalysisInput {
  // ✅ REQUIRED: UUID string so Edge Function can store artifact under the correct project
  project_id: string;

  meeting_transcript: string;
  input_mode?: 'transcript' | 'notes_cleanup';

  // optional context
  meeting_type?: string;
  project_name?: string;
  participants?: string;
  artifact_name?: string;
  output_language?: OutputLanguage;
}

export interface MeetingAnalysisResult {
  output: string;
  session_id?: string;
  artifact_id?: string;
  action_items?: ExtractedActionItem[];
  decisions?: ExtractedDecision[];
  open_questions?: ExtractedOpenQuestion[];
  assumptions?: ExtractedAssumption[];
}

type MeetingEdgeResponse = {
  output: string;
  session_id?: string;
  artifact_id?: string;
  action_items?: ExtractedActionItem[];
  decisions?: ExtractedDecision[];
  open_questions?: ExtractedOpenQuestion[];
  assumptions?: ExtractedAssumption[];
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
    action_items: Array.isArray(data.action_items) ? data.action_items : [],
    decisions: Array.isArray(data.decisions) ? data.decisions : [],
    open_questions: Array.isArray(data.open_questions) ? data.open_questions : [],
    assumptions: Array.isArray(data.assumptions) ? data.assumptions : [],
  };
}
