import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

export async function extractTextFromFile(file: File): Promise<{
  text: string;
  metadata: Record<string, any>;
}> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  // TXT / MD
  if (extension === 'txt' || extension === 'md') {
    const text = await file.text();
    return {
      text,
      metadata: {
        type: extension,
        length: text.length,
      },
    };
  }

  // PDF
  if (extension === 'pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((item: any) => item.str).join(' ') + '\n';
    }

    return {
      text: fullText,
      metadata: {
        type: 'pdf',
        pages: pdf.numPages,
        length: fullText.length,
      },
    };
  }

  // DOCX
  if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });

    return {
      text: result.value,
      metadata: {
        type: 'docx',
        length: result.value.length,
      },
    };
  }

  throw new Error('Unsupported file type');
}
