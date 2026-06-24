BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.project_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  updated_by_user_id UUID REFERENCES auth.users(id),
  updated_by_email TEXT,
  CONSTRAINT project_features_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT project_features_priority_check CHECK (priority IN ('low', 'medium', 'high')),
  CONSTRAINT project_features_status_check CHECK (status IN ('active', 'archived', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_project_features_project_id
  ON public.project_features(project_id);

CREATE INDEX IF NOT EXISTS idx_project_features_project_status
  ON public.project_features(project_id, status);

CREATE INDEX IF NOT EXISTS idx_project_features_project_priority
  ON public.project_features(project_id, priority);

CREATE TABLE IF NOT EXISTS public.feature_artifacts (
  feature_id UUID NOT NULL REFERENCES public.project_features(id) ON DELETE CASCADE,
  artifact_id UUID NOT NULL REFERENCES public.project_artifacts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'reference',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  PRIMARY KEY (feature_id, artifact_id),
  CONSTRAINT feature_artifacts_role_check CHECK (role IN ('source', 'reference', 'background'))
);

CREATE INDEX IF NOT EXISTS idx_feature_artifacts_project_id
  ON public.feature_artifacts(project_id);

CREATE INDEX IF NOT EXISTS idx_feature_artifacts_artifact_id
  ON public.feature_artifacts(artifact_id);

CREATE TABLE IF NOT EXISTS public.feature_documents (
  feature_id UUID NOT NULL REFERENCES public.project_features(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.project_documents(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'reference',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  PRIMARY KEY (feature_id, document_id),
  CONSTRAINT feature_documents_role_check CHECK (role IN ('source', 'reference', 'background'))
);

CREATE INDEX IF NOT EXISTS idx_feature_documents_project_id
  ON public.feature_documents(project_id);

CREATE INDEX IF NOT EXISTS idx_feature_documents_document_id
  ON public.feature_documents(document_id);

DROP TRIGGER IF EXISTS set_project_feature_audit_fields_trg ON public.project_features;
DROP FUNCTION IF EXISTS public.set_project_feature_audit_fields();
CREATE OR REPLACE FUNCTION public.set_project_feature_audit_fields()
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

  NEW.updated_by_user_id := COALESCE(auth.uid(), NEW.updated_by_user_id);
  NEW.updated_by_email := COALESCE(auth.jwt() ->> 'email', NEW.updated_by_email);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_project_feature_audit_fields_trg
  BEFORE INSERT OR UPDATE ON public.project_features
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_feature_audit_fields();

DROP TRIGGER IF EXISTS set_feature_artifact_audit_fields_trg ON public.feature_artifacts;
DROP TRIGGER IF EXISTS set_feature_document_audit_fields_trg ON public.feature_documents;
DROP FUNCTION IF EXISTS public.set_feature_link_audit_fields();
CREATE OR REPLACE FUNCTION public.set_feature_link_audit_fields()
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

CREATE TRIGGER set_feature_artifact_audit_fields_trg
  BEFORE INSERT ON public.feature_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_feature_link_audit_fields();

CREATE TRIGGER set_feature_document_audit_fields_trg
  BEFORE INSERT ON public.feature_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_feature_link_audit_fields();

DROP TRIGGER IF EXISTS validate_feature_artifact_project_trg ON public.feature_artifacts;
DROP FUNCTION IF EXISTS public.validate_feature_artifact_project();
CREATE OR REPLACE FUNCTION public.validate_feature_artifact_project()
RETURNS TRIGGER AS $$
DECLARE
  feature_project UUID;
  artifact_project UUID;
BEGIN
  SELECT project_id INTO feature_project
  FROM public.project_features
  WHERE id = NEW.feature_id;

  SELECT project_id INTO artifact_project
  FROM public.project_artifacts
  WHERE id = NEW.artifact_id;

  IF feature_project IS NULL OR artifact_project IS NULL THEN
    RAISE EXCEPTION 'Feature and artifact are required';
  END IF;

  IF NEW.project_id IS DISTINCT FROM feature_project OR NEW.project_id IS DISTINCT FROM artifact_project THEN
    RAISE EXCEPTION 'Feature and artifact must belong to the same project';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_feature_artifact_project_trg
  BEFORE INSERT OR UPDATE ON public.feature_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_feature_artifact_project();

DROP TRIGGER IF EXISTS validate_feature_document_project_trg ON public.feature_documents;
DROP FUNCTION IF EXISTS public.validate_feature_document_project();
CREATE OR REPLACE FUNCTION public.validate_feature_document_project()
RETURNS TRIGGER AS $$
DECLARE
  feature_project UUID;
  document_project UUID;
BEGIN
  SELECT project_id INTO feature_project
  FROM public.project_features
  WHERE id = NEW.feature_id;

  SELECT project_id INTO document_project
  FROM public.project_documents
  WHERE id = NEW.document_id;

  IF feature_project IS NULL OR document_project IS NULL THEN
    RAISE EXCEPTION 'Feature and document are required';
  END IF;

  IF NEW.project_id IS DISTINCT FROM feature_project OR NEW.project_id IS DISTINCT FROM document_project THEN
    RAISE EXCEPTION 'Feature and document must belong to the same project';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_feature_document_project_trg
  BEFORE INSERT OR UPDATE ON public.feature_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_feature_document_project();

ALTER TABLE public.project_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read project features" ON public.project_features;
DROP POLICY IF EXISTS "Members can insert project features" ON public.project_features;
DROP POLICY IF EXISTS "Members can update project features" ON public.project_features;
DROP POLICY IF EXISTS "Members can delete project features" ON public.project_features;
DROP POLICY IF EXISTS "Service role full access project features" ON public.project_features;

CREATE POLICY "Members can read project features"
  ON public.project_features
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Members can insert project features"
  ON public.project_features
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can update project features"
  ON public.project_features
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can delete project features"
  ON public.project_features
  FOR DELETE
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Service role full access project features"
  ON public.project_features
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Members can read feature artifacts" ON public.feature_artifacts;
DROP POLICY IF EXISTS "Members can insert feature artifacts" ON public.feature_artifacts;
DROP POLICY IF EXISTS "Members can update feature artifacts" ON public.feature_artifacts;
DROP POLICY IF EXISTS "Members can delete feature artifacts" ON public.feature_artifacts;
DROP POLICY IF EXISTS "Service role full access feature artifacts" ON public.feature_artifacts;

CREATE POLICY "Members can read feature artifacts"
  ON public.feature_artifacts
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Members can insert feature artifacts"
  ON public.feature_artifacts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can update feature artifacts"
  ON public.feature_artifacts
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can delete feature artifacts"
  ON public.feature_artifacts
  FOR DELETE
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Service role full access feature artifacts"
  ON public.feature_artifacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Members can read feature documents" ON public.feature_documents;
DROP POLICY IF EXISTS "Members can insert feature documents" ON public.feature_documents;
DROP POLICY IF EXISTS "Members can update feature documents" ON public.feature_documents;
DROP POLICY IF EXISTS "Members can delete feature documents" ON public.feature_documents;
DROP POLICY IF EXISTS "Service role full access feature documents" ON public.feature_documents;

CREATE POLICY "Members can read feature documents"
  ON public.feature_documents
  FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Members can insert feature documents"
  ON public.feature_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can update feature documents"
  ON public.feature_documents
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Members can delete feature documents"
  ON public.feature_documents
  FOR DELETE
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Service role full access feature documents"
  ON public.feature_documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_features TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feature_artifacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feature_documents TO authenticated;

COMMIT;
