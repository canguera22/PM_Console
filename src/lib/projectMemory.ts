import { supabase } from './supabase';

export type ProjectMemoryCitationKind =
  | 'document'
  | 'artifact'
  | 'task'
  | 'decision'
  | 'open_question'
  | 'assumption';

export interface ProjectMemoryCitation {
  id: string;
  kind: ProjectMemoryCitationKind;
  title: string;
  quote: string;
  score: number;
  route: string | null;
  routeLabel: string;
  badgeLabel?: string | null;
}

export interface ProjectMemoryMessage {
  answer: string;
  citations: ProjectMemoryCitation[];
}

interface ProjectMemoryQueryInput {
  project_id: string;
  project_name?: string;
  query: string;
  feature_id?: string;
  feature_name?: string;
}

export async function queryProjectMemory(
  input: ProjectMemoryQueryInput
): Promise<ProjectMemoryMessage> {
  const { data, error } = await supabase.functions.invoke<ProjectMemoryMessage>(
    'project-memory-query',
    {
      body: input,
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to query project memory');
  }

  if (!data || typeof data.answer !== 'string') {
    throw new Error('Project memory returned an invalid response');
  }

  return {
    answer: data.answer,
    citations: Array.isArray(data.citations) ? data.citations : [],
  };
}
