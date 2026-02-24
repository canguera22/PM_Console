BEGIN;

CREATE OR REPLACE FUNCTION public.assign_project_member_by_email(
  p_project_id UUID,
  p_email TEXT,
  p_role TEXT DEFAULT 'member'
)
RETURNS TABLE (
  project_id UUID,
  user_id UUID,
  email TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
  target_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_role NOT IN ('member', 'owner') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF NOT public.is_project_owner(p_project_id) THEN
    RAISE EXCEPTION 'Only project owners can assign members';
  END IF;

  SELECT u.id, u.email
  INTO target_user_id, target_email
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found for email %', p_email;
  END IF;

  INSERT INTO public.project_members (project_id, user_id, role, assigned_by)
  VALUES (p_project_id, target_user_id, p_role, auth.uid())
  ON CONFLICT ON CONSTRAINT project_members_pkey DO UPDATE
  SET
    role = EXCLUDED.role,
    assigned_by = EXCLUDED.assigned_by,
    updated_at = NOW();

  RETURN QUERY
  SELECT p_project_id, target_user_id, target_email, p_role;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_project_member_by_email(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_project_member_by_email(UUID, TEXT, TEXT) TO authenticated;

COMMIT;
