import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractDrawingTextFromXml(xml: string): string {
  const matches = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)];
  return matches
    .map((match) => decodeXmlEntities(match[1] ?? '').trim())
    .filter((segment) => segment.length > 0)
    .join('\n');
}

export async function extractTextFromFile(file: File): Promise<{
  text: string;
  metadata: Record<string, any>;
}> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  // TXT / MD
  if (extension === 'txt' || extension === 'md' || extension === 'csv') {
    const text = await file.text();
    const lineCount = text ? text.split(/\r?\n/).length : 0;
    return {
      text,
      metadata: {
        type: extension,
        length: text.length,
        line_count: lineCount,
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

  if (extension === 'xlsx' || extension === 'xls') {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetNames = workbook.SheetNames || [];

    const parts: string[] = [];
    let totalRows = 0;

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const csv = XLSX.utils.sheet_to_csv(sheet);
      const rows = csv ? csv.split(/\r?\n/).filter((line) => line.trim().length > 0) : [];
      totalRows += rows.length;

      parts.push(`## Sheet: ${sheetName}\n${csv}`.trim());
    }

    const text = parts.join('\n\n').trim();

    return {
      text,
      metadata: {
        type: extension,
        sheet_count: sheetNames.length,
        sheet_names: sheetNames,
        row_count: totalRows,
        length: text.length,
      },
    };
  }

  if (extension === 'pptx') {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const allEntries = Object.keys(zip.files);

    const slideFiles = allEntries
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort((a, b) => {
        const aNum = Number(a.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
        const bNum = Number(b.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
        return aNum - bNum;
      });

    const noteFilesByIndex = new Map<number, string>();
    for (const path of allEntries) {
      const match = path.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/i);
      if (match) {
        noteFilesByIndex.set(Number(match[1]), path);
      }
    }

    const slideParts: string[] = [];
    let notesCount = 0;

    for (const slidePath of slideFiles) {
      const slideIndex = Number(slidePath.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
      const slideXml = await zip.file(slidePath)?.async('text');
      if (!slideXml) continue;

      const slideText = extractDrawingTextFromXml(slideXml);
      let notesText = '';

      const notesPath = noteFilesByIndex.get(slideIndex);
      if (notesPath) {
        const notesXml = await zip.file(notesPath)?.async('text');
        if (notesXml) {
          notesText = extractDrawingTextFromXml(notesXml);
          if (notesText.trim()) notesCount += 1;
        }
      }

      const sectionLines = [`## Slide ${slideIndex}`];
      if (slideText.trim()) {
        sectionLines.push(slideText.trim());
      } else {
        sectionLines.push('[No text content found]');
      }

      if (notesText.trim()) {
        sectionLines.push('\n### Notes');
        sectionLines.push(notesText.trim());
      }

      slideParts.push(sectionLines.join('\n'));
    }

    const text = slideParts.join('\n\n').trim();

    return {
      text,
      metadata: {
        type: 'pptx',
        slide_count: slideFiles.length,
        notes_count: notesCount,
        length: text.length,
      },
    };
  }

  throw new Error('Unsupported file type');
}
