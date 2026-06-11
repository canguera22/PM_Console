import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NOTION_TOKEN = Deno.env.get('NOTION_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const NOTION_VERSION = '2026-03-11';

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ProjectTask = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  related_module: string | null;
  status: 'open' | 'completed' | 'archived';
  updated_at: string;
  completed_at: string | null;
};

type NotionConfig = {
  project_id: string;
  notion_parent_page_id: string | null;
  notion_tasks_data_source_id: string | null;
  sync_enabled: boolean;
};

type NotionPropertySchema = {
  type: string;
  select?: { options?: Array<{ name: string }> };
  status?: { options?: Array<{ name: string }> };
};

async function requireProjectAccess(req: Request, projectId: string): Promise<Response | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return jsonResponse({ error: 'Missing bearer token' }, 401);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData.user?.id;

  if (userError || !userId) {
    return jsonResponse({ error: 'Invalid authentication token' }, 401);
  }

  const [{ data: ownedProject, error: ownerError }, { data: membership, error: memberError }] =
    await Promise.all([
      supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('owner_user_id', userId)
        .maybeSingle(),
      supabase
        .from('project_members')
        .select('project_id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

  if (ownerError || memberError) {
    console.error('[Notion Export] Failed to validate project access', { ownerError, memberError });
    return jsonResponse({ error: 'Unable to validate project access' }, 500);
  }

  if (!ownedProject && !membership) {
    return jsonResponse({ error: 'Forbidden: project access denied' }, 403);
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!NOTION_TOKEN) {
      return jsonResponse({ error: 'NOTION_TOKEN is not configured' }, 500);
    }

    const body = await req.json();
    const projectId = String(body.project_id ?? '');
    const taskIds = Array.isArray(body.task_ids)
      ? body.task_ids.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const statusFilter =
      body.status === 'open' || body.status === 'completed' ? body.status : null;
    const appOrigin = typeof body.app_origin === 'string' ? body.app_origin : '';

    if (!projectId) {
      return jsonResponse({ error: 'project_id is required' }, 400);
    }

    const accessError = await requireProjectAccess(req, projectId);
    if (accessError) return accessError;

    const { data: config, error: configError } = await supabase
      .from('project_notion_configs')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle<NotionConfig>();

    if (configError) throw configError;
    if (!config?.sync_enabled || !config.notion_tasks_data_source_id) {
      return jsonResponse(
        { error: 'Notion task export is not configured for this project' },
        400,
      );
    }

    let taskQuery = supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false });

    if (taskIds.length > 0) {
      taskQuery = taskQuery.in('id', taskIds);
    }
    if (statusFilter) {
      taskQuery = taskQuery.eq('status', statusFilter);
    }

    const { data: tasks, error: taskError } = await taskQuery.returns<ProjectTask[]>();
    if (taskError) throw taskError;

    if (!tasks || tasks.length === 0) {
      return jsonResponse({ exported: 0, updated: 0, created: 0, failures: [] });
    }

    const dataSource = await notionRequest(
      `/data_sources/${config.notion_tasks_data_source_id}`,
      { method: 'GET' },
    );
    const propertiesSchema = (dataSource.properties ?? {}) as Record<string, NotionPropertySchema>;

    let created = 0;
    let updated = 0;
    const failures: Array<{ task_id: string; title: string; error: string }> = [];

    for (const task of tasks) {
      try {
        const existingPageId = await findExistingNotionPageId(
          projectId,
          task.id,
          config.notion_tasks_data_source_id,
          propertiesSchema,
        );
        const properties = buildTaskProperties(task, propertiesSchema, appOrigin);

        if (existingPageId) {
          const response = await notionRequest(`/pages/${existingPageId}`, {
            method: 'PATCH',
            body: JSON.stringify({ properties }),
          });
          updated += 1;
          await upsertSyncMapping(projectId, task.id, response.id, response.url, 'success', null);
        } else {
          const response = await createTaskPage(
            config.notion_tasks_data_source_id,
            properties,
            task,
            appOrigin,
          );
          created += 1;
          await upsertSyncMapping(projectId, task.id, response.id, response.url, 'success', null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ task_id: task.id, title: task.title, error: message });
        await upsertSyncMapping(projectId, task.id, task.id, null, 'failed', message);
      }
    }

    const status = failures.length === 0 ? 'success' : created + updated > 0 ? 'partial_success' : 'failed';
    await supabase
      .from('project_notion_configs')
      .update({
        last_exported_at: new Date().toISOString(),
        last_export_status: status,
        last_export_error: failures[0]?.error ?? null,
      })
      .eq('project_id', projectId);

    return jsonResponse({
      exported: created + updated,
      created,
      updated,
      failures,
    });
  } catch (error) {
    console.error('[Notion Export] Failed', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown Notion export error' },
      500,
    );
  }
});

