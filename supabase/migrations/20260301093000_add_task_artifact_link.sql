BEGIN;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS completed_artifact_id UUID REFERENCES public.project_artifacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_artifact_type TEXT;

ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_completed_artifact_type_check;

ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_completed_artifact_type_check CHECK (
    completed_artifact_type IS NULL OR completed_artifact_type IN (
      'meeting_intelligence',
      'product_documentation',
      'release_communications',
      'prioritization'
    )
  );

COMMIT;
