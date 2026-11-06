/**
 * Extracción LOCAL de texto de documentos y descripción automática por extracto.
 *
 * Nada sale del dispositivo. La "descripción automática" es un EXTRACTO del propio
 * documento (título + primeras frases con contenido, recortado a ~20–50 palabras);
 * no es un resumen redactado por un modelo de IA y se etiqueta como tal en la interfaz.
 *
 *  - TXT/MD/CSV: lectura directa.
 *  - Word (.docx): se descomprime y se lee word/document.xml.
 *  - Excel (.xlsx): nombres de hojas + textos de celdas (sharedStrings).
 *  - PDF: pdf.js (se carga solo cuando se adjunta un PDF); primeras páginas.
 *  - Imágenes y PDF escaneados: requieren OCR, que no está incluido (ver README).
 */
import { strFromU8, unzipSync } from 'fflate';
import type { ExtractStatus } from '../domain/types';

export interface ExtractResult {
  status: ExtractStatus;
  text: string;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
  const xml = files['word/document.xml'];
  if (!xml) return '';
  return decodeEntities(
    strFromU8(xml)
      .replace(/<w:tab\/>/g, ' ')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  );
}

function xlsxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'xl/sharedStrings.xml' || f.name === 'xl/workbook.xml' });
  const sheets = files['xl/workbook.xml'] ? [...strFromU8(files['xl/workbook.xml']).matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => decodeEntities(m[1])) : [];
  const strings = files['xl/sharedStrings.xml']
    ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim()).filter(Boolean)
    : [];
  const head = sheets.length ? `Hojas: ${sheets.join(', ')}.\n` : '';
  return head + strings.slice(0, 400).join('\n');
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: bytes, disableFontFace: true }).promise;
  const pages = Math.min(doc.numPages, 5);
  const parts: string[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      line += item.str ?? '';
      if (item.hasEOL) {
        parts.push(line);
        line = '';
      } else line += ' ';
    }
    parts.push(line);
  }
  await doc.cleanup();
  return parts.join('\n');
}

export function kindOf(name: string, mime: string): 'pdf' | 'docx' | 'xlsx' | 'text' | 'image' | 'other' {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx') return 'xlsx';
  if (['txt', 'md', 'csv'].includes(ext) || mime.startsWith('text/')) return 'text';
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(ext)) return 'image';
  return 'other';
}

export async function extractText(blob: Blob, name: string): Promise<ExtractResult> {
  const kind = kindOf(name, blob.type);
  try {
    let text = '';
    if (kind === 'image') return { status: 'needs-ocr', text: '' };
    if (kind === 'other') return { status: 'unsupported', text: '' };
    if (kind === 'text') text = await blob.text();
    else {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (kind === 'docx') text = docxText(bytes);
      else if (kind === 'xlsx') text = xlsxText(bytes);
      else
        text = await Promise.race([
          pdfText(bytes),
          // Nunca dejar un documento "leyendo" indefinidamente
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 60_000)),
        ]);
    }
    const clean = text.replace(/\u0000/g, '').trim();
    if (clean.replace(/\s/g, '').length < 20) return { status: kind === 'pdf' ? 'needs-ocr' : 'no-text', text: clean };
    return { status: 'ok', text: clean };
  } catch {
    return { status: 'error', text: '' };
  }
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * Descripción por extracto: identifica una línea de título (si la hay) y añade las primeras
 * frases con contenido hasta reunir entre 20 y 50 palabras. No inventa información.
 */
export function describeExtract(text: string, fileName: string): string {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 2 && /[a-záéíóúñ]/i.test(l));
  if (!lines.length) return '';
  const base = fileName.replace(/\.[^.]+$/, '').toLowerCase();
  let title = '';
  const first = lines[0];
  if (words(first).length <= 14 && !/[.;:]$/.test(first) && first.toLowerCase() !== base) {
    title = first.replace(/[,:\s]+$/, '');
    lines.shift();
  }
  const body = lines.join(' ');
  const sentences = body.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter((s) => words(s).length >= 4) ?? [];
  const out: string[] = title ? [`${title}.`] : [];
  let count = title ? words(title).length : 0;
  for (const s of sentences) {
    if (count >= 20) break;
    out.push(s);
    count += words(s).length;
  }
  let result = out.join(' ').replace(/\s+/g, ' ').trim();
  const w = words(result);
  if (w.length > 50) result = `${w.slice(0, 48).join(' ').replace(/[,;:]$/, '')}…`;
  return result;
}

export const EXTRACT_MESSAGE: Record<ExtractStatus, string> = {
  pending: 'Leyendo el documento…',
  ok: '',
  'no-text': 'No se encontró texto suficiente para generar una descripción. Escríbela manualmente.',
  'needs-ocr': 'Parece una imagen o un documento escaneado: necesitaría reconocimiento de texto (OCR), que no está incluido. Escribe la descripción manualmente.',
  unsupported: 'Este tipo de archivo no permite extraer texto. Escribe la descripción manualmente.',
  error: 'No se pudo leer el documento para describirlo. Puedes escribir la descripción manualmente.',
};
