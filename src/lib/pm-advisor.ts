import { supabase, supabaseFetch } from './supabase';

export interface ContextArtifacts {
  documentation_sessions: any | null;
  meeting_sessions: any | null;
  prioritization_sessions: any | null;
  release_sessions: any | null;
}

export interface PMAdvisorInput {
  artifact_output: string;
  module_type: 'product_documentation' | 'release_communications';
  project_id: number;
  project_name?: string;
  source_session_table: string;
  source_session_id?: number | null;
  artifact_type?: string;
  selected_outputs?: string[];
  context_artifacts: ContextArtifacts;
}

export interface PMAdvisorResult {
  output: string;
}

/**
 * Call the PM Advisor Agent to review an artifact
 */
export async function callPMAdvisorAgent(input: PMAdvisorInput): Promise<PMAdvisorResult> {
  const { data, error } = await supabase.functions.invoke('pm-advisor', {
    body: input,
  });

  if (error) {
    console.error('Error calling pm-advisor edge function:', error);
    throw new Error(error.message || 'Failed to get PM advisor feedback');
  }

  return {
    output: data.output,
  };
}

/**
 * Fetch context artifacts from all modules for a project
 */
export async function fetchContextArtifacts(projectId: number): Promise<ContextArtifacts> {
  try {
    const [doc, meeting, prio, release] = await Promise.all([
      supabaseFetch<any[]>(
        `/documentation_sessions?project_id=eq.${projectId}&order=created_at.desc&limit=1`
      ).then(data => data[0] || null).catch(() => null),
      
      supabaseFetch<any[]>(
        `/meeting_sessions?project_id=eq.${projectId}&order=created_at.desc&limit=1`
      ).then(data => data[0] || null).catch(() => null),
      
      supabaseFetch<any[]>(
        `/prioritization_sessions?project_id=eq.${projectId}&order=created_at.desc&limit=1`
      ).then(data => data[0] || null).catch(() => null),
      
      supabaseFetch<any[]>(
        `/release_sessions?project_id=eq.${projectId}&order=created_at.desc&limit=1`
      ).then(data => data[0] || null).catch(() => null),
    ]);

    return {
      documentation_sessions: doc,
      meeting_sessions: meeting,
      prioritization_sessions: prio,
      release_sessions: release,
    };
  } catch (error) {
    console.error('Error fetching context artifacts:', error);
    return {
      documentation_sessions: null,
      meeting_sessions: null,
      prioritization_sessions: null,
      release_sessions: null,
    };
  }
}

/**
 * Save an advisor review to the database
 */
export async function saveAdvisorReview(
  projectId: number,
  projectName: string,
  moduleType: string,
  sourceSessionTable: string,
  sourceSessionId: number | null,
  artifactType: string,
  inputSnapshot: any,
  outputSnapshot: string,
  advisorOutput: string,
  metadata: any
) {
  try {
    const response = await supabaseFetch<any[]>('/advisor_sessions', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        project_name: projectName,
        module_type: moduleType,
        source_session_table: sourceSessionTable,
        source_session_id: sourceSessionId,
        artifact_type: artifactType,
        input_snapshot: inputSnapshot,
        output_snapshot: outputSnapshot,
        advisor_output: advisorOutput,
        metadata,
      }),
    });
    return response[0];
  } catch (error) {
    console.error('Error saving advisor review:', error);
    throw error;
  }
}
