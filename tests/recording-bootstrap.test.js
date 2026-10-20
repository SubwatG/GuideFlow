const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
const content = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));

assert.match(background, /chrome\.scripting\.executeScript/);
assert.match(content, /GUIDEFLOW_PING/);
assert(manifest.permissions.includes("scripting"));
console.log("PASS recording bootstrap injects content script when needed");

const { test } = require("node:test");
test("recording bootstrap injects into the active tab when ping has no receiver", () => {
  const vm = require("vm");
  let injected = false, completed = false;
  const runtime = { onMessage: { addListener() {} }, lastError: null };
  const context = vm.createContext({ importScripts() {}, console, chrome: {
    runtime,
    tabs: { query(query, cb) { cb([{ id: 7 }]); }, sendMessage(id, message, cb) { runtime.lastError = { message: "No receiver" }; cb(); runtime.lastError = null; } },
    scripting: { executeScript(details, cb) { assert.strictEqual(details.target.tabId, 7); assert.strictEqual(details.files[0], "content.js"); injected = true; runtime.lastError = null; cb(); } }
  } });
  vm.runInContext(background, context);
  context.ensureActiveTabContentScript(() => { completed = true; });
  assert(injected && completed);
});
function repositoryHarness(legacy = {}) {
  const { GuideRepository } = require("../extension/guide-repository.js");
  let record = null;
  const blobs = new Map();
  const local = structuredClone(legacy);
  const backend = {
    async read() { return structuredClone(record); },
    async image(id) { return blobs.get(id); },
    async commit(next, images, removed) {
      if (backend.fail) throw new Error("Disk write failed");
      record = structuredClone(next);
      for (const [id, blob] of images) blobs.set(id, blob);
      for (const id of removed) blobs.delete(id);
    }
  };
  const repo = new GuideRepository({
    backend, crypto, validateBundle: input => structuredClone(input),
    storage: {
      get(keys, cb) { cb(structuredClone(local)); },
      set(values, cb) { Object.assign(local, values); cb?.(); },
      remove(keys, cb) { for (const key of keys) delete local[key]; cb?.(); }
    },
    imageToBlob: async value => new Blob([value]),
    blobToImage: async blob => blob.text()
  });
  return { repo, backend, local, blobs, reload: () => new GuideRepository({
    backend, crypto, validateBundle: input => structuredClone(input),
    storage: { get(keys, cb) { cb(local); }, set(values, cb) { Object.assign(local, values); cb?.(); }, remove(keys, cb) { cb?.(); } },
    imageToBlob: async value => new Blob([value]), blobToImage: async blob => blob.text()
  }) };
}
const shot = "data:image/png;base64,c2hvdA==";
const sampleStep = id => ({ id, description: id, screenshot: shot, screenshots: [shot] });

test("concurrent appends retain both steps and deduplicate image blobs", async () => {
  const h = repositoryHarness();
  const initial = await h.repo.read();
  await Promise.all([h.repo.append(sampleStep("a"), { recordingId: initial.recordingId }), h.repo.append(sampleStep("b"), { recordingId: initial.recordingId })]);
  const result = await h.repo.read();
  assert.deepStrictEqual(result.bundle.session.map(s => s.id), ["a", "b"]);
  assert.strictEqual(h.blobs.size, 1);
  assert(!JSON.stringify(h.local).includes(shot), "local storage must contain metadata, not base64 screenshots");
  assert.deepStrictEqual((await h.reload().read()).bundle, result.bundle, "worker restart retains draft and images");
});

test("stale editor saves and old recording jobs cannot overwrite a newer guide", async () => {
  const { repo } = repositoryHarness();
  const initial = await repo.read();
  await repo.append(sampleStep("a"), { recordingId: initial.recordingId });
  await assert.rejects(repo.replace(initial.bundle, { expectedRevision: initial.revision, recordingId: initial.recordingId }), /conflict|changed/i);
  const fresh = await repo.start({ title: "fresh", append: false, captureMode: "viewport" });
  await assert.rejects(repo.append(sampleStep("old"), { recordingId: initial.recordingId }), /recording|changed|conflict/i);
  assert.strictEqual((await repo.read()).recordingId, fresh.recordingId);
  assert.strictEqual((await repo.read()).bundle.session.length, 0);
});

