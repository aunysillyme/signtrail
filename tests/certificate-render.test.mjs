import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildCertificateOps } from "../public/certificate-layout.mjs";

// Mirrors the replay loop in public/signtrail.js, so a change that pdf-lib
// rejects at draw time fails here instead of during a user's finalization.
async function renderCertificate(model, sourcePages = [[612, 792]]) {
  const pdfDoc = await PDFDocument.create();
  for (const [width, height] of sourcePages) pdfDoc.addPage([width, height]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const measure = (text, size, bold) => (bold ? boldFont : font).widthOfTextAtSize(text, size);

  const pages = pdfDoc.getPages();
  const { size, ops } = buildCertificateOps({ ...model, sourcePageCount: pages.length, sourcePageSize: pages[0].getSize() }, measure);
  const certPage = pdfDoc.addPage([size.width, size.height]);

  for (const op of ops) {
    if (op.op === "text") certPage.drawText(op.text, { x: op.x, y: op.y, size: op.size, font: op.bold ? boldFont : font, color: rgb(...op.color) });
    else if (op.op === "line") certPage.drawLine({ start: { x: op.x1, y: op.y1 }, end: { x: op.x2, y: op.y2 }, thickness: op.thickness, color: rgb(...op.color) });
    else if (op.op === "rect") {
      const rect = { x: op.x, y: op.y, width: op.width, height: op.height, color: rgb(...op.color) };
      if (op.borderColor) { rect.borderColor = rgb(...op.borderColor); rect.borderWidth = op.borderWidth; }
      certPage.drawRectangle(rect);
    }
  }
  return { bytes: await pdfDoc.save(), certSize: size, sourceCount: pages.length, opCount: ops.length };
}

const base = {
  verificationId: "ST-20260908-ABCDEF1234",
  documentName: "agreement.pdf",
  completedAt: "8 September 2026 at 02:01",
  signerIdentity: "Signee (signee@example.com)",
  originalHash: "b".repeat(64),
  fields: [
    { label: "Signature", page: 1, assignee: "Recipient" },
    { label: "Print name", page: 1, assignee: "Recipient" },
    { label: "Date", page: 1, assignee: "Self / Owner" }
  ]
};

test("the certificate renders as one extra page on a real PDF", async () => {
  const { bytes, sourceCount, opCount } = await renderCertificate(base, [[612, 792], [612, 792]]);
  assert.ok(opCount > 30, "the certificate should draw a full page of content");
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), sourceCount + 1);
  const certPage = reloaded.getPages()[reloaded.getPageCount() - 1];
  assert.deepEqual(certPage.getSize(), { width: 612, height: 792 });
});

test("a non-Latin document name and signer no longer crash finalization", async () => {
  const { bytes } = await renderCertificate({
    ...base,
    documentName: "契約書-ünïcode-😀.pdf",
    signerIdentity: "山田 太郎 (yamada@example.com)",
    fields: [{ label: "Подпись", page: 1, assignee: "Recipient" }]
  });
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 2);
});

test("a source page smaller than Letter still gets a full-size certificate", async () => {
  const { bytes, certSize } = await renderCertificate(base, [[200, 200]]);
  assert.deepEqual(certSize, { width: 612, height: 792 });
  const reloaded = await PDFDocument.load(bytes);
  const [source, cert] = reloaded.getPages();
  assert.deepEqual(source.getSize(), { width: 200, height: 200 });
  assert.deepEqual(cert.getSize(), { width: 612, height: 792 });
});

test("a long field inventory renders without overflowing the page", async () => {
  const fields = Array.from({ length: 40 }, (_, index) => ({ label: `Custom field ${index + 1}`, page: 1, assignee: "Recipient" }));
  const { bytes } = await renderCertificate({ ...base, fields });
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 2);
});
