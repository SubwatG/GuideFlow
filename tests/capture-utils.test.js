const assert = require("assert");
const { calculateCapturePositions } = require("../extension/capture-utils.js");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("captures a short page once", () => {
  assert.deepStrictEqual(calculateCapturePositions(500, 600), [0]);
});

test("captures every viewport and includes the bottom edge", () => {
  assert.deepStrictEqual(calculateCapturePositions(1600, 600), [0, 600, 1000]);
});

test("handles invalid metrics safely", () => {
  assert.deepStrictEqual(calculateCapturePositions(0, 0), [0]);
  assert.deepStrictEqual(calculateCapturePositions(-1, 600), [0]);
});

test("document coordinates map to the full-page image and boxes clip to image bounds", () => {
  const { normalizeCaptureCoords } = require("../extension/capture-utils.js");
  assert.deepStrictEqual(normalizeCaptureCoords(null, { x: 100, y: 400, box: { left: -10, top: 380, width: 200, height: 40 } }, { width: 1000, height: 1600 }), {
    xPercent: 10, yPercent: 25, box: { left: 0, top: 23.75, width: 19, height: 2.5 }
  });
  assert.deepStrictEqual(normalizeCaptureCoords({ xPercent: 50, yPercent: 50, box: { left: -10, top: 20, width: 150, height: 20 } }), {
    xPercent: 50, yPercent: 50, box: { left: 0, top: 20, width: 100, height: 20 }
  });
});

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { test: asyncTest } = require("node:test");
const backgroundSource = fs.readFileSync(path.join(__dirname, "../extension/background.js"), "utf8");
const quotaError = "This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.";

// Chrome and image codecs are browser boundaries; run the real capture pipeline.
function captureHarness(errors = []) {
  const attempts = [];
  const messages = [];
  let actualScrollY = 0;
  const capturedPositions = [];
  const runtime = { onMessage: { addListener() {} }, lastError: null };
  const context = vm.createContext({
    importScripts() {}, calculateCapturePositions, setTimeout, clearTimeout, Date, console,
    fetch, createImageBitmap: async () => ({}),
    OffscreenCanvas: class {
      getContext() { return { drawImage() {} }; }
      async convertToBlob() { return new Blob(); }
    },
    FileReader: class {
      readAsDataURL() {
        this.result = "data:image/png;base64,c3RpdGNoZWQ=";
        this.onloadend();
      }
    },
    chrome: {
      runtime,
      tabs: {
        query(query, callback) { callback([{ id: 7, windowId: 3 }]); },
        sendMessage(tabId, message, options, callback) {
          if (typeof options === "function") callback = options;
          assert.strictEqual(tabId, 7);
          messages.push(message);
          if (message.type === "SET_CAPTURE_SCROLL" || message.type === "RESTORE_CAPTURE_SCROLL") actualScrollY = message.scrollY;
          callback(message.type === "GET_PAGE_METRICS"
            ? { scrollHeight: 1600, viewportHeight: 600, viewportWidth: 800, scrollX: 10, scrollY: 75, dpr: 1 }
            : { ok: true, scrollY: actualScrollY });
        },
        captureVisibleTab(windowId, options, callback) {
          assert.strictEqual(windowId, 3);
          assert.strictEqual(options.format, "png");
          const now = Date.now();
          const recent = attempts.filter(time => now - time < 1000).length;
          attempts.push(now);
          capturedPositions.push(actualScrollY);
          const error = errors.shift() || (recent >= 2 ? quotaError : null);
          runtime.lastError = error ? { message: error } : null;
          callback(error ? undefined : "data:image/png;base64,c2hvdA==");
          runtime.lastError = null;
        }
      }
    }
  });
  vm.runInContext(backgroundSource, context);
  return { context, attempts, messages, capturedPositions };
}

asyncTest("full-page capture finishes all tiles without exceeding Chrome quota and restores scroll", async () => {
  const { context, attempts, messages } = captureHarness();
  const images = await context.captureStepImages({ id: 7, windowId: 3 }, "fullpage");
  assert.strictEqual(images.length, 1, "one full-page image without duplicate raw tiles");
  assert.strictEqual(attempts.length, 3);
  assert.deepStrictEqual(messages.filter(m => m.type === "SET_CAPTURE_SCROLL").map(m => m.scrollY), [0, 600, 1000]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(messages.at(-1))), {
    type: "RESTORE_CAPTURE_SCROLL", scrollX: 10, scrollY: 75
  });
});

asyncTest("simultaneous viewport requests share the capture quota", async () => {
  const { context } = captureHarness();
  const results = await Promise.all(Array.from({ length: 4 }, () =>
    context.captureStepImages({ id: 7, windowId: 3 }, "viewport")));
  assert.strictEqual(results.length, 4);
  assert(results.every(images => images[0] === "data:image/png;base64,c2hvdA=="));
});

