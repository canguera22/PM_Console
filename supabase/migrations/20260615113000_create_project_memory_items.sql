BEGIN;

CREATE TABLE IF NOT EXISTS public.project_memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_artifact_id UUID REFERENCES public.project_artifacts(id) ON DELETE CASCADE,
  source_artifact_type TEXT,
  source_artifact_name TEXT,
  item_type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  owner_or_source TEXT,
  source_evidence TEXT,
  confidence TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT project_memory_items_type_check CHECK (
    item_type IN ('open_question', 'assumption')
  ),
  CONSTRAINT project_memory_items_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT project_memory_items_confidence_check CHECK (
    confidence IS NULL OR confidence IN ('high', 'medium', 'low')
  ),
  CONSTRAINT project_memory_items_status_check CHECK (
    status IN ('active', 'resolved', 'archived')
  )
);

CREATE INDEX IF NOT EXISTS idx_project_memory_items_project_id
  ON public.project_memory_items(project_id);

CREATE INDEX IF NOT EXISTS idx_project_memory_items_project_type
  ON public.project_memory_items(project_id, item_type, status);

CREATE INDEX IF NOT EXISTS idx_project_memory_items_source_artifact_id
  ON public.project_memory_items(source_artifact_id);

ALTER TABLE public.project_memory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read project memory items" ON public.project_memory_items;
DROP POLICY IF EXISTS "Members can insert project memory items" ON public.project_memory_items;
DROP POLICY IF EXISTS "Members can update project memory items" ON public.project_memory_items;
DROP POLICY IF EXISTS "Members can delete project memory items" ON public.project_memory_items;
DROP POLICY IF EXISTS "Service role full access project memory items" ON public.project_memory_items;

CREATE POLICY "Members can read project memory items"
  ON public.project_memory_items
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Members can insert project memory items"
  ON public.project_memory_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can update project memory items"
  ON public.project_memory_items
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can delete project memory items"
  ON public.project_memory_items
  FOR DELETE
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Service role full access project memory items"
  ON public.project_memory_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_memory_items TO authenticated;

DROP TRIGGER IF EXISTS set_project_memory_items_updated_at_trg ON public.project_memory_items;
DROP FUNCTION IF EXISTS public.set_project_memory_items_updated_at();

CREATE OR REPLACE FUNCTION public.set_project_memory_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_project_memory_items_updated_at_trg
  BEFORE UPDATE ON public.project_memory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_memory_items_updated_at();

COMMIT;
