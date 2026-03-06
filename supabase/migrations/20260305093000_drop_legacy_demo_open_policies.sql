BEGIN;

-- Remove legacy demo-open policies that may remain from early bootstrap migrations.
DROP POLICY IF EXISTS "Allow anonymous read access to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow authenticated read access to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow anonymous insert to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow authenticated insert to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow anonymous update to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow authenticated update to projects" ON public.projects;

DROP POLICY IF EXISTS "Allow anonymous read access to artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Allow authenticated read access to artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Allow anonymous insert to artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Allow authenticated insert to artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Allow anonymous update to artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Allow authenticated update to artifacts" ON public.project_artifacts;

COMMIT;
