"use client";
/**
 * Reads text from a receipt in the browser only.
 *  - PDF with a text layer (most bank e-receipts): pdf.js text extraction.
 *  - Images or scanned PDFs: Tesseract OCR (self-hosted in /ocr; no CDN, no upload).
 */
const OCR_BASE = "/ocr";

async function ocrImage(source: Blob | HTMLCanvasElement): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: `${OCR_BASE}/worker.min.js`,
    corePath: `${OCR_BASE}/core`,
    langPath: `${OCR_BASE}/lang`,
    gzip: true,
    workerBlobURL: false,
  });
  try {
    const { data } = await worker.recognize(source);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

async function pdfText(file: File): Promise<{ text: string; firstPage?: HTMLCanvasElement }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `${OCR_BASE}/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = "";
  for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    for (const item of content.items as { str: string; transform: number[] }[]) {
      const y = item.transform[5];
      text += lastY !== null && Math.abs(y - lastY) > 2 ? `\n${item.str}` : ` ${item.str}`;
      lastY = y;
    }
    text += "\n";
  }
  if (text.replace(/\s/g, "").length >= 20) return { text };
  // scanned PDF: render the first page and OCR it
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
  return { text, firstPage: canvas };
}

export async function extractReceiptText(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    const { text, firstPage } = await pdfText(file);
    return firstPage ? ocrImage(firstPage) : text;
  }
  return ocrImage(file);
}
