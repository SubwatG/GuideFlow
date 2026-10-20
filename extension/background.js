// Background Service Worker - GuideFlow
importScripts("capture-utils.js", "guide-data.js", "guide-repository.js");

const captureQueue = [];
let recordingWorker = null;
let stopRequested = false;
let captureEpoch = 0;
let captureJobQueue = Promise.resolve();
let activeCaptureJob = null;
let guideRepository;
let controlQueue = Promise.resolve();
const VISIBLE_CAPTURE_INTERVAL_MS = 550;
let visibleCaptureQueue = Promise.resolve();
let lastVisibleCaptureTime = -Infinity;

function repository() {
  return guideRepository ||= new GuideRepository({ storage: chrome.storage.local, runtime: chrome.runtime, validateBundle: GuideFlowData.validateBundle });
}
function localStorageCall(method, value) {
  return new Promise((resolve, reject) => chrome.storage.local[method](value, result => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message)); else resolve(result);
  }));
}
function control(operation) {
  const next = controlQueue.then(operation);
  controlQueue = next.catch(() => {});
  return next;
}
function cancelCaptures() { captureEpoch++; captureQueue.length = 0; }
function extensionPage(sender) { return !!sender.url && sender.url.startsWith(chrome.runtime.getURL("")); }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const internal = new Set(["GET_GUIDE", "SAVE_GUIDE", "APPEND_STEP", "GET_CAPTURE_IMAGE", "RELEASE_CAPTURE_IMAGE", "START_RECORDING", "STOP_RECORDING", "PAUSE_RECORDING", "RESUME_RECORDING", "MANUAL_SCREEN_CAPTURE", "CANCEL_CAPTURE"]);
  if (internal.has(message.type) && !extensionPage(sender)) {
    sendResponse({ ok: false, error: "This action requires a GuideFlow page" });
    return false;
  }
  if (message.type === "RECORD_CLICK") {
    if (!sender.tab || stopRequested || sender.frameId > 0) { sendResponse({ ok: false }); return false; }
    captureQueue.push({ message, sender, epoch: captureEpoch });
    processCaptureQueue();
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "CROP_AREA_CAPTURE") {
    if (sender.tab && !sender.frameId) handleCropAreaCapture(message, sender);
    sendResponse({ ok: true });
    return false;
  }
  let operation;
  if (message.type === "START_RECORDING") operation = () => control(async () => {
    cancelCaptures(); stopRequested = false;
    await new Promise(resolve => ensureActiveTabContentScript(resolve));
    const snapshot = await repository().start({ append: !!message.append, title: message.title, captureMode: message.captureMode });
    await localStorageCall("set", { status: "recording" });
    updateBadge("recording", snapshot.bundle.session.length);
    return { ok: true, status: "ok", recording: true, count: snapshot.bundle.session.length };
  });
  if (message.type === "STOP_RECORDING") {
    stopRequested = true;
    operation = () => control(async () => {
      await recordingWorker;
      await localStorageCall("set", { status: "idle" }); updateBadge("idle", 0);
      const snapshot = await repository().read();
      return { ok: true, status: "ok", session: snapshot.bundle.session, meta: snapshot.bundle.meta };
    });
  }
  if (message.type === "PAUSE_RECORDING" || message.type === "RESUME_RECORDING") operation = () => control(async () => {
    const status = message.type === "PAUSE_RECORDING" ? "paused" : "recording";
    if (status === "paused") cancelCaptures();
    stopRequested = false;
    await localStorageCall("set", { status });
    const snapshot = await repository().read(); updateBadge(status, snapshot.bundle.session.length);
    return { ok: true, status: "ok" };
  });
  if (message.type === "GET_STATUS") operation = async () => {
    const [state, snapshot] = await Promise.all([localStorageCall("get", ["status"]), repository().read()]);
    return { status: state.status || "idle", stepsCount: snapshot.bundle.session.length, meta: snapshot.bundle.meta };
  };
  if (message.type === "GET_GUIDE") operation = async () => ({ ok: true, ...await repository().read() });
  if (message.type === "SAVE_GUIDE") operation = () => control(async () => {
    const snapshot = await repository().replace(message.bundle, { expectedRevision: message.expectedRevision, recordingId: message.recordingId, newRecording: !!message.importing });
    if (message.importing) { cancelCaptures(); stopRequested = true; await localStorageCall("set", { status: "idle" }); updateBadge("idle", 0); }
    return { ok: true, ...snapshot };
  });
  if (message.type === "APPEND_STEP") operation = async () => {
    const snapshot = await repository().append(message.step, { recordingId: message.recordingId });
    return { ok: true, count: snapshot.bundle.session.length, stepCount: snapshot.bundle.session.length, revision: snapshot.revision, recordingId: snapshot.recordingId };
  };
  if (message.type === "MANUAL_SCREEN_CAPTURE") operation = () => handleManualScreenCapture(message);
  if (message.type === "CANCEL_CAPTURE") operation = async () => { cancelCaptures(); return { ok: true }; };
  if (message.type === "GET_CAPTURE_IMAGE") operation = async () => {
    const key = "capture:" + message.captureId;
    const entry = (await localStorageCall("get", [key]))[key];
    if (!entry) throw new Error("Capture expired; take another screenshot");
    return { ok: true, capture: entry, recordingId: entry.recordingId };
  };
  if (message.type === "RELEASE_CAPTURE_IMAGE") operation = async () => { await localStorageCall("remove", ["capture:" + message.captureId]); return { ok: true }; };
  if (message.type === "GET_PENDING_EDIT_IMAGE") operation = async () => (await localStorageCall("get", ["pendingEditImage"])).pendingEditImage || null;
  if (!operation) return false;
  Promise.resolve().then(operation).then(sendResponse, error => sendResponse({ ok: false, error: error.message || "GuideFlow operation failed" }));
  return true;
});

