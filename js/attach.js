import { LIBS, load } from "./md.js";

export const TEXT_MAX = 20000;
const TEXTY = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|js|mjs|ts|tsx|jsx|py|java|c|h|cpp|hpp|cs|go|rs|rb|php|swift|kt|sql|sh|bat|ps1|ya?ml|ini|toml|log|tex|srt|vtt)$/i;
export const isPhoto = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(f.name || "");

export async function readPhoto(file) {
  if (file.size > 30e6) throw new Error("That photo is too big.");
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't open that photo.");
  }
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { kind: "photo", name: file.name || "Photo", url: c.toDataURL("image/jpeg", 0.85) };
}

let worker = "";
export async function readDoc(file) {
  const name = file.name || "File";
  let text = "", pages = 0;
  if (./\.pdf$/i.test(name) || file.type === "application/pdf") {
    if (file.size > 40e6) throw new Error("That PDF is too big.");
    await load(LIBS.pdf);
    const lib = window.pdfjsLib;
    if (!worker) worker = URL.createObjectURL(new Blob(['importScripts("' + LIBS.pdfWorker + '");'], { type: "text/javascript" }));
    lib.GlobalWorkerOptions.workerSrc = worker;
    let doc;
    try {
      doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    } catch {
      throw new Error("Couldn't open that PDF.");
    }
    pages = doc.numPages;
    for (let p = 1; p <= pages && text.length < TEXT_MAX; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      text += tc.items.map((x) => x.str + (x.hasEOL ? "\n" : " ")).join("") + "\n\n";
    }
    doc.destroy();
    if (!text.trim()) throw new Error("That PDF has no text to read.");
  } else if (./\.docx$/i.test(name)) {
    if (file.size > 25e6) throw new Error("That file is too big.");
    await load(LIBS.mammoth);
    try {
      text = (await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    } catch {
      throw new Error("Couldn't open that document.");
    }
  } else if (TEXTY.test(name) || /^text\//.test(file.type)) {
    if (file.size > 3e6) throw new Error("That file is too big.");
    text = await file.text();
  } else throw new Error("Use a photo, PDF, Word or text file.");
  text = text.replace(./\r/g, "").replace(./[ \t]+\n/g, "\n").replace(./\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("That file is empty.");
  return { kind: "file", name, pages, text: text.slice(0, TEXT_MAX) };
}
