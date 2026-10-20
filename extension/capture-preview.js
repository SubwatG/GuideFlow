document.addEventListener("DOMContentLoaded", () => {
  const pageTitle = document.getElementById("pageTitle");
  const imageDesc = document.getElementById("imageDesc");
  const previewImg = document.getElementById("previewImg");
  const canvas = document.getElementById("paintCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const toastMsg = document.getElementById("toastMsg");

  const btnCopy = document.getElementById("btnCopy");
  const btnDownload = document.getElementById("btnDownload");
  const btnAppend = document.getElementById("btnAppend");
  const btnThemeToggle = document.getElementById("btnThemeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const toolNone = document.getElementById("toolNone");
  const toolRect = document.getElementById("toolRect");
  const toolArrow = document.getElementById("toolArrow");
  const toolHighlight = document.getElementById("toolHighlight");
  const hlTranslucent = document.getElementById("hlTranslucent");
  const hlSolid = document.getElementById("hlSolid");
  const btnUndo = document.getElementById("btnUndo");
  const btnClear = document.getElementById("btnClear");
  const colorDots = document.querySelectorAll(".color-dot");

  const MAX_HISTORY_COMMANDS = 100;
  const MAX_CANVAS_PIXELS = 64_000_000;
  const MAX_CANVAS_DIMENSION = 32_767;
  const query = new URLSearchParams(typeof location === "undefined" ? "" : (location.search || ""));
  const captureId = query.get("captureId");

  let currentImageData = "";
  let currentImageTitle = "ภาพแคปหน้าจอ";
  let currentCaptureMode = "manual";
  let currentRecordingId = null;
  let sourceRecordingId = null;
  let guideIdentity = { recordingId: null, revision: null, stepCount: 0 };
  let currentColor = "#EF4444";
  let currentTool = "none";
  let commands = [];
  let highlightOpacity = "translucent";
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let isAppending = false;

  function showToast(text, isError = false) {
    toastMsg.textContent = text;
    toastMsg.style.display = "block";
    toastMsg.style.background = isError ? "#DC2626" : "#22C55E";
    setTimeout(() => {
      toastMsg.style.display = "none";
    }, 2800);
  }

  function sendRuntimeMessage(message, callback) {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
      callback({ ok: false, error: "ไม่สามารถเชื่อมต่อกับ GuideFlow ได้" });
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          callback({ ok: false, error: runtimeError.message });
          return;
        }
        callback(response || { ok: false, error: "ไม่ได้รับคำตอบจาก GuideFlow" });
      });
    } catch (error) {
      callback({ ok: false, error: error.message || "ส่งคำขอไม่สำเร็จ" });
    }
  }

  function isValidPngDataUrl(dataUrl) {
    if (typeof dataUrl !== "string") return false;
    try {
      if (typeof GuideFlowData !== "undefined" && GuideFlowData.safeImageUrl) GuideFlowData.safeImageUrl(dataUrl);
    } catch (error) {
      return false;
    }
    return /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/i.test(dataUrl);
  }

  function isCanvasSizeAllowed(width, height) {
    return Number.isInteger(width) && Number.isInteger(height) &&
      width > 0 && height > 0 &&
      width <= MAX_CANVAS_DIMENSION && height <= MAX_CANVAS_DIMENSION &&
      width * height <= MAX_CANVAS_PIXELS;
  }

  function getStepCount(bundle) {
    if (Array.isArray(bundle)) return bundle.length;
    if (bundle && Array.isArray(bundle.steps)) return bundle.steps.length;
    if (bundle && Array.isArray(bundle.session)) return bundle.session.length;
    return 0;
  }

  function loadGuideIdentity() {
    sendRuntimeMessage({ type: "GET_GUIDE" }, (response) => {
      if (!response || !response.ok) return;
      guideIdentity = {
        recordingId: sourceRecordingId || guideIdentity.recordingId || response.recordingId || currentRecordingId || null,
        revision: Number.isInteger(response.revision) ? response.revision : null,
        stepCount: getStepCount(response.bundle)
      };
    });
  }

  function applyImage(dataUrl, title, metadata = {}) {
    if (!isValidPngDataUrl(dataUrl)) {
      showToast("ไม่พบภาพ PNG ที่ถูกต้อง กรุณาลองแคปใหม่อีกครั้ง", true);
      return;
    }
    currentImageData = dataUrl;
    currentImageTitle = title || "ภาพแคปหน้าจอ";
    currentCaptureMode = metadata.captureMode || "manual";
    currentRecordingId = metadata.recordingId || null;
    if (currentRecordingId) {
      sourceRecordingId = currentRecordingId;
      guideIdentity.recordingId = currentRecordingId;
    } else {
      sourceRecordingId = null;
      guideIdentity.recordingId = null;
    }
    pageTitle.textContent = currentImageTitle;
    imageDesc.textContent = `ภาพตัวอย่างความละเอียดสูง — ${currentImageTitle}`;
    previewImg.onload = () => {
      const width = previewImg.naturalWidth || previewImg.width;
      const height = previewImg.naturalHeight || previewImg.height;
      if (!isCanvasSizeAllowed(width, height)) {
        currentImageData = "";
        showToast(`ภาพมีขนาดใหญ่เกินไป (สูงสุด ${MAX_CANVAS_PIXELS.toLocaleString()} พิกเซล)`, true);
        return;
      }
      canvas.width = width;
      canvas.height = height;
      commands = [];
      render();
      loadGuideIdentity();
    };
    previewImg.onerror = () => {
      currentImageData = "";
      showToast("โหลดภาพไม่สำเร็จ กรุณาลองแคปใหม่อีกครั้ง", true);
    };
    previewImg.src = dataUrl;
  }

  function loadImage() {
    if (captureId) {
      sendRuntimeMessage({ type: "GET_CAPTURE_IMAGE", captureId }, (response) => {
        const capture = response && response.capture;
        if (response && response.ok && capture && capture.dataUrl) {
          applyImage(capture.dataUrl, capture.title, {
            recordingId: response.recordingId || capture.recordingId,
            captureMode: capture.captureMode
          });
          return;
        }
        showToast(`ไม่สามารถโหลดภาพแคปนี้ได้: ${(response && response.error) || "ไม่พบรายการแคป"}`, true);
      });
      return;
    }

    // Legacy fallback for preview tabs opened without a captureId.
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get(["singleCapturePreview"], (response) => {
      if (response.singleCapturePreview && response.singleCapturePreview.dataUrl) {
        applyImage(response.singleCapturePreview.dataUrl, response.singleCapturePreview.title, response.singleCapturePreview);
        return;
      }
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        chrome.storage.local.get(["singleCapturePreview"], (retryResponse) => {
          const capture = retryResponse.singleCapturePreview;
          if (capture && capture.dataUrl) {
            clearInterval(timer);
            applyImage(capture.dataUrl, capture.title, capture);
          } else if (attempts > 10) {
            clearInterval(timer);
            imageDesc.textContent = "ไม่พบข้อมูลรูปภาพ กรุณาลองแคปใหม่อีกครั้ง";
          }
        });
      }, 200);
    });

    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.singleCapturePreview || !changes.singleCapturePreview.newValue) return;
        const capture = changes.singleCapturePreview.newValue;
        if (capture.dataUrl) applyImage(capture.dataUrl, capture.title, capture);
      });
    }
  }

  function activeCommands() {
    const active = [];
    for (const command of commands) {
      if (command.type === "clear") active.length = 0;
      else active.push(command);
    }
    return active;
  }

  function drawArrow(context, fromX, fromY, toX, toY, color, lineWidth) {
    const headlen = 16;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();
    context.beginPath();
    context.moveTo(toX, toY);
    context.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    context.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    context.closePath();
    context.fill();
  }

  function drawCommand(command) {
    const lineWidth = Math.max(3, Math.round(canvas.width / 400));
    ctx.save();
    if (command.type === "rect") {
      ctx.strokeStyle = command.color;
      ctx.lineWidth = command.lineWidth || lineWidth;
      ctx.strokeRect(command.x, command.y, command.width, command.height);
    } else if (command.type === "redact") {
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 1;
      ctx.fillRect(command.x, command.y, command.width, command.height);
    } else if (command.type === "arrow") {
      drawArrow(ctx, command.fromX, command.fromY, command.toX, command.toY, command.color, command.lineWidth || lineWidth);
    } else if (command.type === "highlight") {
      ctx.fillStyle = command.fillStyle;
      ctx.fillRect(command.x, command.y, command.width, command.height);
    }
    ctx.restore();
  }

  function render(temporaryCommand = null) {
    if (!canvas.width || !canvas.height) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const command of activeCommands()) drawCommand(command);
    if (temporaryCommand) drawCommand(temporaryCommand);
  }

  function commitCommand(command) {
    if (commands.length >= MAX_HISTORY_COMMANDS) {
      showToast(`แก้ไขได้สูงสุด ${MAX_HISTORY_COMMANDS} รายการต่อภาพ`, true);
      return false;
    }
    commands.push(command);
    render();
    return true;
  }

  function restoreLastState() {
    if (!commands.length) return;
    commands.pop();
    render();
  }

  let isDark = localStorage.getItem("gf_preview_dark") === "true";
  function applyTheme() {
    if (isDark) document.body.classList.add("dark-theme");
    else document.body.classList.remove("dark-theme");
    themeIcon.textContent = isDark ? "☀️" : "🌙";
  }
  applyTheme();
  btnThemeToggle.addEventListener("click", () => {
    isDark = !isDark;
    localStorage.setItem("gf_preview_dark", isDark ? "true" : "false");
    applyTheme();
  });

  const tools = { none: toolNone, rect: toolRect, arrow: toolArrow, highlight: toolHighlight, redact: document.getElementById("toolRedact") };
  Object.entries(tools).forEach(([name, button]) => {
    if (!button) return;
    button.addEventListener("click", () => {
      Object.values(tools).forEach((item) => item && item.classList.remove("active"));
      button.classList.add("active");
      currentTool = name;
      if (currentTool === "none") canvas.classList.remove("drawing-mode");
      else canvas.classList.add("drawing-mode");
    });
  });

  // Highlight opacity selection
  function updateHighlightMode(mode) {
    highlightOpacity = mode;
    if (hlTranslucent && hlSolid) {
      hlTranslucent.classList.toggle("active", mode === "translucent");
      hlSolid.classList.toggle("active", mode === "solid");
    }
  }

  if (hlTranslucent) {
    hlTranslucent.addEventListener("click", () => {
      updateHighlightMode("translucent");
      // Auto activate highlight tool if currently on view/none
      if (currentTool !== "highlight") {
        toolHighlight.click();
      }
    });
  }

  if (hlSolid) {
    hlSolid.addEventListener("click", () => {
      updateHighlightMode("solid");
      // Auto activate highlight tool if currently on view/none
      if (currentTool !== "highlight") {
        toolHighlight.click();
      }
    });
  }

  // Color selection
  colorDots.forEach((dot) => {
    dot.addEventListener("click", () => {
      colorDots.forEach((item) => item.classList.remove("active"));
      dot.classList.add("active");
      currentColor = dot.getAttribute("data-color") || currentColor;
    });
  });
  btnUndo.addEventListener("click", restoreLastState);
  btnClear.addEventListener("click", () => commitCommand({ type: "clear" }));

  function getCanvasCoords(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  function createShapeCommand(endX, endY) {
    const lineWidth = Math.max(3, Math.round(canvas.width / 400));
    if (currentTool === "rect") {
      return { type: "rect", x: startX, y: startY, width: endX - startX, height: endY - startY, color: currentColor, lineWidth };
    }
    if (currentTool === "arrow") {
      return { type: "arrow", fromX: startX, fromY: startY, toX: endX, toY: endY, color: currentColor, lineWidth };
    }
    if (currentTool === "highlight") {
      return { type: "highlight", x: startX, y: startY, width: endX - startX, height: endY - startY, color: currentColor, fillStyle: highlightOpacity === "solid" ? currentColor : (currentColor + "55") };
    }
    if (currentTool === "redact") {
      return { type: "redact", x: startX, y: startY, width: endX - startX, height: endY - startY };
    }
    return null;
  }

  canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || currentTool === "none") return;
    const coords = getCanvasCoords(event);
    startX = coords.x;
    startY = coords.y;
    isDrawing = true;
  });
  window.addEventListener("mousemove", (event) => {
    if (!isDrawing) return;
    const coords = getCanvasCoords(event);
    render(createShapeCommand(coords.x, coords.y));
  });
  window.addEventListener("mouseup", (event) => {
    if (!isDrawing) return;
    isDrawing = false;
    const coords = getCanvasCoords(event);
    const command = createShapeCommand(coords.x, coords.y);
    if (command) commitCommand(command);
  });

  function getFlattenedDataUrl() {
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = canvas.width;
    finalCanvas.height = canvas.height;
    const finalContext = finalCanvas.getContext("2d");
    finalContext.drawImage(previewImg, 0, 0);
    finalContext.drawImage(canvas, 0, 0);
    return finalCanvas.toDataURL("image/png");
  }

  btnCopy.addEventListener("click", async () => {
    if (!currentImageData) return;
    const finalDataUrl = getFlattenedDataUrl();
    try {
      const response = await fetch(finalDataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      showToast("คัดลอกภาพลงคลิปบอร์ดแล้ว!");
    } catch (error) {
      const link = document.createElement("a");
      link.href = finalDataUrl;
      link.download = `guideflow_capture_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("บันทึกไฟล์ภาพให้แทนเนื่องจากสิทธิ์คลิปบอร์ด", true);
    }
  });

  btnDownload.addEventListener("click", () => {
    if (!currentImageData) return;
    const link = document.createElement("a");
    link.href = getFlattenedDataUrl();
    const safeTitle = currentImageTitle.replace(/[/\\?%*:|"<>]/g, "-");
    link.download = `guideflow_${safeTitle}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("ดาวน์โหลดภาพเรียบร้อยแล้ว!");
  });

  function appendStep() {
    if (!currentImageData || !canvas.width || !canvas.height || isAppending) return;
    isAppending = true;
    btnAppend.disabled = true;
    const timestamp = Date.now();
    const dataUrl = getFlattenedDataUrl();
    const step = {
      id: globalThis.crypto?.randomUUID?.() || `step_${timestamp}_${Math.random().toString(36).slice(2)}`,
      timestamp,
      action: "แคปหน้าจอ",
      elementTag: "screen",
      elementText: "Manual Screen Capture",
      description: `แคปหน้าจอ ${currentImageTitle}`,
      coords: null,
      viewport: null,
      screenshot: dataUrl,
      screenshots: [dataUrl],
      captureMode: currentCaptureMode
    };
    sendRuntimeMessage({
      type: "APPEND_STEP",
      step,
      recordingId: guideIdentity.recordingId || currentRecordingId,
      revision: guideIdentity.revision
    }, (response) => {
      isAppending = false;
      btnAppend.disabled = false;
      if (!response || !response.ok) {
        showToast(`เพิ่มเข้าคู่มือไม่สำเร็จ: ${(response && response.error) || "ไม่ทราบสาเหตุ"}`, true);
        return;
      }
      guideIdentity.recordingId = response.recordingId || guideIdentity.recordingId || currentRecordingId;
      guideIdentity.revision = Number.isInteger(response.revision) ? response.revision : guideIdentity.revision;
      guideIdentity.stepCount += 1;
      showToast(`เพิ่มเป็นขั้นตอนที่ ${response.stepCount || guideIdentity.stepCount} ในคู่มือแล้ว!`);
    });
  }

  btnAppend.addEventListener("click", appendStep);

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && (event.key === "c" || event.key === "C")) {
      btnCopy.click();
    } else if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "S")) {
      event.preventDefault();
      btnDownload.click();
    } else if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
      restoreLastState();
    }
  });

  loadImage();
});
