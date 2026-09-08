import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCertificateOps,
  certificatePageSize,
  toWinAnsi,
  fitText,
  CERT_MIN_WIDTH,
  CERT_MIN_HEIGHT,
  CERT_MAX_FIELD_ROWS
} from "../public/certificate-layout.mjs";

// Standard-14 fonts are close enough to 0.5em average that this is a fair
// stand-in for widthOfTextAtSize without pulling a PDF runtime into the test.
const measure = (text, size, bold) => text.length * size * (bold ? 0.56 : 0.5);

function model(overrides = {}) {
  return {
    verificationId: "ST-20260908-ABCDEF1234",
    documentName: "agreement.pdf",
    completedAt: "8 September 2026 at 02:01",
    signerIdentity: "Document Owner / Local Signer",
    originalHash: "a".repeat(64),
    sourcePageCount: 3,
    sourcePageSize: { width: 612, height: 792 },
    fields: [{ label: "Signature", page: 1, assignee: "Self / Owner" }],
    ...overrides
  };
}

function bounds(op) {
  if (op.op === "text") return { minX: op.x, maxX: op.x + measure(op.text, op.size, op.bold), minY: op.y, maxY: op.y + op.size };
  if (op.op === "line") return { minX: Math.min(op.x1, op.x2), maxX: Math.max(op.x1, op.x2), minY: Math.min(op.y1, op.y2), maxY: Math.max(op.y1, op.y2) };
  return { minX: op.x, maxX: op.x + op.width, minY: op.y, maxY: op.y + op.height };
}

test("every drawing operation stays inside the certificate page", () => {
  for (const sourcePageSize of [{ width: 612, height: 792 }, { width: 200, height: 200 }, { width: 842, height: 1191 }]) {
    const fields = Array.from({ length: 24 }, (_, index) => ({ label: `Field ${index + 1}`, page: 1, assignee: "Recipient" }));
    const { size, ops } = buildCertificateOps(model({ sourcePageSize, fields }), measure);
    assert.ok(ops.length > 0);
    for (const op of ops) {
      const box = bounds(op);
      assert.ok(box.minX >= 0, `${op.op} starts left of the page on ${size.width}x${size.height}`);
      assert.ok(box.maxX <= size.width, `${op.op} "${op.text ?? ""}" overflows the right edge on ${size.width}x${size.height}`);
      assert.ok(box.minY >= 0, `${op.op} "${op.text ?? ""}" falls below the page on ${size.width}x${size.height}`);
      assert.ok(box.maxY <= size.height, `${op.op} overflows the top edge on ${size.width}x${size.height}`);
    }
  }
});

test("a source page smaller than Letter is promoted, a larger one is preserved", () => {
  assert.deepEqual(certificatePageSize({ width: 200, height: 200 }), { width: CERT_MIN_WIDTH, height: CERT_MIN_HEIGHT });
  assert.deepEqual(certificatePageSize({ width: 842, height: 1191 }), { width: 842, height: 1191 });
  assert.deepEqual(certificatePageSize(undefined), { width: CERT_MIN_WIDTH, height: CERT_MIN_HEIGHT });
  assert.deepEqual(certificatePageSize({ width: NaN, height: 0 }), { width: CERT_MIN_WIDTH, height: CERT_MIN_HEIGHT });
});

test("text drawn onto the certificate is always WinAnsi-encodable", () => {
  const { ops } = buildCertificateOps(model({
    documentName: "契約書-ünïcode-😀.pdf",
    signerIdentity: "山田 太郎 (yamada@example.com)",
    fields: [{ label: "Подпись", page: 2, assignee: "Recipient" }]
  }), measure);
  for (const op of ops.filter(entry => entry.op === "text")) {
    for (const char of op.text) {
      const code = char.codePointAt(0);
      assert.ok((code >= 32 && code <= 126) || (code >= 160 && code <= 255), `"${char}" in "${op.text}" is not WinAnsi-encodable`);
    }
  }
});

test("toWinAnsi folds typographic punctuation and replaces the unmappable", () => {
  assert.equal(toWinAnsi("“smart” — quotes… café"), '"smart" - quotes... café');
  assert.equal(toWinAnsi("日本"), "??");
  assert.equal(toWinAnsi("line\nbreak"), "line break");
  assert.equal(toWinAnsi(null), "");
});

test("fitText truncates to the pixel budget rather than a character count", () => {
  const wide = "W".repeat(200);
  const fitted = fitText(wide, 100, 9, false, measure);
  assert.ok(fitted.endsWith("..."));
  assert.ok(measure(fitted, 9, false) <= 100);
  assert.equal(fitText("short", 100, 9, false, measure), "short");
});

test("the field inventory caps its rows and declares the overflow", () => {
  const fields = Array.from({ length: 25 }, (_, index) => ({ label: `Field ${index + 1}`, page: 1, assignee: "Recipient" }));
  const { ops } = buildCertificateOps(model({ fields }), measure);
  const text = ops.filter(op => op.op === "text").map(op => op.text);
  const rows = text.filter(value => /^Field \d+$/.test(value));
  assert.ok(rows.length <= CERT_MAX_FIELD_ROWS, `${rows.length} rows drawn, cap is ${CERT_MAX_FIELD_ROWS}`);
  assert.ok(text.some(value => value.includes(`and ${25 - rows.length} additional completed field(s)`)));
});

test("the verification id and original fingerprint reach the page", () => {
  const { ops } = buildCertificateOps(model(), measure);
  const text = ops.filter(op => op.op === "text").map(op => op.text);
  assert.ok(text.some(value => value.includes("ST-20260908-ABCDEF1234")));
  assert.ok(text.includes("a".repeat(64)));
  assert.ok(text.some(value => value.includes("3 Original Page(s) + 1 Certificate Page")));
});