function processCaptureQueue() {
  if (recordingWorker) return recordingWorker;
  recordingWorker = (async () => {
    while (captureQueue.length) {
      const job = captureQueue.shift();
      try {
        const state = await localStorageCall("get", ["status"]);
        const snapshot = await repository().read();
        if (state.status !== "recording" || job.epoch !== captureEpoch || job.message.recordingId && job.message.recordingId !== snapshot.recordingId) continue;
        const mode = snapshot.bundle.meta.captureMode === "fullpage" ? "fullpage" : "viewport";
        const screenshots = await captureStepImages(job.sender.tab, mode, { epoch: job.epoch, documentId: job.message.documentId });
        if (job.epoch !== captureEpoch) continue;
        const coords = normalizeCaptureCoords(job.message.coords, mode === "fullpage" ? job.message.documentCoords : null, screenshots.imageGeometry);
        const step = { id: crypto.randomUUID(), timestamp: Date.now(), url: job.sender.tab.url, pageTitle: job.sender.tab.title, action: job.message.action || "คลิก", elementTag: job.message.elementTag, elementText: job.message.elementText, description: job.message.description || "คลิกบนหน้าเว็บ", coords, viewport: job.message.viewport, screenshot: screenshots[0], screenshots: Array.from(screenshots), captureMode: mode };
        const saved = await repository().append(step, { recordingId: snapshot.recordingId });
        updateBadge("recording", saved.bundle.session.length);
      } catch (error) {
        await publishCaptureState({ status: "error", error: error.message });
      }
    }
  })().finally(() => { recordingWorker = null; if (captureQueue.length) processCaptureQueue(); });
  return recordingWorker;
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error("Page response timed out; return to the source tab and try again")), 3000);
    function finish(error, response) {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve(response);
    }
    function receive(response, retry) {
      const error = chrome.runtime.lastError;
      if (settled) return;
      if (!error) { finish(response ? null : new Error("No response from content script"), response); return; }
      if (retry || !/Receiving end does not exist|Could not establish connection/i.test(error.message)) { finish(new Error(error.message)); return; }
      chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] }, () => {
        const injectionError = chrome.runtime.lastError;
        if (settled) return;
        if (injectionError) { finish(new Error(injectionError.message)); return; }
        chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, response => receive(response, true));
      });
    }
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, response => receive(response, false));
  });
}

