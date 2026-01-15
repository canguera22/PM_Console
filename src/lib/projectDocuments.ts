import { supabase } from '@/lib/supabase';

export async function uploadProjectDocument(
  projectId: string,
  file: File,
  docType?: string
) {
  // 1. Create DB row first
  const { data: docRow, error: insertError } = await supabase
    .from('project_documents')
    .insert({
      project_id: projectId,
      name: file.name,
      doc_type: docType ?? null,
      storage_path: '',
      mime_type: file.type,
      size_bytes: file.size,
      status: 'active',
    })
    .select()
    .single();

  if (insertError || !docRow) {
    throw insertError ?? new Error('Failed to create document record');
  }

  // 2. Upload file to storage
  const storagePath = `projects/${projectId}/${docRow.id}/${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('project-documents')
    .upload(storagePath, file);

  if (uploadError) {
    // rollback DB row
    console.error('❌ Storage upload failed:', uploadError);
    await supabase.from('project_documents').delete().eq('id', docRow.id);
    throw uploadError;
  }

  // 3. Update DB row with storage path
  await supabase
    .from('project_documents')
    .update({ storage_path: storagePath })
    .eq('id', docRow.id);

  return docRow;
}
