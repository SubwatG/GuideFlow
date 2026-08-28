// Content Script - GuideFlow

function resolveElementInfo(target) {
  const el = target.closest("button, a, input, textarea, select, [role='button'], [role='tab'], [role='menuitem'], [role='checkbox'], [role='radio'], [role='switch']") || target;
  const tagName = el.tagName.toLowerCase();
  const role = el.getAttribute("role") || "";

  let text = (
    el.getAttribute("aria-label") ||
    el.title ||
    el.getAttribute("alt") ||
    el.placeholder ||
    el.innerText ||
    el.value ||
    ""
  ).trim();

  if (!text && el !== target) {
    text = (target.getAttribute("aria-label") || target.title || target.innerText || "").trim();
  }
  text = text.replace(/\s+/g, " ");
  if (text.length > 55) text = text.substring(0, 52) + "...";

  let actionDesc = "";
  if (tagName === "button" || role === "button") {
    actionDesc = text ? `คลิกที่ปุ่ม "${text}"` : `คลิกที่ปุ่ม`;
  } else if (tagName === "a") {
    actionDesc = text ? `คลิกลิงก์ "${text}"` : `คลิกลิงก์`;
  } else if (tagName === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "checkbox" || type === "radio") {
      actionDesc = text ? `เลือก "${text}"` : `คลิกเลือกตัวเลือก`;
    } else if (type === "submit" || type === "button") {
      actionDesc = text ? `คลิกที่ปุ่ม "${text}"` : `คลิกที่ปุ่ม`;
    } else {
      actionDesc = text ? `คลิกที่ช่องกรอกข้อมูล "${text}"` : `คลิกที่ช่องกรอกข้อมูล`;
    }
  } else if (tagName === "textarea") {
    actionDesc = text ? `คลิกที่กล่องข้อความ "${text}"` : `คลิกที่กล่องข้อความ`;
  } else if (tagName === "select") {
    actionDesc = text ? `คลิกเลือกรายการ "${text}"` : `คลิกเลือกรายการ`;
  } else if (role === "tab") {
    actionDesc = text ? `คลิกที่แท็บ "${text}"` : `คลิกที่แท็บ`;
  } else {
    actionDesc = text ? `คลิกที่ "${text}"` : `คลิกบนหน้าจอ`;
  }

  return { element: el, tagName, text, actionDesc };
}

window.addEventListener("click", (e) => {
  if (e.target && e.target.closest("#local-scribe-indicator")) return;

  if (!isExtensionContextValid()) return;

  try {
    chrome.storage.local.get(["status"], (res) => {
      if (!isExtensionContextValid() || res.status !== "recording") return;

      const info = resolveElementInfo(e.target);
      const rect = info.element.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      showFeedback(e.clientX, e.clientY);

      try {
        chrome.runtime.sendMessage({
          type: "RECORD_CLICK",
          elementTag: info.tagName,
          elementText: info.text,
          description: info.actionDesc,
          coords: {
            xPercent: Number(((e.clientX / vw) * 100).toFixed(2)),
            yPercent: Number(((e.clientY / vh) * 100).toFixed(2)),
            box: {
              top: Number(((rect.top / vh) * 100).toFixed(2)),
              left: Number(((rect.left / vw) * 100).toFixed(2)),
              width: Number(((rect.width / vw) * 100).toFixed(2)),
              height: Number(((rect.height / vh) * 100).toFixed(2))
            }
          },
          viewport: { width: vw, height: vh }
        }
        );
      } catch (_) {
        // The extension may have been reloaded while this page stayed open.
      }
    });
  } catch (_) {
    // Ignore invalidated extension contexts from stale content scripts.
  }
}, true);

function isExtensionContextValid() {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GUIDEFLOW_PING") {
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "GET_PAGE_METRICS") {
    if (window.top !== window) return false;
    sendResponse({
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    });
    return false;
  }

  if (message.type === "SET_CAPTURE_SCROLL") {
    if (window.top !== window) return false;
    window.scrollTo({ left: 0, top: Number(message.scrollY) || 0, behavior: "auto" });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "RESTORE_CAPTURE_SCROLL") {
    if (window.top !== window) return false;
    window.scrollTo({
      left: Number(message.scrollX) || 0,
      top: Number(message.scrollY) || 0,
      behavior: "auto"
    });
    sendResponse({ ok: true });
    return false;
  }
});

function showFeedback(x, y) {
  const dot = document.createElement("div");
  dot.style.cssText = `position:fixed;left:${x - 20}px;top:${y - 20}px;width:40px;height:40px;border-radius:50%;border:3px solid #E8877A;background:rgba(232,135,122,0.35);box-shadow:0 0 15px rgba(232,135,122,0.8);pointer-events:none;z-index:2147483647;transition:transform .4s ease-out,opacity .4s ease-out;transform:scale(0.5);opacity:1;`;
  document.documentElement.appendChild(dot);
  requestAnimationFrame(() => {
    dot.style.transform = "scale(1.6)";
    dot.style.opacity = "0";
  });
  setTimeout(() => dot.remove(), 450);
}
