-- =====================================================
-- PROJECTS TABLE (UUID)
-- Demo-open for now (anon + authenticated)
-- =====================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB,

  CONSTRAINT projects_status_check CHECK (status IN ('active', 'archived', 'deleted'))
);

-- Helpful indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_unique ON public.projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);

-- updated_at trigger
DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
DROP FUNCTION IF EXISTS public.update_projects_updated_at();

CREATE OR REPLACE FUNCTION public.update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_projects_updated_at();

-- RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Demo open read projects" ON public.projects;
DROP POLICY IF EXISTS "Demo open insert projects" ON public.projects;
DROP POLICY IF EXISTS "Demo open update projects" ON public.projects;
DROP POLICY IF EXISTS "Service role full access projects" ON public.projects;

CREATE POLICY "Demo open read projects"
  ON public.projects
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Demo open insert projects"
  ON public.projects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Demo open update projects"
  ON public.projects
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access projects"
  ON public.projects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grants (demo-open)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO anon, authenticated;

-- Seed default "Ad-hoc" project (idempotent)
INSERT INTO public.projects (id, name, description, status)
VALUES (gen_random_uuid(), 'Ad-hoc', 'Default project', 'active')
ON CONFLICT (name) DO NOTHING;

COMMIT;
