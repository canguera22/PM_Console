export type MeetingInputMode = 'transcript' | 'notes_cleanup';

export interface ExtractedActionItem {
  id?: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  owner?: string | null;
  source_evidence?: string | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  context_validation?: string | null;
  related_module?: string | null;
}

export interface ExtractedDecision {
  id?: string;
  decision: string;
  summary?: string | null;
  made_by?: string | null;
  source_evidence?: string | null;
  confidence?: 'high' | 'medium' | 'low' | null;
}

export interface ExtractedOpenQuestion {
  id?: string;
  question: string;
  summary?: string | null;
  owner_or_source?: string | null;
  source_evidence?: string | null;
  confidence?: 'high' | 'medium' | 'low' | null;
}

export interface ExtractedAssumption {
  id?: string;
  assumption: string;
  summary?: string | null;
  owner_or_source?: string | null;
  source_evidence?: string | null;
  confidence?: 'high' | 'medium' | 'low' | null;
}

export interface MeetingSession {
  id: string;
  created_at: string;
  artifact_name?: string | null;
  created_by_email?: string | null;
  input_mode: MeetingInputMode;
  meeting_type: string | null;
  project_name: string | null;
  participants: string | null;
  transcript: string;
  output: string | null;
  action_items?: ExtractedActionItem[];
  decisions?: ExtractedDecision[];
  open_questions?: ExtractedOpenQuestion[];
  assumptions?: ExtractedAssumption[];
  metadata: Record<string, unknown>;
  version: number;
}

export interface ProjectArtifactRow {
  id: string;
  created_at: string;
  project_id: string;
  project_name: string;
  artifact_type: string;
  artifact_name: string | null;
  created_by_user_id?: string | null;
  created_by_email?: string | null;
  input_data: Record<string, unknown> | null;
  output_data: string | null;
  metadata: Record<string, unknown> | null;
  advisor_feedback: string | null;
  advisor_reviewed_at: string | null;
  status: 'active' | 'archived' | 'deleted';
}

export type MeetingType =
  | 'Discovery'
  | 'Sprint Planning'
  | 'Stakeholder Sync'
  | 'Retrospective'
  | 'Other';

export const MEETING_TYPES: MeetingType[] = [
  'Discovery',
  'Sprint Planning',
  'Stakeholder Sync',
  'Retrospective',
  'Other',
];
