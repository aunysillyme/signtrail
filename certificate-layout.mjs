// Certificate of Completion layout.
//
// Pure geometry and text preparation, deliberately free of pdf-lib so it can be
// unit tested without a PDF runtime. It returns drawing operations that the
// caller replays onto a pdf-lib page. Colours are [r, g, b] in the 0..1 range.

export const CERT_MIN_WIDTH = 612;
export const CERT_MIN_HEIGHT = 792;
export const CERT_MAX_FIELD_ROWS = 10;

const INK = [0.09, 0.09, 0.13];
const MUTED = [0.41, 0.42, 0.47];
const ACCENT = [0.41, 0.33, 1.0];
const LINE = [0.89, 0.89, 0.92];
const PANEL = [0.98, 0.98, 0.99];
const HEADER_FILL = [0.93, 0.93, 0.96];
const ROW_RULE = [0.92, 0.93, 0.95];
const SUCCESS = [0.07, 0.49, 0.32];
const CALLOUT_FILL = [0.95, 0.94, 1.0];
const CALLOUT_BORDER = [0.8, 0.76, 0.98];

// The standard 14 PDF fonts encode WinAnsi (cp1252). Anything outside it makes
// pdf-lib throw at draw time, which previously took a non-Latin filename and
// turned it into a failed finalization. Map the common typographic characters
// down and replace everything else rather than aborting the export.
const WIN_ANSI_FOLD = new Map([
  ["‘", "'"], ["’", "'"], ["‚", "'"],
  ["“", '"'], ["”", '"'], ["„", '"'],
  ["–", "-"], ["—", "-"], ["−", "-"],
  ["…", "..."], [" ", " "], ["•", "-"],
  ["€", "EUR"], ["™", "(TM)"]
]);

export function toWinAnsi(value, fallback = "?") {
  let out = "";
  for (const char of String(value ?? "")) {
    const folded = WIN_ANSI_FOLD.get(char);
    if (folded !== undefined) { out += folded; continue; }
    const code = char.codePointAt(0);
    if (code === 9 || code === 10 || code === 13) { out += " "; continue; }
    if (code < 32) continue;
    if (code <= 126 || (code >= 160 && code <= 255)) { out += char; continue; }
    out += fallback;
  }
  return out;
}

// Truncate to a pixel budget rather than a character count, so a wide name is
// cut where it actually stops fitting instead of at an arbitrary offset.
export function fitText(value, maxWidth, size, bold, measure) {
  const safe = toWinAnsi(value);
  if (!safe) return "";
  if (measure(safe, size, bold) <= maxWidth) return safe;
  let low = 0;
  let high = safe.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(`${safe.slice(0, mid)}...`, size, bold) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low > 0 ? `${safe.slice(0, low)}...` : "";
}

// A certificate laid out for Letter does not fit on a small source page, so the
// page is never smaller than Letter. Larger source pages keep their own size.
export function certificatePageSize(sourceSize) {
  const width = Number(sourceSize?.width);
  const height = Number(sourceSize?.height);
  return {
    width: Number.isFinite(width) && width > CERT_MIN_WIDTH ? width : CERT_MIN_WIDTH,
    height: Number.isFinite(height) && height > CERT_MIN_HEIGHT ? height : CERT_MIN_HEIGHT
  };
}

