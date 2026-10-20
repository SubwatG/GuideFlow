document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("paintCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const toastMsg = document.getElementById("toastMsg");

  const MAX_HISTORY_COMMANDS = 100;
  const MAX_CANVAS_PIXELS = 64_000_000;
  const MAX_CANVAS_DIMENSION = 32_767;

  let baseImage = new Image();
  let baseTitle = "Capture";
  let currentImageData = "";
  let sourceRecordingId = null;
  let currentColor = "#EF4444";
  let currentTool = "rect";
  let commands = [];
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let guideIdentity = { recordingId: null, revision: null, stepCount: 0 };
  let isAppending = false;
  let highlightOpacity = "translucent";

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
        recordingId: sourceRecordingId || guideIdentity.recordingId || response.recordingId || null,
        revision: Number.isInteger(response.revision) ? response.revision : null,
        stepCount: getStepCount(response.bundle)
      };
    });
  }

  function applyImageData(dataUrl, title, recordingId) {
    if (!isValidPngDataUrl(dataUrl)) {
      showToast("ไม่พบภาพ PNG ที่ถูกต้องสำหรับแก้ไข", true);
      return;
    }

    currentImageData = dataUrl;
    baseTitle = title || "Capture";
    if (recordingId) {
      sourceRecordingId = recordingId;
      guideIdentity.recordingId = recordingId;
    } else {
      sourceRecordingId = null;
      guideIdentity.recordingId = null;
    }

    baseImage = new Image();
    baseImage.onload = () => {
      const width = baseImage.naturalWidth || baseImage.width;
      const height = baseImage.naturalHeight || baseImage.height;
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
    baseImage.onerror = () => {
      currentImageData = "";
      showToast("โหลดภาพไม่สำเร็จ กรุณาลองแคปใหม่อีกครั้ง", true);
    };
    baseImage.src = dataUrl;
  }

  function tryLoadImage() {
    sendRuntimeMessage({ type: "GET_PENDING_EDIT_IMAGE" }, (response) => {
      if (response && response.dataUrl) {
        applyImageData(response.dataUrl, response.title, response.recordingId);
        return;
      }

      // Keep the legacy storage fallback for older extension background pages.
      if (!chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.get(["pendingEditImage"], (storageResponse) => {
        const pending = storageResponse && storageResponse.pendingEditImage;
        if (pending && pending.dataUrl) {
          applyImageData(pending.dataUrl, pending.title, pending.recordingId);
        }
      });
    });
  }

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.pendingEditImage || !changes.pendingEditImage.newValue) return;
      const editData = changes.pendingEditImage.newValue;
      if (editData.dataUrl) applyImageData(editData.dataUrl, editData.title, editData.recordingId);
    });
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
    } else if (command.type === "text") {
      ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
      ctx.fillStyle = command.color;
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 4;
      ctx.fillText(command.text, command.x, command.y);
    }
    ctx.restore();
  }

  function render(temporaryCommand = null) {
    if (!canvas.width || !canvas.height) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (baseImage && baseImage.src) ctx.drawImage(baseImage, 0, 0);
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

  const tools = {
    rect: document.getElementById("toolRect"),
    arrow: document.getElementById("toolArrow"),
    highlight: document.getElementById("toolHighlight"),
    redact: document.getElementById("toolRedact"),
    text: document.getElementById("toolText")
  };
  Object.entries(tools).forEach(([name, button]) => {
    if (!button) return;
    button.addEventListener("click", () => {
      Object.values(tools).forEach((item) => item && item.classList.remove("active"));
      button.classList.add("active");
      currentTool = name;
    });
  });

  // Highlight style / opacity selector
  const hlTranslucent = document.getElementById("hlTranslucent");
  const hlSolid = document.getElementById("hlSolid");

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
      if (currentTool !== "highlight") {
        tools.highlight.click();
      }
    });
  }

  if (hlSolid) {
    hlSolid.addEventListener("click", () => {
      updateHighlightMode("solid");
      if (currentTool !== "highlight") {
        tools.highlight.click();
      }
    });
  }

  // Color dots
  const colorDots = document.querySelectorAll(".color-dot");
  colorDots.forEach((dot) => {
    dot.addEventListener("click", () => {
      colorDots.forEach((item) => item.classList.remove("active"));
      dot.classList.add("active");
      currentColor = dot.getAttribute("data-color") || currentColor;
    });
  });

  document.getElementById("btnUndo").addEventListener("click", restoreLastState);
  document.getElementById("btnClear").addEventListener("click", () => {
    commitCommand({ type: "clear" });
  });

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      restoreLastState();
    }
  });

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
    if (event.button !== 0) return;
    const coords = getCanvasCoords(event);
    startX = coords.x;
    startY = coords.y;
    if (currentTool === "text") {
      const text = prompt("กรอกข้อความที่ต้องการวางลงบนภาพ:");
      if (text) commitCommand({ type: "text", text, x: startX, y: startY, color: currentColor });
      return;
    }
    if (["rect", "arrow", "highlight", "redact"].includes(currentTool)) isDrawing = true;
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

  function appendStep() {
    if (!currentImageData || !canvas.width || !canvas.height || isAppending) return;
    isAppending = true;
    const appendButton = document.getElementById("btnAppendResult");
    appendButton.disabled = true;
    const timestamp = Date.now();
    const dataUrl = canvas.toDataURL("image/png");
    const step = {
      id: globalThis.crypto?.randomUUID?.() || `step_${timestamp}_${Math.random().toString(36).slice(2)}`,
      timestamp,
      action: "ตกแต่งภาพ",
      elementTag: "annotated",
      elementText: "Annotated Image",
      description: `ภาพที่ตกแต่งเพิ่มเติม (${baseTitle})`,
      coords: null,
      viewport: null,
      screenshot: dataUrl,
      screenshots: [dataUrl],
      captureMode: "annotated"
    };
    sendRuntimeMessage({
      type: "APPEND_STEP",
      step,
      recordingId: guideIdentity.recordingId,
      revision: guideIdentity.revision
    }, (response) => {
      isAppending = false;
      appendButton.disabled = false;
      if (!response || !response.ok) {
        showToast(`เพิ่มเข้าคู่มือไม่สำเร็จ: ${(response && response.error) || "ไม่ทราบสาเหตุ"}`, true);
        return;
      }
      guideIdentity.recordingId = response.recordingId || guideIdentity.recordingId;
      guideIdentity.revision = Number.isInteger(response.revision) ? response.revision : guideIdentity.revision;
      guideIdentity.stepCount += 1;
      showToast(`เพิ่มเป็นขั้นตอนที่ ${response.stepCount || guideIdentity.stepCount} ในคู่มือแล้ว!`);
    });
  }

  document.getElementById("btnCopyResult").addEventListener("click", () => {
    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showToast("คัดลอกภาพลงคลิปบอร์ดเรียบร้อยแล้ว!");
      } catch (error) {
        showToast("เบราว์เซอร์ไม่อนุญาตให้เขียน Clipboard อัตโนมัติ", true);
      }
    }, "image/png");
  });

  document.getElementById("btnDownloadResult").addEventListener("click", () => {
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `guideflow_annotated_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("ดาวน์โหลดภาพเรียบร้อยแล้ว!");
  });

  document.getElementById("btnAppendResult").addEventListener("click", appendStep);

  tryLoadImage();
});
