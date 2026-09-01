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

  if (message.type === "CLEAR_RECORDING") {
    chrome.storage.local.remove(["currentSession", "sessionMeta"], () => {
      chrome.storage.local.set({ status: "idle" }, () => {
        updateBadge("idle", 0);
        sendResponse({ status: "ok", session: [], count: 0 });
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
        reject(new Error(chrome.runtime.lastError.message));
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
      await delay(120);
      screenshots.push(await captureVisibleTab(tab.windowId));
    }
  } finally {
    await sendTabMessage(tab.id, {
      type: "RESTORE_CAPTURE_SCROLL",
      scrollX: metrics.scrollX || 0,
      scrollY: metrics.scrollY || 0
    }).catch(() => {});
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