test("failed migration leaves the legacy guide intact and failed replace retains committed draft", async () => {
  const h = repositoryHarness({ currentSession: [sampleStep("legacy")], sessionMeta: { title: "legacy" } });
  h.backend.fail = true;
  await assert.rejects(h.repo.read(), /Disk write failed/);
  assert.strictEqual(h.local.currentSession[0].id, "legacy");
  h.backend.fail = false;
  const original = await h.repo.read();
  assert.strictEqual(h.local.currentSession, undefined, "remove legacy only after committed migration");
  h.backend.fail = true;
  await assert.rejects(h.repo.replace({ meta: { title: "replacement" }, session: [] }, { expectedRevision: original.revision, recordingId: original.recordingId }), /Disk write failed/);
  h.backend.fail = false;
  assert.strictEqual((await h.repo.read()).bundle.session[0].id, "legacy");
});

test("import replaces recording identity so pending old captures cannot append to the imported guide", async () => {
  const { repo } = repositoryHarness();
  const original = await repo.read();
  const imported = await repo.replace({ meta: { title: "imported" }, session: [sampleStep("imported")] }, { expectedRevision: original.revision, recordingId: original.recordingId, newRecording: true });
  assert.notStrictEqual(imported.recordingId, original.recordingId);
  await assert.rejects(repo.append(sampleStep("old"), { recordingId: original.recordingId }), /recording|changed/i);
  assert.deepStrictEqual((await repo.read()).bundle.session.map(step => step.id), ["imported"]);
});