export function buildCertificateOps(model, measure) {
  const size = certificatePageSize(model.sourcePageSize);
  const { width, height } = size;
  const marginX = 40;
  const contentWidth = width - marginX * 2;
  const footerTop = 46;
  const ops = [];

  const text = (value, x, y, fontSize, bold, color) => {
    const safe = toWinAnsi(value);
    if (safe) ops.push({ op: "text", text: safe, x, y, size: fontSize, bold: Boolean(bold), color });
  };
  const rightText = (value, right, y, fontSize, bold, color) => {
    const safe = toWinAnsi(value);
    if (safe) ops.push({ op: "text", text: safe, x: right - measure(safe, fontSize, Boolean(bold)), y, size: fontSize, bold: Boolean(bold), color });
  };
  const rule = (y, thickness, color) => ops.push({ op: "line", x1: marginX, y1: y, x2: width - marginX, y2: y, thickness, color });

  let y = height - 42;

  rule(y, 3, ACCENT);
  y -= 22;
  text("SIGNTRAIL - PORTABLE INTEGRITY TRAIL", marginX, y, 8, true, ACCENT);
  y -= 18;
  text("Certificate of Completion", marginX, y, 18, true, INK);
  rightText(`ID: ${model.verificationId}`, width - marginX, y + 2, 9, true, ACCENT);
  y -= 14;
  text("Cryptographic document manifest and tamper-evident signing record.", marginX, y, 8.5, false, MUTED);
  y -= 16;
  rule(y, 0.75, LINE);
  y -= 20;

  const boxHeight = 110;
  ops.push({ op: "rect", x: marginX, y: y - boxHeight, width: contentWidth, height: boxHeight, color: PANEL, borderColor: LINE, borderWidth: 0.75 });

  const leftColX = marginX + 14;
  const rightColX = marginX + contentWidth / 2 + 10;
  const colWidth = contentWidth / 2 - 26;
  let cardY = y - 18;

  text("DOCUMENT NAME", leftColX, cardY, 7, true, MUTED);
  text("COMPLETED AT", rightColX, cardY, 7, true, MUTED);
  cardY -= 12;
  text(fitText(model.documentName || "Document.pdf", colWidth, 9, true, measure), leftColX, cardY, 9, true, INK);
  text(fitText(model.completedAt, colWidth, 9, false, measure), rightColX, cardY, 9, false, INK);
  cardY -= 20;

  text("SIGNER IDENTITY", leftColX, cardY, 7, true, MUTED);
  text("DOCUMENT SCOPE", rightColX, cardY, 7, true, MUTED);
  cardY -= 12;
  text(fitText(model.signerIdentity, colWidth, 8.5, false, measure), leftColX, cardY, 8.5, false, INK);
  text(fitText(`${model.sourcePageCount} Original Page(s) + 1 Certificate Page`, colWidth, 8.5, false, measure), rightColX, cardY, 8.5, false, INK);
  cardY -= 20;

  text("ORIGINAL DOCUMENT SHA-256 FINGERPRINT", leftColX, cardY, 7, true, MUTED);
  cardY -= 11;
  text(fitText(model.originalHash || "N/A", contentWidth - 28, 7.5, false, measure), leftColX, cardY, 7.5, false, INK);

  y -= boxHeight + 24;

  text("FIELD COMPLETION INVENTORY", marginX, y, 8, true, ACCENT);
  y -= 14;
  ops.push({ op: "rect", x: marginX, y: y - 16, width: contentWidth, height: 18, color: HEADER_FILL });

  const columns = [
    { label: "#", dx: 8, width: 18 },
    { label: "FIELD TYPE", dx: 30, width: 124 },
    { label: "PAGE", dx: 160, width: 60 },
    { label: "ASSIGNEE", dx: 225, width: 100 },
    { label: "STATUS", dx: 330, width: 90 }
  ];
  for (const column of columns) text(column.label, marginX + column.dx, y - 11, 7.5, true, [0.2, 0.22, 0.28]);
  y -= 20;

  const fields = Array.isArray(model.fields) ? model.fields : [];
  // Rows stop at the footer even on a page that is exactly Letter, so nothing
  // is ever drawn underneath the footer rule or off the bottom edge.
  const roomForRows = Math.max(0, Math.floor((y - (footerTop + 108)) / 16));
  const shown = fields.slice(0, Math.min(CERT_MAX_FIELD_ROWS, roomForRows));

  shown.forEach((field, index) => {
    const lineY = y - 11;
    const cells = [
      [String(index + 1), 0, false, [0.2, 0.22, 0.28]],
      [field.label, 1, true, INK],
      [`Page ${field.page}`, 2, false, [0.2, 0.22, 0.28]],
      [field.assignee, 3, false, [0.2, 0.22, 0.28]],
      ["Completed", 4, true, SUCCESS]
    ];
    for (const [value, columnIndex, bold, color] of cells) {
      const column = columns[columnIndex];
      text(fitText(value, column.width, 8, bold, measure), marginX + column.dx, lineY, 8, bold, color);
    }
    y -= 16;
    ops.push({ op: "line", x1: marginX, y1: y, x2: width - marginX, y2: y, thickness: 0.5, color: ROW_RULE });
  });

  const remaining = fields.length - shown.length;
  if (remaining > 0) {
    y -= 14;
    text(`... and ${remaining} additional completed field(s) recorded in integrity receipt`, marginX + 8, y, 7.5, false, MUTED);
  }

  y -= 22;

  const calloutHeight = 68;
  ops.push({ op: "rect", x: marginX, y: y - calloutHeight, width: contentWidth, height: calloutHeight, color: CALLOUT_FILL, borderColor: CALLOUT_BORDER, borderWidth: 0.75 });
  text("INDEPENDENT CRYPTOGRAPHIC VERIFICATION", marginX + 14, y - 16, 7.5, true, [0.31, 0.22, 0.96]);
  text("This certificate is permanently bound into the signed PDF file and sealed upon finalization.", marginX + 14, y - 28, 8, true, INK);
  text("To independently verify byte-for-byte authenticity, upload this file and its companion Integrity receipt", marginX + 14, y - 40, 7.5, false, [0.2, 0.22, 0.28]);
  text(`(${model.verificationId}.json) to SignTrail Verify. The signed SHA-256 fingerprint guarantees zero post-sign modification.`, marginX + 14, y - 52, 7.5, false, [0.2, 0.22, 0.28]);

  rule(36, 0.5, LINE);
  text("SignTrail v0.3.3 - Portable Trust - Browser-Attested Integrity", marginX, 24, 7.5, false, MUTED);
  rightText(`Verification ID: ${model.verificationId}`, width - marginX, 24, 7.5, true, MUTED);

  return { size, ops };
}

if (typeof window !== "undefined") {
  window.SignTrailCertificateLayout = { buildCertificateOps, certificatePageSize, toWinAnsi, fitText, CERT_MAX_FIELD_ROWS };
}
