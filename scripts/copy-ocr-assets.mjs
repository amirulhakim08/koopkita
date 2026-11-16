// Copies the self-hosted OCR assets (Tesseract worker/core/English data and the
// pdf.js worker) into public/ocr so receipts are read entirely in the browser:
// no receipt image or text is sent to any third-party service or CDN.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public/ocr");
const nm = (...p) => path.join(root, "node_modules", ...p);

mkdirSync(path.join(out, "core"), { recursive: true });
mkdirSync(path.join(out, "lang"), { recursive: true });
cpSync(nm("tesseract.js/dist/worker.min.js"), path.join(out, "worker.min.js"));
for (const f of readdirSync(nm("tesseract.js-core"))) {
  if (/^tesseract-core.*-lstm\.wasm\.js$/.test(f) || f === "tesseract-core-lstm.wasm.js") cpSync(nm("tesseract.js-core", f), path.join(out, "core", f));
}
cpSync(nm("@tesseract.js-data/eng/4.0.0/eng.traineddata.gz"), path.join(out, "lang/eng.traineddata.gz"));
cpSync(nm("pdfjs-dist/build/pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));
console.log("OCR assets copied to public/ocr");
