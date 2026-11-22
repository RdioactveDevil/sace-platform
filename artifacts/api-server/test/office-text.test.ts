import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { extractDocxText, extractPptxText, extractOfficeText, resourceFormat, splitText } from "../src/lib/office-text.ts";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

function zip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

test("a file's format comes from its name or type", () => {
  assert.equal(resourceFormat("Exam 2024.PDF", ""), "pdf");
  assert.equal(resourceFormat("notes.docx", ""), "docx");
  assert.equal(resourceFormat("x", "application/vnd.openxmlformats-officedocument.presentationml.presentation"), "pptx");
  assert.equal(resourceFormat("old.doc", "application/msword"), null);
  assert.equal(resourceFormat("slides.key", ""), null);
});

test("a Word document reads as paragraphs, tables, tabs, breaks and equations", () => {
  const doc = `<?xml version="1.0"?><w:document ${W}><w:body>
    <w:p><w:r><w:t>Question 1</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Solve </w:t></w:r><m:oMath><m:r><m:t>x² − 4 = 0</m:t></m:r></m:oMath><w:r><w:tab/><w:t>(2 marks)</w:t><w:br/><w:t>Show &amp; explain &lt;working&gt;.</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body></w:document>`;
  const text = extractDocxText(zip({ "word/document.xml": doc }));
  assert.equal(text, "Question 1\nSolve x² − 4 = 0\t(2 marks)\nShow & explain <working>.\na | b");
});

test("slides read in order, each with its speaker notes", () => {
  const slide = (t: string) => `<p:sld ${A}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p><a:p><a:r><a:t>line 2</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const rels = (n: number) => `<Relationships><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/></Relationships>`;
  const text = extractPptxText(zip({
    "ppt/slides/slide10.xml": slide("Ten"),
    "ppt/slides/slide2.xml": slide("Two"),
    "ppt/slides/_rels/slide2.xml.rels": rels(7),
    "ppt/notesSlides/notesSlide7.xml": `<p:notes ${A}><a:p><a:r><a:t>Say this aloud</a:t></a:r></a:p></p:notes>`,
  }));
  assert.equal(text, "Slide 1\nTwo\nline 2\nNotes: Say this aloud\n\nSlide 2\nTen\nline 2");
});

test("a file that isn't a real Word or PowerPoint file says so", () => {
  assert.throws(() => extractOfficeText(new Uint8Array([1, 2, 3]), "docx"), /couldn't be opened/);
  assert.throws(() => extractOfficeText(zip({ "a.txt": "hi" }), "pptx"), /no slides/);
  assert.throws(() => extractOfficeText(zip({ "word/document.xml": `<w:document ${W}><w:body/></w:document>` }), "docx"), /no text/);
});

test("long text splits into parts at paragraph breaks, each under the limit", () => {
  const paras = Array.from({ length: 10 }, (_, i) => `${i}`.repeat(30));
  const parts = splitText(paras.join("\n\n"), 100);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 100));
  // Nothing lost: the parts hold every paragraph, in order.
  assert.deepEqual(parts.join("\n").split("\n").filter(Boolean), paras);
  // One paragraph longer than the limit is cut hard rather than dropped.
  const long = splitText("x".repeat(250), 100);
  assert.deepEqual(long.map((p) => p.length), [100, 100, 50]);
  assert.deepEqual(splitText("short", 100), ["short"]);
});
