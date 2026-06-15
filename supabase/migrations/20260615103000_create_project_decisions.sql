BEGIN;

CREATE TABLE IF NOT EXISTS public.project_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_artifact_id UUID REFERENCES public.project_artifacts(id) ON DELETE CASCADE,
  source_artifact_type TEXT,
  source_artifact_name TEXT,
  decision_text TEXT NOT NULL,
  decision_summary TEXT,
  decision_maker TEXT,
  source_evidence TEXT,
  confidence TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT project_decisions_text_not_blank CHECK (btrim(decision_text) <> ''),
  CONSTRAINT project_decisions_confidence_check CHECK (
    confidence IS NULL OR confidence IN ('high', 'medium', 'low')
  ),
  CONSTRAINT project_decisions_status_check CHECK (
    status IN ('active', 'superseded', 'archived')
  )
);

CREATE INDEX IF NOT EXISTS idx_project_decisions_project_id
  ON public.project_decisions(project_id);

CREATE INDEX IF NOT EXISTS idx_project_decisions_project_status
  ON public.project_decisions(project_id, status);

CREATE INDEX IF NOT EXISTS idx_project_decisions_source_artifact_id
  ON public.project_decisions(source_artifact_id);

ALTER TABLE public.project_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read project decisions" ON public.project_decisions;
DROP POLICY IF EXISTS "Members can insert project decisions" ON public.project_decisions;
DROP POLICY IF EXISTS "Members can update project decisions" ON public.project_decisions;
DROP POLICY IF EXISTS "Members can delete project decisions" ON public.project_decisions;
DROP POLICY IF EXISTS "Service role full access project decisions" ON public.project_decisions;

CREATE POLICY "Members can read project decisions"
  ON public.project_decisions
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Members can insert project decisions"
  ON public.project_decisions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can update project decisions"
  ON public.project_decisions
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can delete project decisions"
  ON public.project_decisions
  FOR DELETE
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Service role full access project decisions"
  ON public.project_decisions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_decisions TO authenticated;

DROP TRIGGER IF EXISTS set_project_decisions_updated_at_trg ON public.project_decisions;
DROP FUNCTION IF EXISTS public.set_project_decisions_updated_at();

CREATE OR REPLACE FUNCTION public.set_project_decisions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_project_decisions_updated_at_trg
  BEFORE UPDATE ON public.project_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_decisions_updated_at();

COMMIT;
