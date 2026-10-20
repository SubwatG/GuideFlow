// GuideFlow content script.
// The script may be injected again by the service worker after a stale
// extension context. Keep all state inside one guarded IIFE so the second
// evaluation does not redeclare bindings or attach duplicate listeners.
(function installGuideFlowContent() {
  if (typeof window === "undefined" || window.__guideFlowContentLoaded) return;
  window.__guideFlowContentLoaded = true;

  const documentId = window.__guideFlowDocumentId || createDocumentId();
  window.__guideFlowDocumentId = documentId;
  let isFullPageCapture = false;
  let hiddenFixedElements = null;
  let captureRestoreTimer = null;
  let originalCaptureScroll = null;

  function createDocumentId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }
    } catch (_) {
      // Fall through to a local token for older pages/isolated worlds.
    }
    let randomPart = "";
    try {
      if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        randomPart = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
    } catch (_) {
      // Math.random below is only a uniqueness fallback, never a secret.
    }
    if (!randomPart) randomPart = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    return `gf-${randomPart}`;
  }

  function isExtensionContextValid() {
    try {
      return typeof chrome !== "undefined" && Boolean(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function messageBelongsToDocument(message) {
    return !message || !message.documentId || message.documentId === documentId;
  }

  function getScrollX() {
    return Number.isFinite(window.scrollX) ? window.scrollX : (Number(window.pageXOffset) || 0);
  }

  function getScrollY() {
    return Number.isFinite(window.scrollY) ? window.scrollY : (Number(window.pageYOffset) || 0);
  }

  function getPageUrl() {
    try {
      return typeof window.location?.href === "string" ? window.location.href : "";
    } catch (_) {
      return "";
    }
  }

  function getElementText(element, tagName, role) {
    if (!element || typeof element.getAttribute !== "function") return "";
    const ariaLabel = element.getAttribute("aria-label");
    const title = element.getAttribute("title") || element.title;
    const alt = element.getAttribute("alt");
    const placeholder = element.getAttribute("placeholder");
    const explicitLabel = ariaLabel || title || alt || placeholder;
    if (explicitLabel) return String(explicitLabel).trim();

    // Form controls are intentionally described only by their type/tag. The
    // live control value can contain passwords or private user input, so it is
    // never read. Buttons and links may use their visible label as a fallback;
    // other elements use their tag name when no accessible label exists.
    if (tagName === "input" || tagName === "textarea" || tagName === "select") {
      return element.getAttribute("type") || tagName;
    }
    const isVisibleLabelControl = tagName === "button" || tagName === "a" ||
      ["button", "tab", "menuitem", "checkbox", "radio", "switch"].includes(role);
    if (isVisibleLabelControl) {
      const visibleText = typeof element.innerText === "string"
        ? element.innerText
        : (typeof element.textContent === "string" ? element.textContent : "");
      if (visibleText.trim()) return visibleText.trim();
    }
    return tagName;
  }

  function resolveElementInfo(target) {
    const source = target && typeof target.closest === "function" ? target : document.documentElement;
    const selector = "button, a, input, textarea, select, [role='button'], [role='tab'], [role='menuitem'], [role='checkbox'], [role='radio'], [role='switch']";
    const closest = source && typeof source.closest === "function" ? source.closest(selector) : null;
    const element = closest || source;
    const tagName = String(element?.tagName || "element").toLowerCase();
    const role = typeof element?.getAttribute === "function" ? (element.getAttribute("role") || "") : "";
    const text = getElementText(element, tagName, role).replace(/\s+/g, " ").slice(0, 55);
    const type = tagName === "input" && typeof element?.getAttribute === "function"
      ? (element.getAttribute("type") || "text").toLowerCase()
      : "";

    let actionDesc = "";
    if (tagName === "button" || role === "button") {
      actionDesc = text ? `คลิกที่ปุ่ม "${text}"` : "คลิกที่ปุ่ม";
    } else if (tagName === "a") {
      actionDesc = text ? `คลิกลิงก์ "${text}"` : "คลิกลิงก์";
    } else if (tagName === "input") {
      if (type === "checkbox" || type === "radio") {
        actionDesc = text ? `เลือก "${text}"` : "คลิกเลือกตัวเลือก";
      } else if (type === "submit" || type === "button") {
        actionDesc = text ? `คลิกที่ปุ่ม "${text}"` : "คลิกที่ปุ่ม";
      } else {
        actionDesc = text ? `คลิกที่ช่องกรอกข้อมูล "${text}"` : "คลิกที่ช่องกรอกข้อมูล";
      }
    } else if (tagName === "textarea") {
      actionDesc = text ? `คลิกที่กล่องข้อความ "${text}"` : "คลิกที่กล่องข้อความ";
    } else if (tagName === "select") {
      actionDesc = text ? `คลิกเลือกรายการ "${text}"` : "คลิกเลือกรายการ";
    } else if (role === "tab") {
      actionDesc = text ? `คลิกที่แท็บ "${text}"` : "คลิกที่แท็บ";
    } else {
      actionDesc = text ? `คลิกที่ "${text}"` : "คลิกบนหน้าจอ";
    }

    return { element, tagName, text, actionDesc };
  }

  function hideFixedElements() {
    if (hiddenFixedElements || typeof document.querySelectorAll !== "function") return;
    const saved = [];
    let elements;
    try {
      elements = document.querySelectorAll("*");
    } catch (_) {
      return;
    }
    elements.forEach((element) => {
      if (!element || !element.style) return;
      let position = "";
      try {
        position = window.getComputedStyle(element).position;
      } catch (_) {
        return;
      }
      if (position !== "fixed" && position !== "sticky") return;
      const style = element.style;
      const visibility = typeof style.getPropertyValue === "function"
        ? style.getPropertyValue("visibility")
        : (style.visibility || "");
      const priority = typeof style.getPropertyPriority === "function"
        ? style.getPropertyPriority("visibility")
        : "";
      saved.push({ element, visibility, priority });
      if (typeof style.setProperty === "function") {
        style.setProperty("visibility", "hidden", "important");
      } else {
        style.visibility = "hidden";
      }
    });
    hiddenFixedElements = saved;
  }

  function restoreFixedElements() {
    if (!hiddenFixedElements) return;
    for (const { element, visibility, priority } of hiddenFixedElements) {
      try {
        if (!element || !element.style) continue;
        if (typeof element.style.setProperty === "function") {
          if (visibility) element.style.setProperty("visibility", visibility, priority);
          else if (typeof element.style.removeProperty === "function") element.style.removeProperty("visibility");
          else element.style.visibility = "";
        } else {
          element.style.visibility = visibility;
        }
      } catch (_) {
        // Elements may have been removed while the capture was running.
      }
    }
    hiddenFixedElements = null;
  }

  function removeFeedbackIndicators() {
    if (typeof document.querySelectorAll !== "function") return;
    try {
      document.querySelectorAll("#local-scribe-indicator").forEach((indicator) => {
        if (indicator && typeof indicator.remove === "function") indicator.remove();
      });
    } catch (_) {
      // A page can tear down its document while a capture message is queued.
    }
  }

  function nextFrame() {
    return new Promise((resolve) => {
      const raf = typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
      if (!raf) {
        setTimeout(resolve, 0);
        return;
      }
      raf(() => resolve());
    });
  }

  async function waitForScrollToSettle() {
    await nextFrame();
    await nextFrame();
  }

  function scrollTo(left, top) {
    try {
      window.scrollTo({ left, top, behavior: "instant" });
    } catch (_) {
      try {
        window.scrollTo(left, top);
      } catch (_) {
        // Some restricted pages expose no scrolling API. The response still
        // reports the actual coordinates observed below.
      }
    }
  }

  window.addEventListener("click", (event) => {
    if (event.target && typeof event.target.closest === "function" && event.target.closest("#local-scribe-indicator")) return;
    if (!isExtensionContextValid()) return;

    try {
      chrome.storage.local.get(["status"], (result) => {
        if (!isExtensionContextValid() || !result || result.status !== "recording") return;

        const info = resolveElementInfo(event.target);
        const rect = info.element && typeof info.element.getBoundingClientRect === "function"
          ? info.element.getBoundingClientRect()
          : { top: event.clientY, left: event.clientX, width: 0, height: 0 };
        const viewportWidth = Number(window.innerWidth) || 0;
        const viewportHeight = Number(window.innerHeight) || 0;
        const scrollX = getScrollX();
        const scrollY = getScrollY();
        const safeWidth = viewportWidth > 0 ? viewportWidth : 1;
        const safeHeight = viewportHeight > 0 ? viewportHeight : 1;

        if (!isFullPageCapture) showFeedback(event.clientX, event.clientY);

        try {
          chrome.runtime.sendMessage({
            type: "RECORD_CLICK",
            documentId,
            recordingId: result.recordingId,
            elementTag: info.tagName,
            elementText: info.text,
            description: info.actionDesc,
            coords: {
              xPercent: Number(((event.clientX / safeWidth) * 100).toFixed(2)),
              yPercent: Number(((event.clientY / safeHeight) * 100).toFixed(2)),
              box: {
                top: Number(((rect.top / safeHeight) * 100).toFixed(2)),
                left: Number(((rect.left / safeWidth) * 100).toFixed(2)),
                width: Number(((rect.width / safeWidth) * 100).toFixed(2)),
                height: Number(((rect.height / safeHeight) * 100).toFixed(2))
              }
            },
            documentCoords: {
              x: event.clientX + scrollX,
              y: event.clientY + scrollY,
              box: {
                left: rect.left + scrollX,
                top: rect.top + scrollY,
                width: rect.width,
                height: rect.height
              }
            },
            viewport: { width: viewportWidth, height: viewportHeight, dpr: window.devicePixelRatio || 1 }
          });
        } catch (_) {
          // The extension may have been reloaded while this page stayed open.
        }
      });
    } catch (_) {
      // Ignore invalidated extension contexts from stale content scripts.
    }
  }, true);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (!messageBelongsToDocument(message)) return false;

    if (message.type === "GUIDEFLOW_PING") {
      sendResponse({ ok: true, documentId });
      return false;
    }

    if (message.type === "GET_PAGE_METRICS") {
      if (window.top !== window) return false;
      const rootScrollHeight = Number(document.documentElement?.scrollHeight) || 0;
      const bodyScrollHeight = Number(document.body?.scrollHeight) || 0;
      sendResponse({
        ok: true,
        documentId,
        url: getPageUrl(),
        scrollHeight: Math.max(rootScrollHeight, bodyScrollHeight),
        viewportHeight: Number(window.innerHeight) || 0,
        viewportWidth: Number(window.innerWidth) || 0,
        scrollX: getScrollX(),
        scrollY: getScrollY(),
        dpr: Number(window.devicePixelRatio) || 1
      });
      return false;
    }

    if (message.type === "SET_CAPTURE_SCROLL") {
      if (window.top !== window) return false;
      if (!isFullPageCapture) originalCaptureScroll = { x: getScrollX(), y: getScrollY() };
      if (captureRestoreTimer) clearTimeout(captureRestoreTimer);
      // A terminated worker cannot execute finally; restore page state independently.
      captureRestoreTimer = setTimeout(() => {
        restoreFixedElements(); isFullPageCapture = false;
        if (originalCaptureScroll) scrollTo(originalCaptureScroll.x, originalCaptureScroll.y);
        originalCaptureScroll = null;
      }, 35000);
      isFullPageCapture = true;
      removeFeedbackIndicators();
      if (message.hideFixed === false) restoreFixedElements();
      else if (message.hideFixed === true) hideFixedElements();
      scrollTo(0, Number.isFinite(Number(message.scrollY)) ? Number(message.scrollY) : 0);
      waitForScrollToSettle().then(() => {
        sendResponse({ ok: true, documentId, scrollX: getScrollX(), scrollY: getScrollY() });
      });
      return true;
    }

    if (message.type === "RESTORE_CAPTURE_SCROLL") {
      if (window.top !== window) return false;
      if (captureRestoreTimer) clearTimeout(captureRestoreTimer);
      captureRestoreTimer = null; originalCaptureScroll = null;
      restoreFixedElements(); isFullPageCapture = false;
      scrollTo(
        Number.isFinite(Number(message.scrollX)) ? Number(message.scrollX) : 0,
        Number.isFinite(Number(message.scrollY)) ? Number(message.scrollY) : 0
      );
      sendResponse({ ok: true, documentId, scrollX: getScrollX(), scrollY: getScrollY() });
      return false;
    }

    if (message.type === "START_AREA_SELECTION") {
      initAreaSelectionOverlay(message.actionType);
      sendResponse({ ok: true, documentId });
      return false;
    }
    return false;
  });

  let isSelectingArea = false;
  function initAreaSelectionOverlay(actionType) {
    if (isSelectingArea || document.getElementById("gf-selection-overlay")) return;
    isSelectingArea = true;

    const overlay = document.createElement("div");
    overlay.id = "gf-selection-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 2147483646;
      cursor: crosshair;
      background: rgba(0, 0, 0, 0.25);
      user-select: none;
    `;

    const banner = document.createElement("div");
    banner.style.cssText = `
      position: fixed;
      top: 16px; left: 50%; transform: translateX(-50%);
      background: #26394A; color: #FBFAF7;
      padding: 8px 16px; border-radius: 20px;
      font-size: 13px; font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: 2147483647; pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    banner.textContent = "ลากเมาส์ครอบพื้นที่ที่ต้องการแคป (กด ESC เพื่อยกเลิก)";
    overlay.appendChild(banner);

    const box = document.createElement("div");
    box.id = "gf-selection-box";
    box.style.cssText = `
      position: fixed;
      border: 2px dashed #3B82F6;
      background: rgba(59, 130, 246, 0.15);
      display: none;
      pointer-events: none;
      z-index: 2147483647;
    `;
    overlay.appendChild(box);

    let startX = 0;
    let startY = 0;
    let isMouseDown = false;

    function onMouseDown(event) {
      if (event.button !== 0) return;
      isMouseDown = true;
      startX = event.clientX;
      startY = event.clientY;
      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = "0px";
      box.style.height = "0px";
      box.style.display = "block";
    }

    function onMouseMove(event) {
      if (!isMouseDown) return;
      const left = Math.min(startX, event.clientX);
      const top = Math.min(startY, event.clientY);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${Math.abs(event.clientX - startX)}px`;
      box.style.height = `${Math.abs(event.clientY - startY)}px`;
    }

    function onMouseUp(event) {
      if (!isMouseDown) return;
      isMouseDown = false;
      const rect = {
        left: Math.min(startX, event.clientX),
        top: Math.min(startY, event.clientY),
        width: Math.abs(event.clientX - startX),
        height: Math.abs(event.clientY - startY),
        dpr: window.devicePixelRatio || 1
      };
      cleanup();
      if (rect.width < 10 || rect.height < 10) return;
      setTimeout(() => {
        try {
          chrome.runtime.sendMessage({ type: "CROP_AREA_CAPTURE", rect, actionType: actionType || "preview", documentId });
        } catch (_) {
          // Ignore invalidated extension contexts.
        }
      }, 60);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") cleanup();
    }

    function cleanup() {
      isSelectingArea = false;
      overlay.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    overlay.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    document.documentElement.appendChild(overlay);
  }

  function showFeedback(x, y) {
    if (isFullPageCapture || !document.documentElement) return;
    const dot = document.createElement("div");
    dot.id = "local-scribe-indicator";
    dot.style.cssText = `position:fixed;left:${x - 20}px;top:${y - 20}px;width:40px;height:40px;border-radius:50%;border:3px solid #E8877A;background:rgba(232,135,122,0.35);box-shadow:0 0 15px rgba(232,135,122,0.8);pointer-events:none;z-index:2147483647;transition:transform .4s ease-out,opacity .4s ease-out;transform:scale(0.5);opacity:1;`;
    document.documentElement.appendChild(dot);
    const raf = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
    if (raf) {
      raf(() => {
        dot.style.transform = "scale(1.6)";
        dot.style.opacity = "0";
      });
    }
    setTimeout(() => {
      if (dot && typeof dot.remove === "function") dot.remove();
    }, 450);
  }
})();
