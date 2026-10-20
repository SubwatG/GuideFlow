const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { validateBundle, serializeForHtml, safeImageUrl } = require("../extension/guide-data.js");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "extension", "viewer.html"), "utf8");
const js = fs.readFileSync(path.join(root, "extension", "viewer.js"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

// 1. Buttons exist with explicit labels and tooltips
assert(html.includes('id="btnImport"'), "Import button must exist");
assert(html.includes("นำเข้า JSON"), "Import button text must be 'นำเข้า JSON'");
assert(html.includes('id="btnExportJson"'), "Export JSON button must exist");
assert(html.includes("Export JSON"), "Export JSON button text must exist");

// 2. JS Handlers
assert(js.includes('btnExportJson.addEventListener("click"'), "JS must handle Export JSON click");
assert(js.includes('btnImport.addEventListener("click"'), "JS must handle Import JSON click");
assert(js.includes("application/json;charset=utf-8"), "Export JSON must produce valid JSON blob");

// 3. Documentation updated in README.md (EN & TH)
assert(readme.includes("Export / Import JSON:"), "English README must document JSON import/export");
assert(readme.includes("สำรองและนำเข้าข้อมูล (Export / Import JSON):"), "Thai README must document JSON import/export");

// The data boundary must accept both current bundles and the historical array format,
// while returning a clean, bounded object that can be embedded in a script safely.
const legacy = [{
  timestamp: 42,
  url: "https://example.test/docs",
  pageTitle: "Docs",
  action: "click",
  elementTag: "button",
  elementText: "Save",
  description: "Save the document",
  coords: { xPercent: 10, yPercent: 20, box: { top: 5, left: 6, width: 10, height: 12 } },
  documentCoords: { x: 110, y: 220, box: { left: 100, top: 200, width: 40, height: 20 } },
  viewport: { width: 800, height: 600, dpr: 2 },
  captureMode: "viewport",
  screenshot: "data:image/png;base64,c2FtcGxl"
}];
const clean = validateBundle(legacy);
assert.strictEqual(clean.schemaVersion, 1);
assert.deepStrictEqual(clean.meta, {});
assert.strictEqual(clean.session.length, 1);
assert.match(clean.session[0].id, /^step_/);
assert.strictEqual(clean.session[0].screenshot, legacy[0].screenshot);
assert.deepStrictEqual(clean.session[0].documentCoords, legacy[0].documentCoords);

assert.deepStrictEqual(validateBundle({ schemaVersion: 1, meta: { title: "Empty" }, session: [] }), {
  schemaVersion: 1,
  meta: { title: "Empty" },
  session: []
}, "an empty guide is valid so users can clear a guide");

assert.throws(() => validateBundle({ schemaVersion: 2, meta: {}, session: [] }), /schema/i);
assert.throws(() => validateBundle({ schemaVersion: 1, meta: {} }), /session/i);
assert.throws(() => validateBundle({ schemaVersion: 1, meta: { title: "x".repeat(201) }, session: [] }), /title/i);
assert.throws(() => validateBundle({ schemaVersion: 1, meta: {}, session: [{ screenshot: "https://example.test/image.png" }] }), /image/i);
assert.throws(() => validateBundle({ schemaVersion: 1, meta: {}, session: [{ screenshot: "data:image/svg+xml;base64,PHN2Zy8+" }] }), /image/i);
assert.throws(() => validateBundle({ schemaVersion: 1, meta: {}, session: [{ coords: { xPercent: Infinity, yPercent: 1 } }] }), /finite|coord/i);
assert.throws(() => validateBundle({ schemaVersion: 1, meta: {}, session: [{ coords: { xPercent: 101, yPercent: 1 } }] }), /range|coord/i);
assert.throws(() => validateBundle({ schemaVersion: 1, meta: {}, session: new Array(1001).fill({}) }), /steps/i);

const polluted = JSON.parse('{"schemaVersion":1,"meta":{"title":"ok","__proto__":{"polluted":true}},"session":[]}');
const cleanPolluted = validateBundle(polluted);
assert.strictEqual(Object.prototype.polluted, undefined);
assert.strictEqual(Object.prototype.hasOwnProperty.call(cleanPolluted.meta, "__proto__"), false);

assert.strictEqual(safeImageUrl("data:image/jpeg;base64,/9j/4AAQ"), "data:image/jpeg;base64,/9j/4AAQ");
assert.throws(() => safeImageUrl("data:image/png;base64,not valid"), /image/i);
assert.throws(() => safeImageUrl("blob:https://example.test/abc"), /image/i);

const htmlJson = serializeForHtml({
  schemaVersion: 1,
  meta: { title: "</script><script>alert('&')</script>" },
  session: []
});
assert(!htmlJson.includes("<"), "serialized data must not contain literal < characters");
assert(!htmlJson.includes("&"), "serialized data must not contain literal ampersands");
assert.strictEqual(JSON.parse(htmlJson).meta.title, "</script><script>alert('&')</script>");

const oversized = "x".repeat(48 * 1024 * 1024);
assert.throws(() => validateBundle({ schemaVersion: 1, meta: {}, session: [], note: oversized }), /size|large|limit/i);

console.log("PASS JSON Import/Export feature and documentation verified successfully");

assert.throws(() => validateBundle({ meta: {}, session: [{ description: "missing screenshot" }] }), /image|screenshot/i);
assert.throws(() => validateBundle({ meta: {}, session: [{ id: "same", screenshot: legacy[0].screenshot }, { id: "same", screenshot: legacy[0].screenshot }] }), /duplicate|id/i);
assert.deepStrictEqual(validateBundle({ meta: {}, session: [{ screenshot: legacy[0].screenshot, coords: { xPercent: 10, yPercent: 20, box: { left: -10, top: -5, width: 150, height: 20 } } }] }).session[0].coords.box,
  { left: 0, top: 0, width: 100, height: 15 }, "legacy partially visible elements must migrate with clipped boxes");
