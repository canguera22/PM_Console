-- =====================================================
-- PROJECT ARTIFACTS TABLE
-- Centralized storage for all agent outputs
-- Migration Date: 2025-01-18
-- =====================================================

BEGIN;

-- Create table
CREATE TABLE IF NOT EXISTS project_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Project Association
  project_id INTEGER NOT NULL,
  project_name TEXT NOT NULL,
  
  -- Artifact Metadata
  artifact_type TEXT NOT NULL,
  artifact_name TEXT,
  
  -- Artifact Content
  input_data JSONB,
  output_data TEXT,
  
  -- Module-Specific Metadata
  metadata JSONB,
  
  -- PM Advisor Feedback
  advisor_feedback TEXT,
  advisor_reviewed_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  status TEXT DEFAULT 'active',
  
  -- Constraints
  CONSTRAINT artifact_type_check CHECK (
    artifact_type IN (
      'meeting_intelligence',
      'product_documentation', 
      'release_communications',
      'prioritization',
      'pm_advisor'
    )
  ),
  CONSTRAINT status_check CHECK (status IN ('active', 'archived', 'deleted'))
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_project_artifacts_project_id 
  ON project_artifacts(project_id);

CREATE INDEX IF NOT EXISTS idx_project_artifacts_type 
  ON project_artifacts(artifact_type);

CREATE INDEX IF NOT EXISTS idx_project_artifacts_project_type 
  ON project_artifacts(project_id, artifact_type);

CREATE INDEX IF NOT EXISTS idx_project_artifacts_created 
  ON project_artifacts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_artifacts_active 
  ON project_artifacts(project_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_project_artifacts_output_search 
  ON project_artifacts USING gin(to_tsvector('english', output_data));

-- =====================================================
-- ROW-LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE project_artifacts ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Allow authenticated users to read project artifacts" ON project_artifacts;
DROP POLICY IF EXISTS "Allow authenticated users to insert project artifacts" ON project_artifacts;
DROP POLICY IF EXISTS "Allow authenticated users to update project artifacts" ON project_artifacts;
DROP POLICY IF EXISTS "Allow service role full access to project artifacts" ON project_artifacts;

-- Allow all authenticated users to read
CREATE POLICY "Allow authenticated users to read project artifacts"
  ON project_artifacts
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert
CREATE POLICY "Allow authenticated users to insert project artifacts"
  ON project_artifacts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update
CREATE POLICY "Allow authenticated users to update project artifacts"
  ON project_artifacts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow service role full access (for edge functions)
CREATE POLICY "Allow service role full access to project artifacts"
  ON project_artifacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- TRIGGERS
-- =====================================================
-- Drop function if exists (for idempotency)
DROP TRIGGER IF EXISTS project_artifacts_updated_at ON project_artifacts;
DROP FUNCTION IF EXISTS update_project_artifacts_updated_at();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_project_artifacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_artifacts_updated_at
  BEFORE UPDATE ON project_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_project_artifacts_updated_at();

-- =====================================================
-- HELPER VIEWS
-- =====================================================
DROP VIEW IF EXISTS project_artifacts_latest;
DROP VIEW IF EXISTS project_artifacts_reviewed;

-- View for latest artifacts per project per type
CREATE OR REPLACE VIEW project_artifacts_latest AS
SELECT DISTINCT ON (project_id, artifact_type)
  id,
  created_at,
  project_id,
  project_name,
  artifact_type,
  artifact_name,
  output_data,
  metadata,
  advisor_feedback,
  advisor_reviewed_at,
  status
FROM project_artifacts
WHERE status = 'active'
ORDER BY project_id, artifact_type, created_at DESC;

-- View for artifacts with advisor feedback
CREATE OR REPLACE VIEW project_artifacts_reviewed AS
SELECT *
FROM project_artifacts
WHERE advisor_feedback IS NOT NULL
  AND status = 'active'
ORDER BY advisor_reviewed_at DESC;

-- =====================================================
-- APPLY POSTGREST PERMISSIONS
-- =====================================================
SELECT apply_postgrest_permissions();

COMMIT;
