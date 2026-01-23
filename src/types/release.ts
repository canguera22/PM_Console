export interface ReleaseSession {
  id: string;
  created_at: string;
  release_name: string | null;
  target_audience: string | null;
  known_risks: string | null;
  csv_filename: string | null;
  csv_row_count: number | null;
  selected_outputs: string[];
  output: string | null;
  metadata: Record<string, any>;
}

export const OUTPUT_TYPES = [
  'Customer-Facing Release Notes',
  'Internal Release Summary',
  'Support Briefing',
  'Technical / Engineering Notes',
  'Categorized Issue Breakdown',
  'Breaking Changes / Risk Alerts',
  'Release Checklist',
] as const;

export type OutputType = typeof OUTPUT_TYPES[number];

export interface ReleaseGenerationInput {
  csv_data: string;
  selected_outputs: OutputType[];
  release_name?: string;
  target_audience?: string;
  known_risks?: string;
}

export interface ReleaseGenerationResult {
  output: string;
  session_id?: string;
}

export interface ParsedCSV {
  headers: string[];
  rows: any[];
  rowCount: number;
}
