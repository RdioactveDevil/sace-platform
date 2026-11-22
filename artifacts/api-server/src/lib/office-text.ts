/**
 * Plain text from Word (.docx) and PowerPoint (.pptx) files, for reference
 * material read by AI. Both are zip archives of XML: we read the text runs in
 * reading order (slides in presentation order, each with its speaker notes),
 * keeping paragraphs, table cells and equations. Pictures are not read.
 */
import { unzipSync, strFromU8 } from "fflate";

export type ResourceFormat = "pdf" | "docx" | "pptx";

export const RESOURCE_MIME: Record<ResourceFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** The format of an uploaded file from its name or type; null when it isn't one we read. */
export function resourceFormat(filename: string | null | undefined, mimeType: string | null | undefined): ResourceFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(filename || "")?.[1]?.toLowerCase();
  if (ext === "pdf" || ext === "docx" || ext === "pptx") return ext;
  for (const [fmt, mime] of Object.entries(RESOURCE_MIME)) if (mime === mimeType) return fmt as ResourceFormat;
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * Text of one Word body or slide XML part. `p` is the namespace prefix of its
 * paragraphs, runs and tables ('w' for Word, 'a' for slides).
 */
function xmlText(xml: string, ns: "w" | "a"): string {
  const textTags = new Set([`${ns}:t`, "m:t"]);
  let out = "";
  let inText = false;
  let skip = 0; // inside mc:Fallback (a copy of mc:Choice) or a field such as a slide number
  const cells: number[] = [];
  const tag = /<(\/?)([\w.-]+:[\w.-]+|[\w.-]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (let m; (m = tag.exec(xml)); ) {
    const [, close, name, , selfClose, text] = m;
    if (text !== undefined) {
      if (inText && !skip) out += decodeXml(text);
      continue;
    }
    if (name === "mc:Fallback" || name === "a:fld") {
      if (!selfClose) skip += close ? -1 : 1;
      continue;
    }
    if (skip) continue;
    if (textTags.has(name)) { inText = !close && !selfClose; continue; }
    if (close) {
      if (name === `${ns}:p`) out += "\n";
      else if (name === `${ns}:tc`) {
        const start = cells.pop() ?? out.length;
        out = out.slice(0, start) + out.slice(start).replace(/\s*\n\s*/g, " ").trim() + " | ";
      } else if (name === `${ns}:tr`) out = out.replace(/ \| $/, "") + "\n";
    } else if (name === `${ns}:tc`) {
      if (!selfClose) cells.push(out.length);
    } else if (name === `${ns}:tab`) out += "\t";
    else if (name === `${ns}:br` || name === `${ns}:cr`) out += "\n";
  }
  return tidy(out);
}

function tidy(s: string): string {
  return s
    .split("\n")
    .map((l) => l.replace(/[  ]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function openZip(bytes: Uint8Array, wanted: (name: string) => boolean): Record<string, string> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => wanted(f.name) });
  } catch {
    throw new Error("This file couldn't be opened. Open it in Word or PowerPoint, save it again, and upload that copy.");
  }
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]));
}

const NO_TEXT = "There's no text in this file to read. If it's scanned pages or pictures, export it as a PDF and upload that instead.";

export function extractDocxText(bytes: Uint8Array): string {
  const files = openZip(bytes, (n) => n === "word/document.xml");
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("This doesn't look like a Word document (.docx).");
  return xmlText(xml, "w");
}

/** Resolve a relationship target ("../notesSlides/notesSlide3.xml") against the part's folder. */
function resolvePath(fromDir: string, target: string): string {
  const parts = fromDir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function relTargets(relsXml: string | undefined): { id: string; type: string; target: string }[] {
  if (!relsXml) return [];
  return [...relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)].map(([, attrs]) => ({
    id: /\bId="([^"]*)"/.exec(attrs)?.[1] ?? "",
    type: /\bType="([^"]*)"/.exec(attrs)?.[1] ?? "",
    target: /\bTarget="([^"]*)"/.exec(attrs)?.[1] ?? "",
  }));
}

export function extractPptxText(bytes: Uint8Array): string {
  const files = openZip(bytes, (n) =>
    n === "ppt/presentation.xml" ||
    n === "ppt/_rels/presentation.xml.rels" ||
    /^ppt\/slides\/(_rels\/)?slide\d+\.xml(\.rels)?$/.test(n) ||
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n),
  );
  const slideNum = (p: string) => Number(/slide(\d+)\.xml$/.exec(p)?.[1] ?? 0);
  // Presentation order (slides can be reordered without renaming their files);
  // the file numbers when that isn't available.
  let order: string[] = [];
  const pres = files["ppt/presentation.xml"];
  if (pres) {
    const rels = new Map(relTargets(files["ppt/_rels/presentation.xml.rels"]).map((r) => [r.id, resolvePath("ppt", r.target)]));
    order = [...pres.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map(([, id]) => rels.get(id) ?? "").filter((p) => files[p]);
  }
  if (!order.length) {
    order = Object.keys(files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => slideNum(a) - slideNum(b));
  }
  if (!order.length) throw new Error("This presentation has no slides to read.");

  const out: string[] = [];
  order.forEach((path, i) => {
    const body = xmlText(files[path], "a");
    const relsPath = path.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels");
    const notesRel = relTargets(files[relsPath]).find((r) => r.type.endsWith("/notesSlide"));
    const notesXml = notesRel ? files[resolvePath("ppt/slides", notesRel.target)] : undefined;
    const notes = notesXml ? xmlText(notesXml, "a") : "";
    if (!body && !notes) return;
    out.push([`Slide ${i + 1}`, body, notes && `Notes: ${notes}`].filter(Boolean).join("\n"));
  });
  return out.join("\n\n");
}

/** Text of a Word or PowerPoint file; throws a message for the admin when there's nothing to read. */
export function extractOfficeText(bytes: Uint8Array, format: "docx" | "pptx"): string {
  const text = format === "docx" ? extractDocxText(bytes) : extractPptxText(bytes);
  if (!text.trim()) throw new Error(NO_TEXT);
  return text;
}

/**
 * Split text into parts of at most `maxChars`, breaking between lines (so
 * between paragraphs and slides) where it can, and inside a line only when one
 * line alone is too long.
 */
export function splitText(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let cur = "";
  const push = () => {
    const p = cur.replace(/^\n+|\n+$/g, "");
    if (p) parts.push(p);
    cur = "";
  };
  for (const line of text.split("\n")) {
    if (line.length > maxChars) {
      push();
      for (let i = 0; i < line.length; i += maxChars) parts.push(line.slice(i, i + maxChars));
      continue;
    }
    const next = cur ? `${cur}\n${line}` : line;
    if (next.length > maxChars) {
      push();
      cur = line;
    } else cur = next;
  }
  push();
  return parts;
}
