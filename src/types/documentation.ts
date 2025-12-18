export interface DocumentationSession {
  id: string;
  created_at: string;
  problem_statement: string;
  target_user_persona: string;
  business_goals: string;
  assumptions_constraints: string;
  functional_requirements: string;
  dependencies: string;
  non_functional_requirements?: string;
  user_pain_points?: string;
  competitive_context?: string;
  technical_constraints?: string;
  success_metrics?: string;
  target_timeline?: string;
  epic_impact?: string;
  selected_outputs: string[];
  output?: string;
  metadata?: Record<string, any>;
}

export interface DocumentationFormData {
  problem_statement: string;
  target_user_persona: string;
  business_goals: string;
  assumptions_constraints: string;
  functional_requirements: string;
  dependencies: string;
  non_functional_requirements: string;
  user_pain_points: string;
  competitive_context: string;
  technical_constraints: string;
  success_metrics: string;
  target_timeline: string;
  epic_impact: string;
}

export const OUTPUT_TYPES = [
  'PRD (Product Requirements Document)',
  'Epics',
  'Epic Impact Statement',
  'User Stories',
  'Acceptance Criteria',
  'Out of Scope',
  'Risks & Mitigations',
  'Dependencies Mapping',
  'Success Metrics / KPIs Draft',
  'Release Notes Draft',
] as const;

export type OutputType = typeof OUTPUT_TYPES[number];