function ensureActiveTabContentScript(done) {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      done();
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "GUIDEFLOW_PING" }, () => {
      if (!chrome.runtime.lastError) {
        done();
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content.js"]
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn("GuideFlow content script injection failed:", chrome.runtime.lastError.message);
        }
        done();
      });
    });
  });
}

function captureVisibleTab(windowId, verify = async () => {}) {
  const capture = visibleCaptureQueue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = VISIBLE_CAPTURE_INTERVAL_MS - (Date.now() - lastVisibleCaptureTime);
      if (wait > 0) await delay(wait);
      lastVisibleCaptureTime = Date.now();

      try {
        await verify();
        return await requestVisibleTabCapture(windowId);
      } catch (error) {
        if (!error.message.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND") || attempt >= 2) {
          throw error;
        }
        // Let Chrome's quota window expire before retrying this same tile.
        await delay(1050);
      }
    }
  });
  // A failed request must not prevent subsequent captures from running.
  visibleCaptureQueue = capture.catch(() => {});
  return capture;
}

function requestVisibleTabCapture(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        reject(new Error(chrome.runtime.lastError?.message || "Empty screenshot"));
        return;
      }
      resolve(dataUrl);
    });
  });
}

// Stitch multiple viewport captures into one high-resolution full-page canvas
async function stitchScreenshots(screenshots, scrollHeight, viewportHeight, viewportWidth, dpr = 1, positions = calculateCapturePositions(scrollHeight, viewportHeight)) {
  const width = Math.floor(viewportWidth * dpr), height = Math.floor(scrollHeight * dpr);
  if (width * height > 64000000 || width > 32767 || height > 32767) throw new Error("Full page is too large; use Visible Part or Selected Area");
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to allocate full-page canvas");
  for (let i = 0; i < screenshots.length; i++) {
    const blob = await (await fetch(screenshots[i])).blob();
    const bmp = await createImageBitmap(blob);
    try { ctx.drawImage(bmp, 0, Math.floor((positions[i] || 0) * dpr)); }
    finally { bmp.close?.(); }
  }
  const stitchedBlob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => reader.result ? resolve(reader.result) : reject(new Error("Unable to encode full-page image"));
    reader.onerror = () => reject(new Error("Unable to encode full-page image"));
    reader.readAsDataURL(stitchedBlob);
  });
}
function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
async function publishCaptureState(state) {
  if (!chrome.storage?.local?.set) return;
  await localStorageCall("set", { captureState: { ...state, updatedAt: Date.now() } }).catch(() => {});
}
function verifyJob(job) {
  if (job.epoch !== captureEpoch) throw new Error("Capture cancelled");
  if (Date.now() - job.startedAt > 120000) throw new Error("Capture timed out; try a smaller page");
}
function assertCaptureTarget(tab) {
  return new Promise((resolve, reject) => chrome.tabs.query({ active: true, windowId: tab.windowId }, tabs => {
    const error = chrome.runtime.lastError;
    if (error) return reject(new Error(error.message));
    const active = tabs?.[0];
    if (!active || active.id !== tab.id || tab.url && active.url && active.url !== tab.url) return reject(new Error("Source tab changed; return to the original tab and try again"));
    resolve();
  }));
}
function captureStepImages(tab, mode, options = {}) {
  const job = { epoch: options.epoch ?? captureEpoch, documentId: options.documentId, startedAt: Date.now(), id: globalThis.crypto?.randomUUID?.() || String(Date.now()) };
  const task = captureJobQueue.then(async () => {
    activeCaptureJob = job;
    try {
      verifyJob(job); await assertCaptureTarget(tab);
      if (mode !== "fullpage") {
        const verify = async () => {
          verifyJob(job); await assertCaptureTarget(tab);
          if (job.documentId) {
            const current = await sendTabMessage(tab.id, { type: "GET_PAGE_METRICS" });
            if (current.documentId !== job.documentId) throw new Error("Page changed during capture");
          }
        };
        const images = [await captureVisibleTab(tab.windowId, verify)];
        await verify();
        if (typeof GuideFlowData !== "undefined") GuideFlowData.safeImageUrl(images[0]);
        return images;
      }
      const metrics = await sendTabMessage(tab.id, { type: "GET_PAGE_METRICS" });
      if (job.documentId && metrics.documentId !== job.documentId) throw new Error("Page changed before capture");
      job.documentId = metrics.documentId;
      const { scrollHeight, viewportHeight, viewportWidth } = metrics;
      const dpr = metrics.dpr || 1;
      if (![scrollHeight, viewportHeight, viewportWidth, dpr].every(v => Number.isFinite(v) && v > 0)) throw new Error("Invalid page dimensions");
      const width = Math.floor(viewportWidth * dpr), height = Math.floor(scrollHeight * dpr);
      if (width * height > 64000000 || width > 32767 || height > 32767) throw new Error("Full page is too large; use Visible Part or Selected Area");
      const positions = calculateCapturePositions(scrollHeight, viewportHeight);
      if (positions.length > 200) throw new Error("Full page exceeds capture tile limit");
      const screenshots = [], actualPositions = [];
      try {
        await publishCaptureState({ status: "capturing", completed: 0, total: positions.length, jobId: job.id });
        for (const scrollY of positions) {
          verifyJob(job); await assertCaptureTarget(tab);
          const scrolled = await sendTabMessage(tab.id, { type: "SET_CAPTURE_SCROLL", scrollY, documentId: job.documentId, hideFixed: scrollY > 0 });
          if (scrolled.ok === false || job.documentId && scrolled.documentId !== job.documentId) throw new Error("Page changed during capture");
          await delay(180);
          const verify = async () => {
            verifyJob(job); await assertCaptureTarget(tab);
            const current = await sendTabMessage(tab.id, { type: "GET_PAGE_METRICS" });
            if (job.documentId && current.documentId !== job.documentId) throw new Error("Page changed during capture");
            if (current.scrollHeight !== scrollHeight || current.viewportWidth !== viewportWidth || current.viewportHeight !== viewportHeight || (current.dpr || 1) !== dpr) throw new Error("Page size changed; wait for content to finish loading and try again");
          };
          screenshots.push(await captureVisibleTab(tab.windowId, verify));
          actualPositions.push(Number.isFinite(scrolled.scrollY) ? scrolled.scrollY : scrollY);
          await publishCaptureState({ status: "capturing", completed: screenshots.length, total: positions.length, jobId: job.id });
        }
      } finally {
        await sendTabMessage(tab.id, { type: "RESTORE_CAPTURE_SCROLL", scrollX: metrics.scrollX || 0, scrollY: metrics.scrollY || 0, documentId: job.documentId }).catch(() => {});
      }
      verifyJob(job); await assertCaptureTarget(tab);
      const images = screenshots.length > 1 ? [await stitchScreenshots(screenshots, scrollHeight, viewportHeight, viewportWidth, dpr, actualPositions)] : screenshots;
      verifyJob(job); await assertCaptureTarget(tab);
      if (typeof GuideFlowData !== "undefined") GuideFlowData.safeImageUrl(images[0]);
      images.imageGeometry = { width: viewportWidth, height: scrollHeight };
      await publishCaptureState({ status: "done", completed: positions.length, total: positions.length, jobId: job.id });
      return images;
    } catch (error) {
      await publishCaptureState({ status: "error", error: error.message, jobId: job.id });
      throw error;
    } finally { activeCaptureJob = null; }
  });
  captureJobQueue = task.catch(() => {});
  return task;
}

