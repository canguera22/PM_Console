import type { OutputLanguage } from './output-language';

export type DiscoveryType =
  | 'customer_interview'
  | 'support_feedback'
  | 'sales_feedback'
  | 'market_research'
  | 'opportunity_sizing'
  | 'general_discovery';

export type DiscoveryOutputType =
  | 'Executive Summary'
  | 'Key Themes'
  | 'Pain Points'
  | 'Opportunity Areas'
  | 'User Stories / JTBD Signals'
  | 'Open Questions'
  | 'Recommended Next Steps';

export interface DiscoveryRequestInput {
  project_id: string;
  project_name?: string;
  artifact_name?: string;
  discovery_type: DiscoveryType;
  source_material: string;
  problem_area?: string;
  target_segment?: string;
  research_goal?: string;
  notes_context?: string;
  signal_focus?: string;
  selected_outputs: DiscoveryOutputType[];
  output_language?: OutputLanguage;
}

export interface DiscoveryResult {
  output: string;
  artifact_id?: string;
  session_id?: string;
}
