// Background Service Worker - GuideFlow
importScripts("capture-utils.js");

const captureQueue = [];
let captureInProgress = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_RECORDING") {
    const isAppend = !!message.append;
    ensureActiveTabContentScript(() => {
      chrome.storage.local.get(["currentSession", "sessionMeta"], (res) => {
        const currentSession = isAppend && res.currentSession ? res.currentSession : [];
        const sessionMeta = isAppend && res.sessionMeta ? res.sessionMeta : {
          title: message.title || "คู่มือการใช้งานระบบ",
          startTime: Date.now(),
          captureMode: message.captureMode === "fullpage" ? "fullpage" : "viewport"
        };
        if (!sessionMeta.captureMode) sessionMeta.captureMode = "viewport";
        chrome.storage.local.set({ status: "recording", currentSession, sessionMeta }, () => {
          updateBadge("recording", currentSession.length);
          sendResponse({ status: "ok", recording: true, count: currentSession.length });
        });
      });
    });
    return true;
  }

  if (message.type === "PAUSE_RECORDING") {
    chrome.storage.local.set({ status: "paused" }, () => {
      chrome.storage.local.get(["currentSession"], (res) => {
        updateBadge("paused", res.currentSession ? res.currentSession.length : 0);
        sendResponse({ status: "ok" });
      });
    });
    return true;
  }

  if (message.type === "RESUME_RECORDING") {
    chrome.storage.local.set({ status: "recording" }, () => {
      chrome.storage.local.get(["currentSession"], (res) => {
        updateBadge("recording", res.currentSession ? res.currentSession.length : 0);
        sendResponse({ status: "ok" });
      });
    });
    return true;
  }

  if (message.type === "STOP_RECORDING") {
    chrome.storage.local.set({ status: "idle" }, () => {
      updateBadge("idle", 0);
      chrome.storage.local.get(["currentSession", "sessionMeta"], (res) => {
        sendResponse({ status: "ok", session: res.currentSession || [], meta: res.sessionMeta });
      });
    });
    return true;
  }

  if (message.type === "GET_STATUS") {
    chrome.storage.local.get(["status", "currentSession", "sessionMeta"], (res) => {
      sendResponse({
        status: res.status || "idle",
        stepsCount: res.currentSession ? res.currentSession.length : 0,
        meta: res.sessionMeta || { title: "คู่มือการใช้งานระบบ", captureMode: "viewport" }
      });
    });
    return true;
  }

  if (message.type === "RECORD_CLICK") {
    captureQueue.push({ message, sender });
    processCaptureQueue();
    return true;
  }

  if (message.type === "MANUAL_SCREEN_CAPTURE") {
    handleManualScreenCapture(message, sendResponse);
    return true;
  }

  if (message.type === "CROP_AREA_CAPTURE") {
    handleCropAreaCapture(message, sender);
    return false;
  }

  if (message.type === "GET_PENDING_EDIT_IMAGE") {
    chrome.storage.local.get(["pendingEditImage"], (res) => {
      sendResponse(res.pendingEditImage || null);
    });
    return true;
  }
});

function processCaptureQueue() {
  if (captureInProgress || captureQueue.length === 0) return;
  captureInProgress = true;
  const job = captureQueue.shift();

  chrome.storage.local.get(["status", "currentSession", "sessionMeta"], async (res) => {
    if (res.status !== "recording") {
      captureInProgress = false;
      processCaptureQueue();
      return;
    }

    try {
      const meta = res.sessionMeta || {};
      const captureMode = meta.captureMode === "fullpage" ? "fullpage" : "viewport";
      const screenshots = await captureStepImages(job.sender.tab, captureMode);
      const currentSession = res.currentSession || [];
      const now = Date.now();
      const step = {
        id: "step_" + now + "_" + currentSession.length,
        timestamp: now,
        url: job.sender.tab.url,
        pageTitle: job.sender.tab.title,
        action: job.message.action || "คลิก",
        elementTag: job.message.elementTag,
        elementText: job.message.elementText,
        description: job.message.description || `คลิกที่ ${job.message.elementText ? '"' + job.message.elementText + '"' : job.message.elementTag}`,
        coords: job.message.coords,
        viewport: job.message.viewport,
        screenshot: screenshots[0],
        screenshots,
        captureMode
      };

      currentSession.push(step);
      chrome.storage.local.set({ currentSession }, () => {
        updateBadge("recording", currentSession.length);
        captureInProgress = false;
        processCaptureQueue();
      });
    } catch (error) {
      console.warn("GuideFlow capture failed:", error.message);
      captureInProgress = false;
      processCaptureQueue();
    }
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        // Automatically try injecting content script if missing/receiving end not found
        chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ["content.js"]
        }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          // Retry sending message after injection
          chrome.tabs.sendMessage(tabId, message, (retryRes) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!retryRes) {
              reject(new Error("No response from content script"));
              return;
            }
            resolve(retryRes);
          });
        });
        return;
      }
      if (!response) {
        reject(new Error("No response from content script"));
        return;
      }
      resolve(response);
    });
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

