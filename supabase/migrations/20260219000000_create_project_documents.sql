-- =====================================================
-- PROJECT DOCUMENTS + STORAGE BUCKET
-- Supports context uploads for all PM modules
-- =====================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document_type TEXT,
  doc_type TEXT,
  storage_path TEXT,
  extracted_text TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  CONSTRAINT project_documents_status_check CHECK (status IN ('active', 'archived', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_project_documents_project_id
  ON public.project_documents(project_id);

CREATE INDEX IF NOT EXISTS idx_project_documents_status
  ON public.project_documents(project_id, status);

DROP TRIGGER IF EXISTS project_documents_updated_at ON public.project_documents;
DROP FUNCTION IF EXISTS public.update_project_documents_updated_at();

CREATE OR REPLACE FUNCTION public.update_project_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_documents_updated_at
  BEFORE UPDATE ON public.project_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_documents_updated_at();

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Demo open read project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Demo open insert project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Demo open update project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Demo open delete project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Service role full access project documents" ON public.project_documents;

CREATE POLICY "Demo open read project documents"
  ON public.project_documents
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Demo open insert project documents"
  ON public.project_documents
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Demo open update project documents"
  ON public.project_documents
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Demo open delete project documents"
  ON public.project_documents
  FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role full access project documents"
  ON public.project_documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_documents TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Demo open read project-documents objects" ON storage.objects;
DROP POLICY IF EXISTS "Demo open insert project-documents objects" ON storage.objects;
DROP POLICY IF EXISTS "Demo open update project-documents objects" ON storage.objects;
DROP POLICY IF EXISTS "Demo open delete project-documents objects" ON storage.objects;

CREATE POLICY "Demo open read project-documents objects"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'project-documents');

CREATE POLICY "Demo open insert project-documents objects"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'project-documents');

CREATE POLICY "Demo open update project-documents objects"
  ON storage.objects
  FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'project-documents')
  WITH CHECK (bucket_id = 'project-documents');

CREATE POLICY "Demo open delete project-documents objects"
  ON storage.objects
  FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'project-documents');

COMMIT;

