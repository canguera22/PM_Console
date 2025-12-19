-- =====================================================
-- PROJECT ARTIFACTS TABLE
-- Centralized storage for all agent outputs
-- Migration Date: 2025-01-18
-- =====================================================

BEGIN;

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.project_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Project association
  project_id UUID NOT NULL,
  project_name TEXT NOT NULL,

  -- Artifact metadata
  artifact_type TEXT NOT NULL,
  artifact_name TEXT,

  -- Artifact content
  input_data JSONB,
  output_data TEXT,

  -- Module-specific metadata
  metadata JSONB,

  -- PM Advisor feedback
  advisor_feedback TEXT,
  advisor_reviewed_at TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL DEFAULT 'active',

  -- Constraints
  CONSTRAINT artifact_type_check CHECK (
    artifact_type IN (
      'meeting_intelligence',
      'product_documentation',
      'release_communications',
      'prioritization',
      'pm_advisor_feedback'
    )
  ),
  CONSTRAINT status_check CHECK (status IN ('active', 'archived', 'deleted'))
);

-- Ensure FK exists (idempotent-ish approach)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_artifacts_project_id_fkey'
  ) THEN
    ALTER TABLE public.project_artifacts
      ADD CONSTRAINT project_artifacts_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_project_artifacts_project_id
  ON public.project_artifacts(project_id);

CREATE INDEX IF NOT EXISTS idx_project_artifacts_type
  ON public.project_artifacts(artifact_type);

CREATE INDEX IF NOT EXISTS idx_project_artifacts_project_type
  ON public.project_artifacts(project_id, artifact_type);

CREATE INDEX IF NOT EXISTS idx_project_artifacts_created
  ON public.project_artifacts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_artifacts_active
  ON public.project_artifacts(project_id, status)
  WHERE status = 'active';

-- Full-text search index (note: output_data may be NULL)
CREATE INDEX IF NOT EXISTS idx_project_artifacts_output_search
  ON public.project_artifacts USING gin (to_tsvector('english', COALESCE(output_data, '')));

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.project_artifacts ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist (idempotency)
DROP POLICY IF EXISTS "Demo open read project artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Demo open insert project artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Demo open update project artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Service role full access project artifacts" ON public.project_artifacts;

-- Demo-open: allow anon + authenticated to read/insert/update
CREATE POLICY "Demo open read project artifacts"
  ON public.project_artifacts
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Demo open insert project artifacts"
  ON public.project_artifacts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Demo open update project artifacts"
  ON public.project_artifacts
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Service role: full access (edge functions)
CREATE POLICY "Service role full access project artifacts"
  ON public.project_artifacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- TRIGGERS
-- =====================================================
DROP TRIGGER IF EXISTS project_artifacts_updated_at ON public.project_artifacts;
DROP FUNCTION IF EXISTS public.update_project_artifacts_updated_at();

CREATE OR REPLACE FUNCTION public.update_project_artifacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_artifacts_updated_at
  BEFORE UPDATE ON public.project_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_artifacts_updated_at();

-- =====================================================
-- HELPER VIEWS
-- =====================================================
DROP VIEW IF EXISTS public.project_artifacts_latest;
DROP VIEW IF EXISTS public.project_artifacts_reviewed;

-- Latest artifact per (project_id, artifact_type)
CREATE OR REPLACE VIEW public.project_artifacts_latest AS
SELECT DISTINCT ON (project_id, artifact_type)
  id,
  created_at,
  updated_at,
  project_id,
  project_name,
  artifact_type,
  artifact_name,
  input_data,
  output_data,
  metadata,
  advisor_feedback,
  advisor_reviewed_at,
  status
FROM public.project_artifacts
WHERE status = 'active'
ORDER BY project_id, artifact_type, created_at DESC;

-- Artifacts that have advisor feedback
CREATE OR REPLACE VIEW public.project_artifacts_reviewed AS
SELECT *
FROM public.project_artifacts
WHERE advisor_feedback IS NOT NULL
  AND status = 'active'
ORDER BY advisor_reviewed_at DESC;

-- =====================================================
-- GRANTS (demo-open)
-- =====================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.project_artifacts
TO anon, authenticated;

-- Views need explicit grants too in some setups
GRANT SELECT ON TABLE public.project_artifacts_latest TO anon, authenticated;
GRANT SELECT ON TABLE public.project_artifacts_reviewed TO anon, authenticated;

COMMIT;