async function createTaskPage(
  dataSourceId: string,
  properties: Record<string, unknown>,
  task: ProjectTask,
  appOrigin: string,
) {
  return notionRequest('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: {
        type: 'data_source_id',
        data_source_id: dataSourceId,
      },
      properties,
      children: buildTaskPageChildren(task, appOrigin),
    }),
  });
}

async function findExistingNotionPageId(
  projectId: string,
  taskId: string,
  dataSourceId: string,
  schema: Record<string, NotionPropertySchema>,
) {
  const { data: mapping } = await supabase
    .from('notion_sync_mappings')
    .select('notion_page_id')
    .eq('project_id', projectId)
    .eq('resource_type', 'task')
    .eq('resource_id', taskId)
    .eq('last_sync_status', 'success')
    .maybeSingle();

  if (mapping?.notion_page_id) {
    return mapping.notion_page_id as string;
  }

  const workbenchIdProperty = findPropertyName(schema, [
    'Product Workbench ID',
    'PW ID',
    'Product Workbench Id',
    'Workbench ID',
  ], ['rich_text']);
  if (!workbenchIdProperty) return null;

  try {
    const result = await notionRequest(`/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          property: workbenchIdProperty,
          rich_text: { equals: taskId },
        },
        page_size: 1,
      }),
    });
    return result.results?.[0]?.id ?? null;
  } catch (error) {
    console.warn('[Notion Export] Could not query existing Notion task', error);
    return null;
  }
}

function buildTaskProperties(
  task: ProjectTask,
  schema: Record<string, NotionPropertySchema>,
  appOrigin: string,
) {
  const properties: Record<string, unknown> = {};
  const titleProperty = findPropertyName(schema, ['Task Name', 'Name', 'Task'], ['title']);
  if (!titleProperty) {
    throw new Error(`Could not find a title property. Available properties: ${Object.keys(schema).join(', ')}`);
  }

  properties[titleProperty] = {
    title: [{ text: { content: truncate(task.title, 1800) } }],
  };

  const dueDateProperty = findPropertyName(schema, ['Due Date', 'Due', 'Deadline'], ['date']);
  if (dueDateProperty) {
    properties[dueDateProperty] = task.due_date ? { date: { start: task.due_date } } : { date: null };
  }

  const priorityProperty = findPropertyName(schema, ['Priority'], ['select', 'status']);
  if (priorityProperty) {
    const priorityValue = resolveSelectOrStatusValue(inferPriority(task), schema[priorityProperty]);
    if (priorityValue) properties[priorityProperty] = priorityValue;
  }

  const descriptionProperty = findPropertyName(schema, ['Description', 'Details', 'Notes'], ['rich_text']);
  if (descriptionProperty) {
    properties[descriptionProperty] = {
      rich_text: [{ text: { content: truncate(buildDescription(task), 1900) } }],
    };
  }

  const workbenchIdProperty = findPropertyName(schema, [
    'Product Workbench ID',
    'PW ID',
    'Product Workbench Id',
    'Workbench ID',
  ], ['rich_text']);
  if (workbenchIdProperty) {
    properties[workbenchIdProperty] = {
      rich_text: [{ text: { content: task.id } }],
    };
  }

  const updatedAtProperty = findPropertyName(schema, ['Updated At', 'Updated', 'Last Updated'], ['date']);
  if (updatedAtProperty) {
    properties[updatedAtProperty] = {
      date: { start: new Date().toISOString() },
    };
  }

  const workbenchUrl = buildWorkbenchUrl(appOrigin);
  const workbenchUrlProperty = findPropertyName(schema, [
    'Product Workbench URL',
    'PW URL',
    'Workbench URL',
    'Product Workbench Link',
  ], ['url']);
  if (workbenchUrl && workbenchUrlProperty) {
    properties[workbenchUrlProperty] = { url: workbenchUrl };
  }

  const statusProperty = findPropertyName(schema, ['Status', 'State'], ['status', 'select']);
  if (statusProperty) {
    const statusValue = resolveStatusValue(task.status, schema[statusProperty]);
    if (statusValue) properties[statusProperty] = statusValue;
  }

  return properties;
}

function findPropertyName(
  schema: Record<string, NotionPropertySchema>,
  preferredNames: string[],
  allowedTypes: string[],
) {
  for (const preferred of preferredNames) {
    const exact = Object.keys(schema).find((name) => name === preferred);
    if (exact && allowedTypes.includes(schema[exact].type)) return exact;
  }

  const normalizedPreferred = preferredNames.map(normalizePropertyName);
  const fuzzy = Object.keys(schema).find((name) => {
    const normalizedName = normalizePropertyName(name);
    return normalizedPreferred.includes(normalizedName) && allowedTypes.includes(schema[name].type);
  });
  if (fuzzy) return fuzzy;

  return Object.keys(schema).find((name) => allowedTypes.includes(schema[name].type)) ?? null;
}

function normalizePropertyName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveSelectOrStatusValue(value: string, schema?: NotionPropertySchema) {
  if (schema?.type === 'status') {
    const match = findMatchingOption(schema.status?.options, [value]);
    return match ? { status: { name: match } } : undefined;
  }

  if (schema?.type === 'select') {
    const match = findMatchingOption(schema.select?.options, [value]) ?? value;
    return { select: { name: match } };
  }

  return undefined;
}

function resolveStatusValue(status: ProjectTask['status'], schema?: NotionPropertySchema) {
  const desired = status === 'completed'
    ? ['Completed', 'Complete', 'Done']
    : ['Open', 'Not started', 'To-do', 'Todo', 'In progress'];

  if (schema?.type === 'status') {
    const match = findMatchingOption(schema.status?.options, desired);
    return match ? { status: { name: match } } : undefined;
  }

  if (schema?.type === 'select') {
    const match = findMatchingOption(schema.select?.options, desired) ?? desired[0];
    return { select: { name: match } };
  }

  return undefined;
}

function findMatchingOption(options: Array<{ name: string }> | undefined, desired: string[]) {
  if (!options || options.length === 0) return null;
  const normalized = new Map(options.map((option) => [option.name.toLowerCase(), option.name]));
  for (const value of desired) {
    const match = normalized.get(value.toLowerCase());
    if (match) return match;
  }
  return null;
}

function inferPriority(_task: ProjectTask) {
  return 'Medium';
}

function buildDescription(task: ProjectTask) {
  const lines = [
    task.description?.trim(),
    task.related_module ? `Module: ${formatModule(task.related_module)}` : null,
    task.completed_at ? `Completed: ${new Date(task.completed_at).toLocaleString()}` : null,
    `Product Workbench task ID: ${task.id}`,
  ].filter(Boolean);

  return lines.join('\n\n');
}

function buildTaskPageChildren(task: ProjectTask, appOrigin: string) {
  const workbenchUrl = buildWorkbenchUrl(appOrigin);
  const lines = [
    `Status: ${task.status === 'completed' ? 'Completed' : 'Open'}`,
    task.due_date ? `Due date: ${task.due_date}` : null,
    task.related_module ? `Module: ${formatModule(task.related_module)}` : null,
    workbenchUrl ? `Product Workbench: ${workbenchUrl}` : null,
  ].filter(Boolean);

  const children: Array<Record<string, unknown>> = [
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: 'Product Workbench Details' } }],
      },
    },
    {
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{ type: 'text', text: { content: lines.join('\n') || 'Synced from Product Workbench.' } }],
      },
    },
  ];

  const description = buildDescription(task);
  if (description) {
    children.push(
      {
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: 'Description' } }],
        },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: truncate(description, 1900) } }],
        },
      },
    );
  }

  return children;
}

function buildWorkbenchUrl(appOrigin: string) {
  if (!appOrigin || !/^https?:\/\//i.test(appOrigin)) return null;
  return `${appOrigin.replace(/\/$/, '')}/tasks`;
}

function formatModule(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

async function upsertSyncMapping(
  projectId: string,
  taskId: string,
  notionPageId: string,
  notionUrl: string | null,
  status: 'success' | 'failed',
  error: string | null,
) {
  await supabase
    .from('notion_sync_mappings')
    .upsert(
      {
        project_id: projectId,
        resource_type: 'task',
        resource_id: taskId,
        notion_page_id: notionPageId,
        notion_url: notionUrl,
        last_synced_at: new Date().toISOString(),
        last_sync_status: status,
        last_sync_error: error,
      },
      { onConflict: 'project_id,resource_type,resource_id' },
    );
}

async function notionRequest(path: string, init: RequestInit) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
      ...init.headers,
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.message || `Notion API error (${response.status})`);
  }

  return payload;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