function captureVisibleTab(windowId) {
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
async function stitchScreenshots(screenshots, scrollHeight, viewportHeight, viewportWidth, dpr = 1) {
  const positions = calculateCapturePositions(scrollHeight, viewportHeight);
  const width = Math.floor(viewportWidth * dpr);
  const height = Math.floor(scrollHeight * dpr);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");

  for (let i = 0; i < screenshots.length; i++) {
    const dataUrl = screenshots[i];
    const scrollY = positions[i] || 0;
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const destY = Math.floor(scrollY * dpr);
    ctx.drawImage(bmp, 0, destY);
  }

  const stitchedBlob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(stitchedBlob);
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function captureStepImages(tab, mode) {
  if (mode !== "fullpage") return [await captureVisibleTab(tab.windowId)];

  const metrics = await sendTabMessage(tab.id, { type: "GET_PAGE_METRICS" });
  const positions = calculateCapturePositions(metrics.scrollHeight, metrics.viewportHeight);
  const screenshots = [];

  try {
    for (const scrollY of positions) {
      await sendTabMessage(tab.id, { type: "SET_CAPTURE_SCROLL", scrollY });
      await delay(180);
      screenshots.push(await captureVisibleTab(tab.windowId));
    }
  } finally {
    await sendTabMessage(tab.id, {
      type: "RESTORE_CAPTURE_SCROLL",
      scrollX: metrics.scrollX || 0,
      scrollY: metrics.scrollY || 0
    }).catch(() => {});
  }

  if (screenshots.length > 1) {
    try {
      const stitched = await stitchScreenshots(
        screenshots,
        metrics.scrollHeight,
        metrics.viewportHeight,
        metrics.viewportWidth,
        metrics.dpr || 1
      );
      return [stitched, ...screenshots];
    } catch (stitchErr) {
      console.warn("Full-page stitching fallback:", stitchErr);
    }
  }

  return screenshots.length ? screenshots : [await captureVisibleTab(tab.windowId)];
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

async function handleManualScreenCapture(message, sendResponse) {
  try {
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve);
    });
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      sendResponse({ ok: false, error: "ไม่พบแท็บที่กำลังเปิดอยู่" });
      return;
    }

    const mode = message.captureMode === "fullpage" ? "fullpage" : "viewport";
    const screenshots = await captureStepImages(tab, mode);
    const screenshot = screenshots[0] || "";

    openCapturePreview(screenshot, tab.title);

    if (message.actionType === "append") {
      chrome.storage.local.get(["currentSession", "sessionMeta"], (res) => {
        const currentSession = res.currentSession || [];
        const sessionMeta = res.sessionMeta || {
          title: "คู่มือการใช้งานระบบ",
          startTime: Date.now(),
          captureMode: mode
        };
        const now = Date.now();
        const step = {
          id: "step_" + now + "_" + currentSession.length,
          timestamp: now,
          url: tab.url,
          pageTitle: tab.title,
          action: "แคปหน้าจอ",
          elementTag: "screen",
          elementText: "Manual Screen Capture",
          description: `แคปหน้าจอหน้า ${tab.title || "ปัจจุบัน"}`,
          coords: null,
          viewport: null,
          screenshot,
          screenshots,
          captureMode: mode
        };
        currentSession.push(step);
        chrome.storage.local.set({ currentSession, sessionMeta }, () => {
          sendResponse({
            ok: true,
            actionType: "append",
            stepCount: currentSession.length,
            title: tab.title,
            screenshot
          });
        });
      });
      return;
    }

    sendResponse({
      ok: true,
      actionType: message.actionType || "preview",
      screenshot,
      title: tab.title || "capture"
    });
  } catch (error) {
    sendResponse({ ok: false, error: error.message || "การแคปภาพหน้าจอล้มเหลว" });
  }
}

async function handleCropAreaCapture(message, sender) {
  try {
    const tab = sender.tab;
    if (!tab) return;

    const fullDataUrl = await captureVisibleTab(tab.windowId);
    const croppedDataUrl = await cropImageBitmap(fullDataUrl, message.rect);
    const actionType = message.actionType || "preview";

    // Open capture preview viewer for EVERY list / action choice
    openCapturePreview(croppedDataUrl, tab.title);

    if (actionType === "append") {
      chrome.storage.local.get(["currentSession", "sessionMeta"], (res) => {
        const currentSession = res.currentSession || [];
        const sessionMeta = res.sessionMeta || {
          title: "คู่มือการใช้งานระบบ",
          startTime: Date.now(),
          captureMode: "selected"
        };
        const now = Date.now();
        const step = {
          id: "step_" + now + "_" + currentSession.length,
          timestamp: now,
          url: tab.url,
          pageTitle: tab.title,
          action: "แคปเฉพาะส่วน",
          elementTag: "crop",
          elementText: "Selected Area Capture",
          description: `แคปภาพเฉพาะส่วนบนหน้า ${tab.title || "ปัจจุบัน"}`,
          coords: null,
          viewport: null,
          screenshot: croppedDataUrl,
          screenshots: [croppedDataUrl],
          captureMode: "selected"
        };
        currentSession.push(step);
        chrome.storage.local.set({ currentSession, sessionMeta });
      });
      return;
    }

    if (actionType === "download") {
      const safeTitle = (tab.title || "crop").replace(/[^a-zA-Z0-9ก-๙_-]/g, "_").slice(0, 30);
      const filename = `guideflow_selected_${safeTitle}_${Date.now()}.png`;
      chrome.downloads.download({
        url: croppedDataUrl,
        filename,
        saveAs: false
      });
      return;
    }
  } catch (err) {
    console.warn("Crop area capture failed:", err);
  }
}

async function cropImageBitmap(dataUrl, rect) {
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
  ctx.drawImage(imageBitmap, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(croppedBlob);
  });
}

function openCapturePreview(dataUrl, title) {
  chrome.storage.local.set({
    singleCapturePreview: {
      dataUrl,
      title: title || "ภาพแคปหน้าจอ",
      timestamp: Date.now()
    }
  }, () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("capture-preview.html") });
  });
}

function openCaptureEditor(dataUrl, title) {
  openCapturePreview(dataUrl, title);
}



