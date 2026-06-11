export interface ProjectNotionConfig {
  project_id: string;
  created_at?: string;
  updated_at?: string;
  notion_parent_page_id: string | null;
  notion_tasks_data_source_id: string | null;
  sync_enabled: boolean;
  last_exported_at?: string | null;
  last_export_status?: 'success' | 'partial_success' | 'failed' | null;
  last_export_error?: string | null;
}

export interface SaveProjectNotionConfigInput {
  project_id: string;
  notion_parent_page_id?: string | null;
  notion_tasks_data_source_id?: string | null;
  sync_enabled: boolean;
}

export interface NotionTaskExportResult {
  exported: number;
  created: number;
  updated: number;
  failures: Array<{
    task_id: string;
    title: string;
    error: string;
  }>;
}

export interface NotionSyncMapping {
  id: string;
  created_at: string;
  updated_at: string;
  project_id: string;
  resource_type: 'task' | 'artifact';
  resource_id: string;
  notion_page_id: string;
  notion_url: string | null;
  last_synced_at: string;
  last_sync_status: 'success' | 'failed';
  last_sync_error: string | null;
}
