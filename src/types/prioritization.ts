// ===============================
// Core Types
// ===============================

export type PrioritizationModel =
  | 'WSJF'
  | 'RICE'
  | 'MoSCoW'
  | 'Value/Effort'
  | 'Custom';

// ===============================
// Output Types (type-only)
// ===============================

export type OutputType =
  | 'Ranked Backlog'
  | 'Top N Items Summary'
  | 'Quick Wins vs Strategic Bets'
  | 'WSJF Score Breakdown'
  | 'Prioritization Rationale';

export type RICEOutputType =
  | 'Ranked Backlog (RICE Score + Rank)'
  | 'Top N Items Summary'
  | 'High Impact / Low Effort Items'
  | 'RICE Score Breakdown per Item'
  | 'Prioritization Rationale';

export type MoSCoWOutputType =
  | 'Ranked Backlog by MoSCoW Category'
  | 'Breakdown by Category (Must/Should/Could/Won’t)'
  | 'Category Distribution Summary'
  | 'Prioritization Rationale';

export type ValueEffortOutputType =
  | 'Ranked Backlog (Value/Effort Score + Rank)'
  | 'Top N Items Summary'
  | 'Quick Wins (High Value, Low Effort)'
  | 'Score Breakdown per Item'
  | 'Prioritization Rationale';

export type CustomOutputType =
  | 'Ranked Backlog (Custom Score + Rank)'
  | 'Top N Items Summary'
  | 'Score Breakdown per Item'
  | 'Prioritization Rationale';

// ===============================
// Config Interfaces
// ===============================

export interface RICEConfig {
  reachColumn: string;
  impactColumn: string;
  confidenceColumn: string;
  effortColumn: string;
  normalizeScores: boolean;
  selectedOutputs: RICEOutputType[];
  topNItems: number;
}

export interface MoSCoWConfig {
  moscowColumn: string;
  categoryMapping: {
    must: string;
    should: string;
    could: string;
    wont: string;
  };
  selectedOutputs: MoSCoWOutputType[];
}

export interface ValueEffortConfig {
  valueColumn: string;
  effortColumn: string;
  invertRanking: boolean;
  normalizeScores: boolean;
  selectedOutputs: ValueEffortOutputType[];
  topNItems: number;
}

export interface CustomFactor {
  id: string;
  factorName: string;
  csvColumn: string;
  weight: number;
}

export interface CustomScoringConfig {
  factors: CustomFactor[];
  normalizeScores: boolean;
  selectedOutputs: CustomOutputType[];
  topNItems: number;
}

// ===============================
// Session / Agent Interfaces
// ===============================

export interface PrioritizationSession {
  id: string;
  created_at: string;
  initiative_name: string | null;
  default_effort_scale: string | null;
  notes_context: string | null;
  csv_filename: string | null;
  csv_row_count: number | null;
  effort_field_name: string;
  max_score_per_factor: number;
  normalize_scores: boolean;
  top_n_items: number;
  selected_outputs: string[];
  output: string | null;
  metadata: Record<string, any>;
}

export interface WSJFCalculationInput {
  csv_content: string;
  initiative_name?: string;
  default_effort_scale?: string;
  notes_context?: string;
  effort_field_name: string;
  max_score_per_factor: number;
  normalize_scores: boolean;
  top_n_items: number;
  selected_outputs: string[];
}

export interface WSJFCalculationResult {
  output: string;
  session_id?: string;
}
