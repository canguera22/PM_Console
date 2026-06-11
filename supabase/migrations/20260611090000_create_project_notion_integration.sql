BEGIN;

CREATE TABLE IF NOT EXISTS public.project_notion_configs (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notion_parent_page_id TEXT,
  notion_tasks_data_source_id TEXT,
  sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_exported_at TIMESTAMPTZ,
  last_export_status TEXT,
  last_export_error TEXT,
  CONSTRAINT project_notion_configs_status_check CHECK (
    last_export_status IS NULL OR last_export_status IN ('success', 'partial_success', 'failed')
  )
);

CREATE TABLE IF NOT EXISTS public.notion_sync_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  notion_page_id TEXT NOT NULL,
  notion_url TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_status TEXT NOT NULL DEFAULT 'success',
  last_sync_error TEXT,
  CONSTRAINT notion_sync_mappings_resource_type_check CHECK (
    resource_type IN ('task', 'artifact')
  ),
  CONSTRAINT notion_sync_mappings_status_check CHECK (
    last_sync_status IN ('success', 'failed')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notion_sync_mappings_resource_unique
  ON public.notion_sync_mappings(project_id, resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_notion_sync_mappings_project_id
  ON public.notion_sync_mappings(project_id);

ALTER TABLE public.project_notion_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_sync_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read project notion configs" ON public.project_notion_configs;
DROP POLICY IF EXISTS "Members can insert project notion configs" ON public.project_notion_configs;
DROP POLICY IF EXISTS "Members can update project notion configs" ON public.project_notion_configs;
DROP POLICY IF EXISTS "Service role full access project notion configs" ON public.project_notion_configs;

CREATE POLICY "Members can read project notion configs"
  ON public.project_notion_configs
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Members can insert project notion configs"
  ON public.project_notion_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can update project notion configs"
  ON public.project_notion_configs
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Service role full access project notion configs"
  ON public.project_notion_configs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Members can read notion sync mappings" ON public.notion_sync_mappings;
DROP POLICY IF EXISTS "Members can insert notion sync mappings" ON public.notion_sync_mappings;
DROP POLICY IF EXISTS "Members can update notion sync mappings" ON public.notion_sync_mappings;
DROP POLICY IF EXISTS "Service role full access notion sync mappings" ON public.notion_sync_mappings;

CREATE POLICY "Members can read notion sync mappings"
  ON public.notion_sync_mappings
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Members can insert notion sync mappings"
  ON public.notion_sync_mappings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can update notion sync mappings"
  ON public.notion_sync_mappings
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Service role full access notion sync mappings"
  ON public.notion_sync_mappings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.project_notion_configs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notion_sync_mappings TO authenticated;

DROP TRIGGER IF EXISTS set_project_notion_configs_updated_at_trg ON public.project_notion_configs;
DROP TRIGGER IF EXISTS set_notion_sync_mappings_updated_at_trg ON public.notion_sync_mappings;
DROP FUNCTION IF EXISTS public.set_notion_integration_updated_at();

CREATE OR REPLACE FUNCTION public.set_notion_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_project_notion_configs_updated_at_trg
  BEFORE UPDATE ON public.project_notion_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_notion_integration_updated_at();

CREATE TRIGGER set_notion_sync_mappings_updated_at_trg
  BEFORE UPDATE ON public.notion_sync_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_notion_integration_updated_at();

COMMIT;
