-- Demo-ready migration for PM Console
-- Creates tables, RLS policies, helper views, and demo data
-- Uses standard PostgreSQL functions only (no Altan-specific dependencies)

BEGIN;

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- PROJECTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted'))
);

-- Enable RLS on projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Demo-open RLS policies (replace with Firebase auth later)
CREATE POLICY "Allow anonymous read access to projects"
  ON projects FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to projects"
  ON projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anonymous insert to projects"
  ON projects FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated insert to projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update to projects"
  ON projects FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update to projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- PROJECT_ARTIFACTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS project_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK (
    artifact_type IN (
      'meeting_intelligence',
      'product_documentation',
      'release_communications',
      'prioritization',
      'pm_advisor_feedback'
    )
  ),
  artifact_name TEXT NOT NULL,
  output_data TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  advisor_feedback TEXT,
  advisor_reviewed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted'))
);

-- Create index on project_id for faster queries
CREATE INDEX IF NOT EXISTS idx_project_artifacts_project_id 
  ON project_artifacts(project_id);

-- Create index on artifact_type for filtering
CREATE INDEX IF NOT EXISTS idx_project_artifacts_type 
  ON project_artifacts(artifact_type);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_project_artifacts_created_at 
  ON project_artifacts(created_at DESC);

-- Enable RLS on project_artifacts
ALTER TABLE project_artifacts ENABLE ROW LEVEL SECURITY;

-- Demo-open RLS policies (replace with Firebase auth later)
CREATE POLICY "Allow anonymous read access to artifacts"
  ON project_artifacts FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to artifacts"
  ON project_artifacts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anonymous insert to artifacts"
  ON project_artifacts FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated insert to artifacts"
  ON project_artifacts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update to artifacts"
  ON project_artifacts FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update to artifacts"
  ON project_artifacts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View for latest artifacts by type
CREATE OR REPLACE VIEW project_artifacts_latest AS
SELECT DISTINCT ON (project_id, artifact_type)
  *
FROM project_artifacts
WHERE status = 'active'
ORDER BY project_id, artifact_type, created_at DESC;

-- View for artifacts with PM advisor review
CREATE OR REPLACE VIEW project_artifacts_reviewed AS
SELECT *
FROM project_artifacts
WHERE advisor_feedback IS NOT NULL
  AND status = 'active'
ORDER BY advisor_reviewed_at DESC;

-- =====================================================
-- DEMO DATA SEED
-- =====================================================

-- Insert demo project (using fixed UUID for reproducibility)
INSERT INTO projects (id, name, description, status)
VALUES (
  'd0f0c464-46bc-4c91-8882-57a401f06c71',
  'Product Manager Console',
  'Demo project for PM Console with sample artifacts',
  'active'
)
ON CONFLICT (id) DO UPDATE
SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

-- =====================================================
-- POSTGREST PERMISSIONS FUNCTION
-- =====================================================

-- Function to refresh PostgREST schema cache
-- Call this after schema changes to expose new tables/columns
CREATE OR REPLACE FUNCTION apply_postgrest_permissions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Grant usage on schema
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  
  -- Grant access to tables
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
  
  -- Grant access to sequences
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
  
  -- Grant access to functions
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
  
  -- Notify PostgREST to reload schema cache
  NOTIFY pgrst, 'reload schema';
  
  RAISE NOTICE 'PostgREST permissions applied and schema cache reloaded';
END;
$$;

-- Apply permissions immediately
SELECT apply_postgrest_permissions();

COMMIT;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Uncomment to verify setup:
-- SELECT * FROM projects;
-- SELECT * FROM project_artifacts;
-- SELECT * FROM project_artifacts_latest;
-- SELECT * FROM project_artifacts_reviewed;
