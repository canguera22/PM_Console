import { supabase, supabaseFetch } from './supabase';
import type {
  NotionTaskExportResult,
  NotionSyncMapping,
  ProjectNotionConfig,
  SaveProjectNotionConfigInput,
} from '@/types/notion';

export async function fetchProjectNotionConfig(
  projectId: string
): Promise<ProjectNotionConfig | null> {
  const data = await supabaseFetch<ProjectNotionConfig[]>(
    `/project_notion_configs?project_id=eq.${projectId}&limit=1`
  );

  return data?.[0] ?? null;
}

export async function saveProjectNotionConfig(
  input: SaveProjectNotionConfigInput
): Promise<ProjectNotionConfig> {
  const body = {
    project_id: input.project_id,
    notion_parent_page_id: cleanNotionId(input.notion_parent_page_id),
    notion_tasks_data_source_id: cleanNotionId(input.notion_tasks_data_source_id),
    sync_enabled: input.sync_enabled,
  };

  const data = await supabaseFetch<ProjectNotionConfig[]>(
    '/project_notion_configs?on_conflict=project_id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(body),
    }
  );

  if (!data?.[0]) {
    throw new Error('Failed to save Notion configuration');
  }

  return data[0];
}

export async function exportProjectTasksToNotion(
  projectId: string,
  taskIds?: string[],
  status?: 'open' | 'completed'
): Promise<NotionTaskExportResult> {
  const { data, error } = await supabase.functions.invoke<NotionTaskExportResult>(
    'notion-export',
    {
      body: {
        project_id: projectId,
        task_ids: taskIds ?? [],
        status,
        app_origin: window.location.origin,
      },
    }
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('No response from Notion export');
  }

  return data;
}

export async function fetchTaskNotionMappings(
  projectId: string
): Promise<Record<string, NotionSyncMapping>> {
  const rows = await supabaseFetch<NotionSyncMapping[]>(
    `/notion_sync_mappings?project_id=eq.${projectId}&resource_type=eq.task`
  );

  return (rows ?? []).reduce<Record<string, NotionSyncMapping>>((acc, row) => {
    acc[row.resource_id] = row;
    return acc;
  }, {});
}

export function cleanNotionId(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const withoutQuery = trimmed.split('?')[0];
  const compactMatch = withoutQuery.replace(/-/g, '').match(/[a-f0-9]{32}/i);
  if (compactMatch?.[0]) {
    return hyphenateNotionId(compactMatch[0]);
  }

  return trimmed;
}

function hyphenateNotionId(value: string) {
  const clean = value.replace(/-/g, '');
  if (clean.length !== 32) return value;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}
