import { supabase, supabaseFetch } from './supabase';

export interface ContextArtifacts {
  documentation_sessions: any | null;
  meeting_sessions: any | null;
  prioritization_sessions: any | null;
  release_sessions: any | null;
}

export interface PMAdvisorInput {
  artifact_output: string;
  module_type: 'product_documentation' | 'release_communications' | 'meeting_intelligence' | 'prioritization';
  project_id: string;                     // ✅ UUID string
  project_name?: string;
  source_session_table: string;
  source_session_id?: string | null;      // ✅ UUID string
  artifact_type?: string;
  selected_outputs?: string[];
  context_artifacts: ContextArtifacts;
}

export interface PMAdvisorResult {
  output: string;
}

/**
 * ✅ Call the PM Advisor Agent to review an artifact
 */
export async function callPMAdvisorAgent(input: PMAdvisorInput): Promise<PMAdvisorResult> {
  const { data, error } = await supabase.functions.invoke('pm-advisor', {
    body: input,
  });

  if (error) {
    console.error('Error calling pm-advisor edge function:', error);
    throw new Error(error.message || 'Failed to get PM advisor feedback');
  }

  return { output: data.output };
}

/**
 * ✅ Fetch context artifacts (using new `project_artifacts` table)
 * Returns the latest artifact of each type for the given project
 */
export async function fetchContextArtifacts(projectId: string): Promise<ContextArtifacts> {
  try {
    const [doc, meeting, prio, release] = await Promise.all([
      supabaseFetch<any[]>(
        `/project_artifacts?project_id=eq.${projectId}&artifact_type=eq.product_documentation&order=created_at.desc&limit=1`
      ).then((data) => data[0] || null).catch(() => null),

      supabaseFetch<any[]>(
        `/project_artifacts?project_id=eq.${projectId}&artifact_type=eq.meeting_intelligence&order=created_at.desc&limit=1`
      ).then((data) => data[0] || null).catch(() => null),

      supabaseFetch<any[]>(
        `/project_artifacts?project_id=eq.${projectId}&artifact_type=eq.prioritization&order=created_at.desc&limit=1`
      ).then((data) => data[0] || null).catch(() => null),

      supabaseFetch<any[]>(
        `/project_artifacts?project_id=eq.${projectId}&artifact_type=eq.release_communications&order=created_at.desc&limit=1`
      ).then((data) => data[0] || null).catch(() => null),
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
 * ✅ Save PM Advisor review as a new artifact in `project_artifacts`
 */
export async function saveAdvisorReview(
  projectId: string,
  projectName: string,
  moduleType: string,
  sourceSessionTable: string,
  sourceSessionId: string | null,
  artifactType: string,
  inputSnapshot: any,
  outputSnapshot: string,
  advisorOutput: string,
  metadata: any
) {
  try {
    const response = await supabaseFetch<any[]>('/project_artifacts', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        project_name: projectName,
        artifact_type: 'pm_advisor_feedback',
        artifact_name: `${moduleType}_advisor_review`,
        input_data: {
          source_table: sourceSessionTable,
          source_id: sourceSessionId,
          artifact_type: artifactType,
          input_snapshot: inputSnapshot,
          output_snapshot: outputSnapshot,
        },
        output_data: advisorOutput,
        metadata,
      }),
    });

    console.log('💾 [Database] Advisor review saved:', response?.[0]?.id);
    return response?.[0];
  } catch (error) {
    console.error('Error saving advisor review:', error);
    throw error;
  }
}
