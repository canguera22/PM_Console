// Shared types for all agent invocations
export interface BaseAgentInput {
  project_id: string; // REQUIRED: UUID of the active project
  project_name: string;
  artifact_name?: string; // Optional: user-provided artifact name
}

export interface MeetingAgentInput extends BaseAgentInput {
  transcript: string;
  meeting_type: string;
  selected_outputs: string[];
}

export interface DocumentationAgentInput extends BaseAgentInput {
  problem_statement: string;
  target_user_persona: string;
  business_goals: string;
  assumptions_constraints: string;
  functional_requirements: string;
  dependencies: string;
  selected_outputs: string[];
}

export interface ReleaseAgentInput extends BaseAgentInput {
  csv_data: string;
  target_audience: string;
  selected_outputs: string[];
}

export interface PrioritizationAgentInput extends BaseAgentInput {
  csv_data: string;
  prioritization_model: string;
  configuration: Record<string, any>;
}

export interface PMAdvisorInput extends BaseAgentInput {
  user_prompt?: string; // Optional: specific feedback request
  artifact_id?: string; // Optional: specific artifact to review
}

export interface AgentResponse {
  output: string;
  artifact_id?: string;
  context_artifacts_count?: number;
}
