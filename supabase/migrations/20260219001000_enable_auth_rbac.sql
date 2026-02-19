-- =====================================================
-- AUTH + PROJECT MEMBERSHIP RBAC
-- owner/member model with invite-only compatible RLS
-- =====================================================

BEGIN;

-- -----------------------------
-- Projects ownership
-- -----------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id);

ALTER TABLE public.projects
  ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

DROP INDEX IF EXISTS idx_projects_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_owner_name_unique
  ON public.projects(owner_user_id, name);

-- -----------------------------
-- Project members table
-- -----------------------------
CREATE TABLE IF NOT EXISTS public.project_members (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_members_role_check CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user_id
  ON public.project_members(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_members_single_owner
  ON public.project_members(project_id)
  WHERE role = 'owner';

DROP TRIGGER IF EXISTS project_members_updated_at ON public.project_members;
DROP FUNCTION IF EXISTS public.update_project_members_updated_at();

CREATE OR REPLACE FUNCTION public.update_project_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_members_updated_at
  BEFORE UPDATE ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_members_updated_at();

-- -----------------------------
-- Helper access functions
-- -----------------------------
CREATE OR REPLACE FUNCTION public.is_project_owner(project_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_uuid
      AND p.owner_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(project_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_uuid
      AND (
        p.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.project_members pm
          WHERE pm.project_id = p.id
            AND pm.user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.extract_project_id_from_storage_path(storage_path TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  candidate TEXT;
BEGIN
  candidate := split_part(storage_path, '/', 2);
  IF candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN candidate::UUID;
  END IF;
  RETURN NULL;
END;
$$;

-- -----------------------------
-- Ownership triggers
-- -----------------------------
DROP TRIGGER IF EXISTS ensure_project_owner_membership_trg ON public.projects;
DROP FUNCTION IF EXISTS public.ensure_project_owner_membership();

CREATE OR REPLACE FUNCTION public.ensure_project_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, role, assigned_by)
    VALUES (NEW.id, NEW.owner_user_id, 'owner', NEW.owner_user_id)
    ON CONFLICT (project_id, user_id) DO UPDATE
    SET role = 'owner', updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_project_owner_membership_trg
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_project_owner_membership();

DROP TRIGGER IF EXISTS prevent_non_owner_owner_change_trg ON public.projects;
DROP FUNCTION IF EXISTS public.prevent_non_owner_owner_change();

CREATE OR REPLACE FUNCTION public.prevent_non_owner_owner_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     AND NOT public.is_project_owner(OLD.id) THEN
    RAISE EXCEPTION 'Only project owner can change owner_user_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_non_owner_owner_change_trg
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_non_owner_owner_change();

-- -----------------------------
-- Backfill existing projects to requested owner email
-- -----------------------------
UPDATE public.projects p
SET owner_user_id = u.id
FROM auth.users u
WHERE p.owner_user_id IS NULL
  AND lower(u.email) = lower('conradanguera@gmail.com');

INSERT INTO public.project_members (project_id, user_id, role, assigned_by)
SELECT p.id, p.owner_user_id, 'owner', p.owner_user_id
FROM public.projects p
WHERE p.owner_user_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO UPDATE
SET role = 'owner', updated_at = NOW();

-- -----------------------------
-- Enable RLS + replace demo-open policies
-- -----------------------------
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

-- projects
DROP POLICY IF EXISTS "Demo open read projects" ON public.projects;
DROP POLICY IF EXISTS "Demo open insert projects" ON public.projects;
DROP POLICY IF EXISTS "Demo open update projects" ON public.projects;
DROP POLICY IF EXISTS "Service role full access projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated members can read projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can create own projects" ON public.projects;
DROP POLICY IF EXISTS "Members can update projects" ON public.projects;
DROP POLICY IF EXISTS "Owners can delete projects" ON public.projects;

CREATE POLICY "Authenticated members can read projects"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(id));

CREATE POLICY "Authenticated users can create own projects"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Members can update projects"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project(id))
  WITH CHECK (public.can_access_project(id));

CREATE POLICY "Owners can delete projects"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (public.is_project_owner(id));

CREATE POLICY "Service role full access projects"
  ON public.projects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- project_members
DROP POLICY IF EXISTS "Members can read project memberships" ON public.project_members;
DROP POLICY IF EXISTS "Owners manage project memberships" ON public.project_members;
DROP POLICY IF EXISTS "Service role full access project members" ON public.project_members;

CREATE POLICY "Members can read project memberships"
  ON public.project_members
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Owners manage project memberships"
  ON public.project_members
  FOR ALL
  TO authenticated
  USING (public.is_project_owner(project_id))
  WITH CHECK (public.is_project_owner(project_id));

CREATE POLICY "Service role full access project members"
  ON public.project_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- project_artifacts
DROP POLICY IF EXISTS "Demo open read project artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Demo open insert project artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Demo open update project artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Service role full access project artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Members can read project artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Members can insert project artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Members can update project artifacts" ON public.project_artifacts;
DROP POLICY IF EXISTS "Members can delete project artifacts" ON public.project_artifacts;

CREATE POLICY "Members can read project artifacts"
  ON public.project_artifacts
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Members can insert project artifacts"
  ON public.project_artifacts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can update project artifacts"
  ON public.project_artifacts
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can delete project artifacts"
  ON public.project_artifacts
  FOR DELETE
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Service role full access project artifacts"
  ON public.project_artifacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- project_documents
DROP POLICY IF EXISTS "Demo open read project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Demo open insert project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Demo open update project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Demo open delete project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Service role full access project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Members can read project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Members can insert project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Members can update project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Members can delete project documents" ON public.project_documents;

CREATE POLICY "Members can read project documents"
  ON public.project_documents
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Members can insert project documents"
  ON public.project_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can update project documents"
  ON public.project_documents
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can delete project documents"
  ON public.project_documents
  FOR DELETE
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Service role full access project documents"
  ON public.project_documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- storage.objects for project-documents bucket
DROP POLICY IF EXISTS "Demo open read project-documents objects" ON storage.objects;
DROP POLICY IF EXISTS "Demo open insert project-documents objects" ON storage.objects;
DROP POLICY IF EXISTS "Demo open update project-documents objects" ON storage.objects;
DROP POLICY IF EXISTS "Demo open delete project-documents objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can read project document objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can insert project document objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can update project document objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete project document objects" ON storage.objects;

CREATE POLICY "Members can read project document objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.can_access_project(public.extract_project_id_from_storage_path(name))
  );

CREATE POLICY "Members can insert project document objects"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND public.can_access_project(public.extract_project_id_from_storage_path(name))
  );

CREATE POLICY "Members can update project document objects"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.can_access_project(public.extract_project_id_from_storage_path(name))
  )
  WITH CHECK (
    bucket_id = 'project-documents'
    AND public.can_access_project(public.extract_project_id_from_storage_path(name))
  );

CREATE POLICY "Members can delete project document objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.can_access_project(public.extract_project_id_from_storage_path(name))
  );

-- Base grants for authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_artifacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

COMMIT;
