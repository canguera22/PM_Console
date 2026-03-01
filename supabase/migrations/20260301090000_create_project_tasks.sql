BEGIN;

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  related_module TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  completed_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  updated_by_user_id UUID REFERENCES auth.users(id),
  updated_by_email TEXT,
  CONSTRAINT project_tasks_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT project_tasks_related_module_check CHECK (
    related_module IS NULL OR related_module IN (
      'meeting_intelligence',
      'product_documentation',
      'release_communications',
      'prioritization'
    )
  ),
  CONSTRAINT project_tasks_status_check CHECK (status IN ('open', 'completed', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id
  ON public.project_tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_status
  ON public.project_tasks(project_id, status);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_due_date
  ON public.project_tasks(project_id, due_date);

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read project tasks" ON public.project_tasks;
DROP POLICY IF EXISTS "Members can insert project tasks" ON public.project_tasks;
DROP POLICY IF EXISTS "Members can update project tasks" ON public.project_tasks;
DROP POLICY IF EXISTS "Members can delete project tasks" ON public.project_tasks;
DROP POLICY IF EXISTS "Service role full access project tasks" ON public.project_tasks;

CREATE POLICY "Members can read project tasks"
  ON public.project_tasks
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Members can insert project tasks"
  ON public.project_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can update project tasks"
  ON public.project_tasks
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can delete project tasks"
  ON public.project_tasks
  FOR DELETE
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Service role full access project tasks"
  ON public.project_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_tasks TO authenticated;

DROP TRIGGER IF EXISTS set_project_task_audit_fields_trg ON public.project_tasks;
DROP FUNCTION IF EXISTS public.set_project_task_audit_fields();

CREATE OR REPLACE FUNCTION public.set_project_task_audit_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by_user_id IS NULL THEN
      NEW.created_by_user_id := auth.uid();
    END IF;

    IF NEW.created_by_email IS NULL OR btrim(NEW.created_by_email) = '' THEN
      NEW.created_by_email := COALESCE(auth.jwt() ->> 'email', NEW.created_by_email);
    END IF;
  END IF;

  IF NEW.updated_by_user_id IS NULL OR TG_OP = 'UPDATE' THEN
    NEW.updated_by_user_id := COALESCE(auth.uid(), NEW.updated_by_user_id);
  END IF;

  IF NEW.updated_by_email IS NULL OR btrim(NEW.updated_by_email) = '' OR TG_OP = 'UPDATE' THEN
    NEW.updated_by_email := COALESCE(auth.jwt() ->> 'email', NEW.updated_by_email);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    ELSIF NEW.status = 'open' THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_project_task_audit_fields_trg
  BEFORE INSERT OR UPDATE ON public.project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_task_audit_fields();

COMMIT;
