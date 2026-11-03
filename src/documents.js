// Document ingestion: PDF, DOCX, Markdown and plain text.
//
// Extraction happens on the server so the browser uploads the original file
// rather than a hand-copied transcript. A document that cannot be read is
// rejected with a reason instead of being stored as an empty source.

import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;

const FORMATS = [
  { extensions: ['.pdf'], format: 'pdf', label: 'PDF' },
  { extensions: ['.docx'], format: 'docx', label: 'Word document' },
  { extensions: ['.md', '.markdown'], format: 'markdown', label: 'Markdown' },
  { extensions: ['.txt', '.text'], format: 'text', label: 'Plain text' },
];

export const ACCEPTED_DOCUMENT_EXTENSIONS = FORMATS.flatMap((entry) => entry.extensions);

export function documentFormat(filename) {
  const name = String(filename ?? '').trim().toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot === -1) return null;
  const extension = name.slice(dot);
  return FORMATS.find((entry) => entry.extensions.includes(extension)) ?? null;
}

export function documentFormatLabel(filename) {
  return documentFormat(filename)?.label ?? null;
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\u0000/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeBase64(value) {
  const raw = String(value ?? '').trim();
  const payload = raw.includes(',') && /^data:/i.test(raw) ? raw.slice(raw.indexOf(',') + 1) : raw;
  if (!payload) return Buffer.alloc(0);
  return Buffer.from(payload, 'base64');
}

// Returns { text, format, pages }. Throws a message written for the person who
// uploaded the file, because that message is shown in the source dialog.
export async function extractDocumentText({ filename, base64, text }) {
  const detected = documentFormat(filename);
  if (!detected) {
    throw new Error('Unsupported document. Upload a PDF, DOCX, Markdown or plain-text file.');
  }

  if (detected.format === 'markdown' || detected.format === 'text') {
    const pasted = cleanText(text);
    if (pasted) return { text: pasted, format: detected.format, pages: null };
    const body = cleanText(decodeBase64(base64).toString('utf8'));
    if (!body) throw new Error('That file is empty. Add some text and try again.');
    return { text: body, format: detected.format, pages: null };
  }

  const buffer = decodeBase64(base64);
  if (!buffer.length) throw new Error('That file is empty. Upload the original document and try again.');
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new Error(`That file is larger than ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB. Split it and upload the sections you need.`);
  }

  if (detected.format === 'pdf') {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractText(pdf, { mergePages: true });
      const body = cleanText(Array.isArray(result.text) ? result.text.join('\n\n') : result.text);
      if (!body) {
        throw new Error(
          'No selectable text was found in that PDF. It is probably a scan, so export it with a text layer or paste the text instead.',
        );
      }
      return { text: body, format: 'pdf', pages: result.totalPages ?? null };
    } catch (error) {
      if (/password|encrypt/i.test(error.message ?? '')) {
        throw new Error('That PDF is password protected. Remove the password and upload it again.');
      }
      throw error;
    }
  }

  let result;
  try {
    result = await mammoth.extractRawText({ buffer });
  } catch (error) {
    throw new Error(`Could not read that DOCX: ${error.message ?? 'the file is damaged or not a Word document'}.`);
  }
  const body = cleanText(result.value);
  if (!body) {
    throw new Error('That DOCX contains no readable text. Tables, images and charts are not extracted yet.');
  }
  return { text: body, format: 'docx', pages: null, warnings: (result.messages ?? []).length };
}
