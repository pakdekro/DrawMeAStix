/**
 * Format extractors (#96): file → text, 100% in the browser.
 * PR ② of document ingestion (#13 = extraction core, #14 = UI).
 *
 * This module is loaded LAZILY (import() from the UI): pdf.js and mammoth
 * are heavy and must not inflate the main bundle - same approach as the
 * precompiled ajv validators (#77).
 *
 * The document is NEVER stored (pak's decision): we extract the text on
 * the fly, the caller only keeps the candidates and the provenance
 * (file name, page).
 */

export interface ExtractedDocument {
  /** full text (pages joined by line breaks) */
  text: string;
  /** for a PDF: start offset of each page in `text` (1-indexed by its rank) */
  pageOffsets: number[];
}

/** page number (1-indexed) of an offset in `text`; 0 = pagination unknown. */
export function pageAt(doc: ExtractedDocument, offset: number): number {
  if (doc.pageOffsets.length === 0) return 0;
  let page = 1;
  for (let i = 1; i < doc.pageOffsets.length; i++) {
    if (offset >= doc.pageOffsets[i]) page = i + 1;
  }
  return page;
}

const plain = (text: string): ExtractedDocument => ({ text, pageOffsets: [] });

/* -- html -------------------------------------------------------------------- */

export function textFromHtml(html: string): ExtractedDocument {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  // scripts/styles bring nothing but noise (and fake domains: cdn.js…)
  parsed.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  return plain(parsed.body?.innerText ?? parsed.body?.textContent ?? "");
}

/* -- pdf --------------------------------------------------------------------- */

async function textFromPdf(buffer: ArrayBuffer): Promise<ExtractedDocument> {
  const [pdfjs, { default: PdfWorker }] = await Promise.all([
    import("pdfjs-dist"),
    // ?worker: Vite bundles the pdf.js ESM worker as a module worker served
    // from 'self' (works with CSP script-src; workerSrc=new URL(...) does not
    // work for the .mjs worker → "fake worker" that decodes nothing)
    import("pdfjs-dist/build/pdf.worker.min.mjs?worker"),
  ]);
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  const task = pdfjs.getDocument({ data: buffer });
  const pdf = await task.promise;
  const chunks: string[] = [];
  const pageOffsets: number[] = [];
  let offset = 0;
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      pageOffsets.push(offset);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // items are line fragments: we join them with a space, the real line
      // breaks come through hasEOL
      let pageText = "";
      for (const item of content.items) {
        if ("str" in item) {
          pageText += item.str;
          pageText += item.hasEOL ? "\n" : " ";
        }
      }
      const chunk = pageText.trim() + "\n";
      chunks.push(chunk);
      offset += chunk.length;
    }
  } finally {
    // frees the worker and the document memory (the file is not kept)
    await task.destroy();
  }
  const text = chunks.join("");
  if (!text.trim()) {
    throw new Error(
      "PDF without a text layer (scanned document?) - OCR is not supported",
    );
  }
  return { text, pageOffsets };
}

/* -- docx -------------------------------------------------------------------- */

async function textFromDocx(buffer: ArrayBuffer): Promise<ExtractedDocument> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
  return plain(value);
}

/* -- dispatch ---------------------------------------------------------------- */

const EXTENSIONS = ["txt", "md", "csv", "log", "html", "htm", "docx", "pdf"] as const;

export function supportedFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return (EXTENSIONS as readonly string[]).includes(ext);
}

/** value for the accept attribute of the file input */
export const ACCEPT = EXTENSIONS.map((e) => `.${e}`).join(",");

/** Largest file accepted for extraction.
 *
 * Extraction was measured at ~0.56 s/MB (2,395 indexOf scans over the
 * lowercased text), and every IOC found fires two IndexedDB transactions in
 * series. With no cap, a file of a few tens of MB makes the tab unusable for a
 * very long time, with no way to cancel, and fills IndexedDB with noise.
 *
 * The .docx case is the nastiest: mammoth decompresses the zip in memory,
 * which lets a zip bomb take the tab down with a file of a few kilobytes. The
 * cap therefore applies to the COMPRESSED size, which is not enough against an
 * extreme ratio - it is a mitigation, not a guarantee.
 *
 * 25 MB leaves ample room for a real CTI report (a large APT report with
 * images sits around 10 MB).
 */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Extracts the text of a file from its extension. Throws if unsupported. */
export async function textFromFile(file: File): Promise<ExtractedDocument> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.size > MAX_DOCUMENT_BYTES) {
    const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
    throw new Error(
      `file too large: ${mb(file.size)} (limit ${mb(MAX_DOCUMENT_BYTES)}). ` +
        "Split it, or paste the relevant section instead.",
    );
  }
  switch (ext) {
    case "txt":
    case "md":
    case "csv":
    case "log":
      return plain(await file.text());
    case "html":
    case "htm":
      return textFromHtml(await file.text());
    case "pdf":
      return textFromPdf(await file.arrayBuffer());
    case "docx":
      return textFromDocx(await file.arrayBuffer());
    default:
      throw new Error(`unsupported format: .${ext || "?"} (${ACCEPT})`);
  }
}