function updateBadge(status, count) {
  if (status === "recording") {
    chrome.action.setBadgeText({ text: (count || 0).toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#E8877A" });
  } else if (status === "paused") {
    chrome.action.setBadgeText({ text: "⏸" });
    chrome.action.setBadgeBackgroundColor({ color: "#D2A54B" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

async function handleManualScreenCapture(message) {
  const tabs = await new Promise((resolve, reject) => chrome.tabs.query({ active: true, lastFocusedWindow: true }, result => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(result)));
  const tab = tabs?.[0];
  if (!tab?.id) throw new Error("ไม่พบแท็บที่กำลังเปิดอยู่");
  const snapshot = await repository().read();
  const mode = message.captureMode === "fullpage" ? "fullpage" : "viewport";
  const screenshots = await captureStepImages(tab, mode);
  const screenshot = screenshots[0];
  if (message.actionType === "append") {
    const saved = await repository().append({ id: crypto.randomUUID(), timestamp: Date.now(), url: tab.url, pageTitle: tab.title, action: "แคปหน้าจอ", description: `แคปหน้าจอหน้า ${tab.title || "ปัจจุบัน"}`, screenshot, screenshots: Array.from(screenshots), captureMode: mode, coords: null, viewport: null }, { recordingId: snapshot.recordingId });
    await openCapturePreview(screenshot, tab.title, snapshot.recordingId);
    return { ok: true, actionType: "append", stepCount: saved.bundle.session.length };
  }
  await openCapturePreview(screenshot, tab.title, snapshot.recordingId);
  return { ok: true, actionType: "preview", title: tab.title || "capture" };
}

async function handleCropAreaCapture(message, sender) {
  try {
    const tab = sender.tab;
    const snapshot = await repository().read();
    const shots = await captureStepImages(tab, "viewport");
    const cropped = await cropImageBitmap(shots[0], message.rect);
    if (message.actionType === "append") await repository().append({ id: crypto.randomUUID(), timestamp: Date.now(), action: "แคปเฉพาะส่วน", description: `แคปภาพเฉพาะส่วนบนหน้า ${tab.title || "ปัจจุบัน"}`, screenshot: cropped, screenshots: [cropped], captureMode: "selected", coords: null }, { recordingId: snapshot.recordingId });
    await openCapturePreview(cropped, tab.title, snapshot.recordingId);
  } catch (error) { await publishCaptureState({ status: "error", error: error.message }); }
}

async function cropImageBitmap(dataUrl, rect) {
  if (!rect || ![rect.left, rect.top, rect.width, rect.height, rect.dpr || 1].every(Number.isFinite) || rect.left < 0 || rect.top < 0 || rect.width <= 0 || rect.height <= 0 || (rect.dpr || 1) <= 0) throw new Error("Invalid crop dimensions");
  const pixelWidth = Math.floor(rect.width * (rect.dpr || 1)), pixelHeight = Math.floor(rect.height * (rect.dpr || 1));
  if (pixelWidth > 32767 || pixelHeight > 32767 || pixelWidth * pixelHeight > 64000000) throw new Error("Crop size is too large");
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const imageBitmap = await createImageBitmap(blob);

  const dpr = rect.dpr || 1;
  const sx = Math.floor(rect.left * dpr);
  const sy = Math.floor(rect.top * dpr);
  const sWidth = Math.floor(rect.width * dpr);
  const sHeight = Math.floor(rect.height * dpr);

  const canvas = new OffscreenCanvas(sWidth, sHeight);
  const ctx = canvas.getContext("2d");
  try { ctx.drawImage(imageBitmap, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight); }
  finally { imageBitmap.close?.(); }

  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to encode cropped image"));
    reader.readAsDataURL(croppedBlob);
  });
}

async function openCapturePreview(dataUrl, title, recordingId) {
  const captureId = crypto.randomUUID();
  // Separate keys prevent one preview from replacing an image being annotated elsewhere.
  const all = await localStorageCall("get", null);
  const expired = Object.keys(all).filter(key => key.startsWith("capture:") && Date.now() - (all[key]?.timestamp || 0) > 86400000);
  if (expired.length) await localStorageCall("remove", expired);
  await localStorageCall("set", { ["capture:" + captureId]: { dataUrl, title: title || "ภาพแคปหน้าจอ", timestamp: Date.now(), recordingId } });
  chrome.tabs.create({ url: chrome.runtime.getURL("capture-preview.html?captureId=" + captureId) });
}
function openCaptureEditor(dataUrl, title) { return openCapturePreview(dataUrl, title); }

// Worker globals are disposable; committed drafts are not. Surface interrupted work.
if (chrome.storage?.local) localStorageCall("get", ["captureState"]).then(async state => {
  if (state.captureState?.status === "capturing" && !activeCaptureJob) await publishCaptureState({ status: "error", error: "Previous capture was interrupted; saved guide steps are available" });
}).catch(() => {});
chrome.runtime.onStartup?.addListener(() => localStorageCall("get", ["status"]).then(state => {
  if (state.status === "recording") return localStorageCall("set", { status: "paused" });
}).catch(() => {}));