// Optional real-browser gate. Point this to an existing Playwright installation;
// the ordinary suite remains dependency-free and uses no personal browser data.
if (process.env.GUIDEFLOW_BROWSER_MODULE) test("Chromium integration: durable guides, safe imports/exports, capture and redaction", async () => {
  const { chromium } = require(process.env.GUIDEFLOW_BROWSER_MODULE);
  const http = require("http");
  let exported = "";
  const htmlPage = '<!doctype html><style>body{margin:0;height:1800px;background:#ffeedd}header{position:fixed;top:0;background:yellow;width:100%;height:40px}button{position:absolute;top:900px;left:100px;width:150px;height:40px}input{position:absolute;top:100px}</style><header>Fixed header</header><input type="password" value="SYNTHETIC_PRIVATE_MARKER"><button>Save item</button>';
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (/^\/docs\/assets\/demo-[a-f0-9]{64}\.(png|jpeg|webp|gif)$/.test(url.pathname)) {
      response.end(fs.readFileSync(path.join(root, url.pathname.slice(1)))); return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    if (url.pathname === "/docs/") response.end(fs.readFileSync(path.join(root, "docs/index.html")));
    else if (url.pathname === "/standalone") response.end(fs.readFileSync(path.join(root, "viewer/demo-guide-standalone.html")));
    else if (url.pathname === "/export") response.end(exported);
    else response.end(htmlPage);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browserContext;
  try {
    browserContext = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, viewport: { width: 1000, height: 600 }, args: ["--disable-extensions-except=" + path.join(root, "extension"), "--load-extension=" + path.join(root, "extension")] });
    let worker = browserContext.serviceWorkers()[0] || await browserContext.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const errors = [];
    browserContext.on("page", page => page.on("pageerror", error => errors.push(error.message)));
    const web = await browserContext.newPage(); await web.goto(origin);
    const image = await web.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = canvas.height = 2; canvas.getContext("2d").fillRect(0, 0, 2, 2); return canvas.toDataURL(); });
    await worker.evaluate(async image => chrome.storage.local.set({ currentSession: [{ id: "legacy", description: "legacy", screenshot: image, coords: { xPercent: 10, yPercent: 20, box: { left: -10, top: -5, width: 150, height: 20 } } }], sessionMeta: { title: "legacy" } }), image);
    const ui = await browserContext.newPage(); await ui.goto(`chrome-extension://${extensionId}/viewer.html`);
    const rpc = message => ui.evaluate(message => chrome.runtime.sendMessage(message), message);
    async function waitGuide(predicate) {
      for (let attempt = 0; attempt < 100; attempt++) { const value = await rpc({ type: "GET_GUIDE" }); if (value.ok && predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 50)); }
      throw new Error("Browser guide state did not reach the expected condition");
    }
    let snapshot = await waitGuide(value => value.bundle.session.length === 1);
    assert.strictEqual(snapshot.bundle.session[0].screenshot, image);
    assert.strictEqual(snapshot.bundle.session[0].coords.box.height, 15);
    const local = await ui.evaluate(() => chrome.storage.local.get(null));
    assert.strictEqual(local.currentSession, undefined); assert(!JSON.stringify(local).includes(image));
    const replies = await Promise.all(["a", "b"].map(id => rpc({ type: "APPEND_STEP", recordingId: snapshot.recordingId, step: { id, screenshot: image, description: id } })));
    assert(replies.every(reply => reply.ok)); snapshot = await waitGuide(value => value.bundle.session.length === 3);
    const stale = await rpc({ type: "SAVE_GUIDE", bundle: snapshot.bundle, expectedRevision: snapshot.revision - 1, recordingId: snapshot.recordingId }); assert.strictEqual(stale.ok, false);
    // Abort a real IndexedDB write transaction before it can commit.
    await worker.evaluate(() => { globalThis.originalGuidePut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { const request = originalGuidePut.apply(this, args); if (this.name === "drafts") { const transaction = this.transaction; request.addEventListener("success", () => transaction.abort(), { once: true }); } return request; }; });
    const failedSave = await rpc({ type: "SAVE_GUIDE", bundle: { meta: { title: "must not commit" }, session: [] }, expectedRevision: snapshot.revision, recordingId: snapshot.recordingId });
    await worker.evaluate(() => { IDBObjectStore.prototype.put = originalGuidePut; delete globalThis.originalGuidePut; });
    assert.strictEqual(failedSave.ok, false); assert.strictEqual((await rpc({ type: "GET_GUIDE" })).revision, snapshot.revision);
    const browser = browserContext.browser(); const cdp = await browser.newBrowserCDPSession();
    const target = (await cdp.send("Target.getTargets")).targetInfos.find(target => target.type === "service_worker" && target.url.includes(extensionId));
    assert(target); await cdp.send("Target.closeTarget", { targetId: target.targetId }); await cdp.detach();
    snapshot = await waitGuide(value => value.bundle.session.length === 3); assert.strictEqual(snapshot.bundle.session[0].screenshot, image);
    worker = browserContext.serviceWorkers().find(item => item.url().includes(extensionId)) || await browserContext.waitForEvent("serviceworker");
    const description = "</ScRiPt><b>INERT</b> $& ;";
    const bundle = { meta: { title: "Imported synthetic" }, session: [{ id: "imported", description, screenshot: image, screenshots: [image] }] };
    await ui.locator("#fileInput").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bundle)) });
    snapshot = await waitGuide(value => value.bundle.meta.title === "Imported synthetic");
    assert.strictEqual(await ui.locator(".doc-step-title").textContent(), description); assert.strictEqual(await ui.locator(".doc-step-title b").count(), 0);
    const revision = snapshot.revision;
    await ui.locator("#fileInput").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"session":"bad"}') });
    await ui.waitForFunction(() => document.getElementById("toastMessage").textContent.includes("นำเข้าไม่สำเร็จ")); assert.strictEqual((await rpc({ type: "GET_GUIDE" })).revision, revision);
    async function download(page, button) { const pending = page.waitForEvent("download"); await page.locator(button).click(); const result = await pending; const chunks = []; for await (const chunk of await result.createReadStream()) chunks.push(chunk); return Buffer.concat(chunks); }
    exported = (await download(ui, "#btnExportHtml")).toString("utf8"); assert(!exported.includes("</ScRiPt><b>INERT"));
    await ui.reload(); await ui.waitForFunction(() => document.querySelector(".doc-step-title")?.textContent.includes("INERT"));
    const standalone = await browserContext.newPage(); await standalone.goto(origin + "/export"); assert.strictEqual(await standalone.locator("#slideStepTitle").textContent(), description);
    await standalone.locator("#slideStepTitle").fill("Updated; $&"); await standalone.locator("#slideStepTitle").blur();
    const reexport = (await download(standalone, "#btnExportHtml")).toString("utf8"); const embedded = JSON.parse(/<script id="guideflow-data" type="application\/json">([\s\S]*?)<\/script>/.exec(reexport)[1]); assert.strictEqual(embedded.session[0].description, "Updated; $&");
    await web.bringToFront(); assert((await rpc({ type: "START_RECORDING", title: "Synthetic", captureMode: "fullpage", append: false })).ok);
    await web.evaluate(() => window.scrollTo(0, 650)); await web.locator("button").click(); snapshot = await waitGuide(value => value.bundle.session.length === 1); assert(Math.abs(snapshot.bundle.session[0].coords.yPercent - 920 / 1800 * 100) < 0.1); assert.strictEqual(await web.evaluate(() => window.scrollY), 650);
    await web.evaluate(() => window.scrollTo(0, 0)); await web.locator("input").click(); snapshot = await waitGuide(value => value.bundle.session.length === 2); assert(!JSON.stringify(snapshot.bundle).includes("SYNTHETIC_PRIVATE_MARKER")); assert((await rpc({ type: "STOP_RECORDING" })).ok);
    await web.evaluate(() => window.scrollTo(0, 125)); await web.bringToFront(); const opening = browserContext.waitForEvent("page"); assert((await rpc({ type: "MANUAL_SCREEN_CAPTURE", captureMode: "fullpage" })).ok); const preview = await opening;
    await preview.waitForFunction(() => document.getElementById("previewImg").naturalHeight === 1800); assert.strictEqual(await web.evaluate(() => window.scrollY), 125); assert.strictEqual(await web.locator("header").evaluate(element => element.style.visibility), "");
    const originalImage = await preview.locator("#previewImg").getAttribute("src"); await web.bringToFront();
    const capture = rpc({ type: "MANUAL_SCREEN_CAPTURE", captureMode: "fullpage" });
    for (let attempt = 0; attempt < 60; attempt++) { const state = await ui.evaluate(() => chrome.storage.local.get("captureState")); if (state.captureState?.status === "capturing") break; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert((await rpc({ type: "CANCEL_CAPTURE" })).ok); assert.strictEqual((await capture).ok, false); assert.strictEqual(await web.evaluate(() => window.scrollY), 125);
    await preview.bringToFront(); await preview.locator("#toolRedact").click(); const box = await preview.locator("#paintCanvas").boundingBox();
    async function drawRedaction() { await preview.mouse.move(box.x + box.width * .1, box.y + box.height * .1); await preview.mouse.down(); await preview.mouse.move(box.x + box.width * .2, box.y + box.height * .2); await preview.mouse.up(); }
    await drawRedaction(); assert.deepStrictEqual(await preview.locator("#paintCanvas").evaluate(canvas => Array.from(canvas.getContext("2d").getImageData(150, 270, 1, 1).data)), [0, 0, 0, 255]);
    await preview.locator("#btnUndo").click(); assert.strictEqual(await preview.locator("#paintCanvas").evaluate(canvas => canvas.getContext("2d").getImageData(150, 270, 1, 1).data[3]), 0); await drawRedaction();
    const png = await download(preview, "#btnDownload"); const pixels = await preview.evaluate(async base64 => { const bitmap = await createImageBitmap(await (await fetch("data:image/png;base64," + base64)).blob()); const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height; const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close(); return Array.from(context.getImageData(150, 270, 1, 1).data); }, png.toString("base64")); assert.deepStrictEqual(pixels, [0, 0, 0, 255]); assert.strictEqual(await preview.locator("#previewImg").getAttribute("src"), originalImage);
    const hosted = await browserContext.newPage(); await hosted.goto(origin + "/docs/"); await hosted.waitForFunction(() => document.querySelectorAll(".timeline-dot").length === 31);
    const demo = await browserContext.newPage(); await demo.goto(origin + "/standalone"); await demo.waitForFunction(() => document.querySelectorAll(".timeline-dot").length === 4);
    assert.deepStrictEqual(errors, []); console.log("Chromium version: " + browser.version()); console.log("PASS real Chromium migration, transaction rollback, worker restart, safe import/export, recording, fullpage/cancel, opaque redaction and both demos");
  } finally {
    if (browserContext) await browserContext.close();
    await new Promise(resolve => server.close(resolve));
  }
});
