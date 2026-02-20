import { supabase } from '@/lib/supabase';
import { extractTextFromFile } from '@/lib/documentExtraction';

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
  let extractedText: string | null = null;
  let extractionMetadata: Record<string, unknown> = {};

  try {
    const extraction = await extractTextFromFile(file);
    extractedText = extraction.text ?? null;
    extractionMetadata = extraction.metadata ?? {};
  } catch (extractionError: any) {
    console.warn('⚠️ Document text extraction skipped/failed', {
      name: file.name,
      reason: extractionError?.message ?? 'Unknown extraction error',
    });
    extractionMetadata = {
      extraction_error: extractionError?.message ?? 'Failed to extract text',
    };
  }

  const baseMetadata = {
    file_name: file.name,
    file_size_bytes: file.size,
    mime_type: file.type || null,
    extension: file.name.split('.').pop()?.toLowerCase() ?? null,
  };

  const { error: updateError } = await supabase
    .from('project_documents')
    .update({
      storage_path: storagePath,
      extracted_text: extractedText,
      metadata: {
        ...baseMetadata,
        ...extractionMetadata,
      },
    })
    .eq('id', docRow.id);

  if (updateError) {
    console.error('❌ Failed to persist extracted document data:', updateError);
    throw updateError;
  }

  return docRow;
}
