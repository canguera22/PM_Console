export interface MeetingSession {
  id: string;
  created_at: string;
  meeting_type: string | null;
  project_name: string | null;
  participants: string | null;
  transcript: string;
  output: string | null;
  metadata: Record<string, any>;
}

export interface ProjectArtifactRow {
  id: string;
  created_at: string;
  project_id: string;
  project_name: string;
  artifact_type: string;
  artifact_name: string | null;
  input_data: Record<string, any> | null;
  output_data: string | null;
  metadata: Record<string, any> | null;
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
