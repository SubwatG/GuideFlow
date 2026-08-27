// Background Service Worker - GuideFlow

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_RECORDING") {
    const isAppend = !!message.append;
    chrome.storage.local.get(["currentSession", "sessionMeta"], (res) => {
      const currentSession = isAppend && res.currentSession ? res.currentSession : [];
      const sessionMeta = isAppend && res.sessionMeta ? res.sessionMeta : {
        title: message.title || "คู่มือการใช้งานระบบ",
        startTime: Date.now()
      };
      chrome.storage.local.set({ status: "recording", currentSession, sessionMeta }, () => {
        updateBadge("recording", currentSession.length);
        sendResponse({ status: "ok", recording: true, count: currentSession.length });
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
        meta: res.sessionMeta || { title: "คู่มือการใช้งานระบบ" }
      });
    });
    return true;
  }

  if (message.type === "RECORD_CLICK") {
    chrome.storage.local.get(["status", "currentSession"], (res) => {
      if (res.status !== "recording") return;

      chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) return;

        const currentSession = res.currentSession || [];
        const step = {
          id: "step_" + Date.now(),
          timestamp: Date.now(),
          url: sender.tab.url,
          pageTitle: sender.tab.title,
          action: message.action || "คลิก",
          elementTag: message.elementTag,
          elementText: message.elementText,
          description: message.description || `คลิกที่ ${message.elementText ? '"' + message.elementText + '"' : message.elementTag}`,
          coords: message.coords,
          viewport: message.viewport,
          screenshot: dataUrl
        };

        currentSession.push(step);
        chrome.storage.local.set({ currentSession }, () => {
          updateBadge("recording", currentSession.length);
        });
      });
    });
    return true;
  }
});

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
