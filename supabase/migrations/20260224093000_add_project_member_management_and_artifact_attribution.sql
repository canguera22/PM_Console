BEGIN;

-- -----------------------------
-- Project member management RPCs (owner-only)
-- -----------------------------

CREATE OR REPLACE FUNCTION public.list_project_members(p_project_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_project_owner(p_project_id) THEN
    RAISE EXCEPTION 'Only project owners can view project members';
  END IF;

  RETURN QUERY
  SELECT pm.user_id, u.email, pm.role, pm.created_at
  FROM public.project_members pm
  JOIN auth.users u ON u.id = pm.user_id
  WHERE pm.project_id = p_project_id
  ORDER BY
    CASE WHEN pm.role = 'owner' THEN 0 ELSE 1 END,
    lower(u.email);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_project_member(
  p_project_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_owner_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_project_owner(p_project_id) THEN
    RAISE EXCEPTION 'Only project owners can remove members';
  END IF;

  SELECT p.owner_user_id
  INTO project_owner_id
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF project_owner_id IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  IF p_user_id = project_owner_id THEN
    RAISE EXCEPTION 'Cannot remove the project owner';
  END IF;

  DELETE FROM public.project_members pm
  WHERE pm.project_id = p_project_id
    AND pm.user_id = p_user_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.list_project_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_project_members(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_project_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_project_member(UUID, UUID) TO authenticated;

-- -----------------------------
-- Artifact attribution columns
-- -----------------------------

ALTER TABLE public.project_artifacts
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_by_email TEXT;

ALTER TABLE public.project_artifacts
  ALTER COLUMN created_by_user_id SET DEFAULT auth.uid();

DROP TRIGGER IF EXISTS set_project_artifact_created_by_trg ON public.project_artifacts;
DROP FUNCTION IF EXISTS public.set_project_artifact_created_by();

CREATE OR REPLACE FUNCTION public.set_project_artifact_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := auth.uid();
  END IF;

  IF NEW.created_by_email IS NULL OR btrim(NEW.created_by_email) = '' THEN
    NEW.created_by_email := COALESCE(auth.jwt() ->> 'email', NEW.created_by_email);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_project_artifact_created_by_trg
  BEFORE INSERT ON public.project_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_artifact_created_by();

COMMIT;
