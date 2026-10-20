const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "extension", "viewer.html"), "utf8");
const js = fs.readFileSync(path.join(root, "extension", "viewer.js"), "utf8");

// Check Export Images button & modal exist
assert(html.includes('id="btnExportImages"'), "Viewer HTML must have btnExportImages");
assert(html.includes('id="exportImagesModal"'), "Viewer HTML must have exportImagesModal");
assert(html.includes('id="chkIncludeHighlight"'), "Modal must have checkbox for highlight");
assert(html.includes('id="chkIncludeReadme"'), "Modal must have checkbox for README");

// Check JS logic
assert(js.includes('btnExportImages.addEventListener("click"'), "JS must bind click to export images button");
assert(js.includes("window.showDirectoryPicker"), "JS must use showDirectoryPicker API");
assert(js.includes("renderHighlightedImage"), "JS must have canvas rendering for highlight bake-in");
assert(js.includes("exportImagesToDirectory"), "JS must implement saving files into local directory");
assert(js.includes("README.md"), "JS must support exporting README.md summary");

console.log("PASS export images to directory with highlight toggle verified");

const vm = require("vm");
const { test } = require("node:test");
test("HTML export keeps mixed-case script terminators and replacement tokens as inert data", () => {
  const description = "</ScRiPt><b>MARKER</b> $& </script > semicolon;";
  const sandbox = { GuideFlowData: require("../extension/guide-data.js"), bundle: { meta: { title: "review" }, session: [{ description, screenshot: "data:image/png;base64,c2hvdA==" }] } };
  const builder = js.slice(js.indexOf("function createStandaloneExport("), js.indexOf("function startApp()"));
  vm.createContext(sandbox);
  vm.runInContext(builder + '\nglobalThis.exported = createStandaloneExport(\'<script src="viewer.js"></script>\', "/* runtime */", bundle);', sandbox);
  assert(!sandbox.exported.includes("</ScRiPt>"), "untrusted data must not terminate script context");
  assert(!sandbox.exported.includes("</script >"), "whitespace variant must remain data");
  const match = sandbox.exported.match(/<script id="guideflow-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.strictEqual(JSON.parse(match[1]).session[0].description, description);
  sandbox.bundle.session[0].description = "edited; $&";
  vm.runInContext('globalThis.exported = createStandaloneExport(exported, "/* runtime */", bundle);', sandbox);
  const updated = sandbox.exported.match(/<script id="guideflow-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.strictEqual(JSON.parse(updated[1]).session[0].description, "edited; $&");
  assert.strictEqual((sandbox.exported.match(/id="guideflow-data"/g) || []).length, 1);
});

test("packaged demo images resolve only from named, integrity-checked local assets", async () => {
  const bytes = Buffer.from("local-image-fixture");
  const hash = require("crypto").createHash("sha256").update(bytes).digest("hex");
  const data = require("../extension/guide-data.js");
  const sandbox = { GuideFlowData: data, JSON, crypto, Uint8Array, btoa, fetch: async url => {
    assert.strictEqual(url, `assets/demo-${hash}.png`);
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } };
  vm.createContext(sandbox);
  const helpers = js.slice(js.indexOf("function createStandaloneExport("), js.indexOf("function startApp()"));
  vm.runInContext(helpers, sandbox);
  assert.strictEqual(typeof sandbox.hydrateDemoAssets, "function");
  const bundle = { meta: {}, session: [{ screenshot: `assets/demo-${hash}.png` }] };
  const resolved = await sandbox.hydrateDemoAssets(bundle);
  assert.strictEqual(resolved.session[0].screenshot, "data:image/png;base64,bG9jYWwtaW1hZ2UtZml4dHVyZQ==");
  await assert.rejects(sandbox.hydrateDemoAssets({ meta: {}, session: [{ screenshot: "https://example.test/image.png" }] }), /image|asset/i);
});
