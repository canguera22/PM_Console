interface WordExportInput {
  title: string;
  content: string;
  projectName?: string | null;
  moduleLabel?: string | null;
  createdAt?: string | null;
}

export function downloadWordDocument({
  title,
  content,
  projectName,
  moduleLabel,
  createdAt,
}: WordExportInput) {
  const documentTitle = title?.trim() || 'Product Workbench Artifact';
  const html = buildWordHtml({
    title: documentTitle,
    content,
    projectName,
    moduleLabel,
    createdAt,
  });
  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(documentTitle)}.doc`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildWordHtml(input: Required<Pick<WordExportInput, 'title'>> & WordExportInput) {
  const metadata = [
    input.projectName ? `Project: ${input.projectName}` : null,
    input.moduleLabel ? `Module: ${input.moduleLabel}` : null,
    input.createdAt ? `Created: ${new Date(input.createdAt).toLocaleString()}` : null,
    `Exported: ${new Date().toLocaleString()}`,
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    body {
      color: #111827;
      font-family: Aptos, Calibri, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      margin: 48px;
    }
    h1 {
      color: #0f172a;
      font-size: 24pt;
      margin: 0 0 8px;
    }
    h2 {
      border-bottom: 1px solid #dbe3ef;
      color: #172554;
      font-size: 16pt;
      margin: 28px 0 10px;
      padding-bottom: 4px;
    }
    h3 {
      color: #1e3a8a;
      font-size: 13pt;
      margin: 20px 0 8px;
    }
    p {
      margin: 8px 0;
    }
    ul, ol {
      margin: 8px 0 12px 24px;
      padding: 0;
    }
    li {
      margin: 4px 0;
    }
    table {
      border-collapse: collapse;
      margin: 14px 0;
      width: 100%;
    }
    th {
      background: #eff6ff;
      color: #172554;
      font-weight: 700;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 9px;
      vertical-align: top;
    }
    blockquote {
      border-left: 4px solid #93c5fd;
      color: #475569;
      margin: 12px 0;
      padding: 4px 0 4px 12px;
    }
    .meta {
      border-bottom: 1px solid #dbe3ef;
      color: #64748b;
      font-size: 9pt;
      margin-bottom: 24px;
      padding-bottom: 14px;
    }
    .brand {
      color: #2563eb;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: .08em;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="brand">Product Workbench</div>
  <h1>${escapeHtml(input.title)}</h1>
  <div class="meta">${metadata.map((item) => `<div>${escapeHtml(item ?? '')}</div>`).join('')}</div>
  ${markdownToHtml(input.content || '')}
</body>
</html>`;
}

function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let tableBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${formatInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    html.push(renderTable(tableBuffer));
    tableBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      closeList();
      flushTable();
      continue;
    }

    if (isTableLine(line)) {
      flushParagraph();
      closeList();
      tableBuffer.push(line);
      continue;
    }

    flushTable();

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length, 3);
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(line)) {
      flushParagraph();
      closeList();
      html.push('<hr />');
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${formatInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${formatInline(ordered[1])}</li>`);
      continue;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${formatInline(quote[1])}</blockquote>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  closeList();
  flushTable();
  return html.join('\n');
}

function renderTable(lines: string[]) {
  const rows = lines
    .filter((line) => !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line))
    .map((line) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
    );

  if (rows.length === 0) return '';

  const [header, ...body] = rows;
  return `<table>
    <thead><tr>${header.map((cell) => `<th>${formatInline(cell)}</th>`).join('')}</tr></thead>
    <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${formatInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function isTableLine(line: string) {
  return line.includes('|') && line.split('|').length >= 3;
}

function formatInline(value: string) {
  return escapeHtml(value)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