asyncTest("a transient quota error retries the same full-page tile", async () => {
  const { context, messages } = captureHarness([quotaError]);
  const images = await context.captureStepImages({ id: 7, windowId: 3 }, "fullpage");
  assert.strictEqual(images.length, 1);
  assert.deepStrictEqual(messages.filter(m => m.type === "SET_CAPTURE_SCROLL").map(m => m.scrollY), [0, 600, 1000]);
});

asyncTest("full-page jobs serialize scrolling through restoration", async () => {
  const { context, capturedPositions } = captureHarness();
  await Promise.all([context.captureStepImages({ id: 7, windowId: 3 }, "fullpage"), context.captureStepImages({ id: 7, windowId: 3 }, "fullpage")]);
  assert.deepStrictEqual(capturedPositions, [0, 600, 1000, 0, 600, 1000]);
});

asyncTest("inactive source tab is rejected before capturing another tab", async () => {
  const { context, attempts } = captureHarness();
  context.chrome.tabs.query = (query, callback) => callback([{ id: 99, windowId: 3 }]);
  await assert.rejects(context.captureStepImages({ id: 7, windowId: 3 }, "viewport"), /tab|แท็บ/i);
  assert.strictEqual(attempts.length, 0);
});

asyncTest("oversized full pages fail before allocating canvas or capturing tiles", async () => {
  const { context, attempts } = captureHarness();
  context.chrome.tabs.sendMessage = (id, message, options, callback) => (callback || options)({ scrollHeight: 100000, viewportHeight: 600, viewportWidth: 3840, dpr: 2 });
  context.chrome.tabs.captureVisibleTab = () => { attempts.push(Date.now()); throw new Error("Unexpected capture attempt"); };
  await assert.rejects(context.captureStepImages({ id: 7, windowId: 3 }, "fullpage"), /large|ใหญ่|limit|ขนาด/i);
  assert.strictEqual(attempts.length, 0);
});

asyncTest("an unresponsive content script times out instead of blocking the capture queue forever", async () => {
  const { context } = captureHarness();
  context.chrome.tabs.sendMessage = () => {};
  context.setTimeout = fn => setTimeout(fn, 1);
  const result = await Promise.race([
    context.sendTabMessage(7, { type: "GET_PAGE_METRICS" }).then(() => "unexpected", error => /timed out/i.test(error.message) ? "timeout" : error.message),
    new Promise(resolve => setTimeout(() => resolve("hung"), 30))
  ]);
  assert.strictEqual(result, "timeout");
});

asyncTest("crop rejects invalid dimensions before allocating an oversized canvas", async () => {
  const { context } = captureHarness();
  await assert.rejects(context.cropImageBitmap("data:image/png;base64,c2hvdA==", { left: 0, top: 0, width: 100000, height: 100000, dpr: 1 }), /large|dimensions|size/i);
});

asyncTest("cancellation during PNG encoding does not return a successful full-page capture", async () => {
  const { context, messages } = captureHarness();
  context.OffscreenCanvas = class {
    getContext() { return { drawImage() {} }; }
    async convertToBlob() { context.cancelCaptures(); return new Blob(); }
  };
  await assert.rejects(context.captureStepImages({ id: 7, windowId: 3 }, "fullpage"), /cancelled/i);
  assert.strictEqual(messages.at(-1).type, "RESTORE_CAPTURE_SCROLL");
});

asyncTest("persistent quota errors stop after bounded retries and restore scroll", async () => {
  const { context, attempts, messages } = captureHarness(Array(10).fill(quotaError));
  await assert.rejects(context.captureStepImages({ id: 7, windowId: 3 }, "fullpage"), /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/);
  assert(attempts.length > 1 && attempts.length <= 4, "retry transient failures without an endless loop");
  assert.strictEqual(messages.at(-1).type, "RESTORE_CAPTURE_SCROLL");
});

asyncTest("non-quota errors propagate immediately and do not block later captures", async () => {
  const { context, attempts, messages } = captureHarness(["Cannot access contents of this tab"]);
  await assert.rejects(context.captureStepImages({ id: 7, windowId: 3 }, "fullpage"), /Cannot access/);
  assert.strictEqual(attempts.length, 1);
  assert.strictEqual(messages.at(-1).type, "RESTORE_CAPTURE_SCROLL");
  const images = await context.captureStepImages({ id: 7, windowId: 3 }, "viewport");
  assert.strictEqual(images[0], "data:image/png;base64,c2hvdA==");
});
