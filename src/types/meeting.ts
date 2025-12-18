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
