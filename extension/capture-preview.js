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

  // Tool elements
  const toolNone = document.getElementById("toolNone");
  const toolRect = document.getElementById("toolRect");
  const toolArrow = document.getElementById("toolArrow");
  const toolHighlight = document.getElementById("toolHighlight");
  const hlTranslucent = document.getElementById("hlTranslucent");
  const hlSolid = document.getElementById("hlSolid");
  const btnUndo = document.getElementById("btnUndo");
  const btnClear = document.getElementById("btnClear");
  const colorDots = document.querySelectorAll(".color-dot");

  let currentImageData = "";
  let currentImageTitle = "ภาพแคปหน้าจอ";
  let currentColor = "#EF4444";
  let currentTool = "none"; // 'none', 'rect', 'arrow', 'highlight', 'blur'
  let highlightOpacity = "translucent"; // 'translucent' (0.35) or 'solid' (1.0)
  let undoStack = [];
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let snapshot = null;

  function showToast(text) {
    toastMsg.textContent = text;
    toastMsg.style.display = "block";
    setTimeout(() => {
      toastMsg.style.display = "none";
    }, 2800);
  }

  // Theme Toggle
  let isDark = localStorage.getItem("gf_preview_dark") === "true";
  function applyTheme() {
    if (isDark) {
      document.body.classList.add("dark-theme");
      themeIcon.textContent = "☀️";
    } else {
      document.body.classList.remove("dark-theme");
      themeIcon.textContent = "🌙";
    }
  }
  applyTheme();

  btnThemeToggle.addEventListener("click", () => {
    isDark = !isDark;
    localStorage.setItem("gf_preview_dark", isDark ? "true" : "false");
    applyTheme();
  });

  function saveState() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > 25) undoStack.shift();
  }

  function restoreLastState() {
    if (undoStack.length > 1) {
      undoStack.pop();
      const last = undoStack[undoStack.length - 1];
      ctx.putImageData(last, 0, 0);
    }
  }

  btnUndo.addEventListener("click", restoreLastState);
  btnClear.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveState();
  });

  // Tool Switching
  const tools = {
    none: toolNone,
    rect: toolRect,
    arrow: toolArrow,
    highlight: toolHighlight
  };

  Object.entries(tools).forEach(([name, btn]) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      Object.values(tools).forEach((b) => b && b.classList.remove("active"));
      btn.classList.add("active");
      currentTool = name;
      if (currentTool === "none") {
        canvas.classList.remove("drawing-mode");
      } else {
        canvas.classList.add("drawing-mode");
      }
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
      colorDots.forEach((d) => d.classList.remove("active"));
      dot.classList.add("active");
      currentColor = dot.getAttribute("data-color");
    });
  });

  // Load Image
  function applyImage(dataUrl, title) {
    if (!dataUrl) return;
    currentImageData = dataUrl;
    currentImageTitle = title || "ภาพแคปหน้าจอ";
    pageTitle.textContent = currentImageTitle;
    imageDesc.textContent = `ภาพตัวอย่างความละเอียดสูง — ${currentImageTitle}`;
    previewImg.src = dataUrl;
    previewImg.onload = () => {
      // Sync canvas coordinate resolution to image natural size
      canvas.width = previewImg.naturalWidth;
      canvas.height = previewImg.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      undoStack = [];
      saveState();
    };
  }

  function loadImage() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["singleCapturePreview"], (res) => {
        if (res.singleCapturePreview && res.singleCapturePreview.dataUrl) {
          applyImage(res.singleCapturePreview.dataUrl, res.singleCapturePreview.title);
        } else {
          let attempts = 0;
          const timer = setInterval(() => {
            attempts++;
            chrome.storage.local.get(["singleCapturePreview"], (retryRes) => {
              if (retryRes.singleCapturePreview && retryRes.singleCapturePreview.dataUrl) {
                clearInterval(timer);
                applyImage(retryRes.singleCapturePreview.dataUrl, retryRes.singleCapturePreview.title);
              } else if (attempts > 10) {
                clearInterval(timer);
                imageDesc.textContent = "ไม่พบข้อมูลรูปภาพ กรุณาลองแคปใหม่อีกครั้ง";
              }
            });
          }, 200);
        }
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.singleCapturePreview && changes.singleCapturePreview.newValue) {
          const cap = changes.singleCapturePreview.newValue;
          applyImage(cap.dataUrl, cap.title);
        }
      });
    }
  }

  loadImage();

  // Canvas Mouse Coordinates (scaled from display CSS size to natural canvas pixel size)
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  canvas.addEventListener("mousedown", (e) => {
    if (currentTool === "none") return;
    isDrawing = true;
    const coords = getCanvasCoords(e);
    startX = coords.x;
    startY = coords.y;
    snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDrawing || currentTool === "none") return;
    const coords = getCanvasCoords(e);
    const currX = coords.x;
    const currY = coords.y;

    ctx.putImageData(snapshot, 0, 0);
    ctx.save();

    const lineWidth = Math.max(3, Math.round(canvas.width / 400));

    if (currentTool === "rect") {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(startX, startY, currX - startX, currY - startY);
    } else if (currentTool === "arrow") {
      drawArrow(ctx, startX, startY, currX, currY, currentColor, lineWidth);
    } else if (currentTool === "highlight") {
      ctx.fillStyle = highlightOpacity === "solid" ? currentColor : (currentColor + "55");
      ctx.fillRect(startX, startY, currX - startX, currY - startY);
    }

    ctx.restore();
  });

  window.addEventListener("mouseup", (e) => {
    if (!isDrawing || currentTool === "none") return;
    isDrawing = false;
    const coords = getCanvasCoords(e);
    const currX = coords.x;
    const currY = coords.y;

    ctx.putImageData(snapshot, 0, 0);
    ctx.save();

    const lineWidth = Math.max(3, Math.round(canvas.width / 400));

    if (currentTool === "rect") {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(startX, startY, currX - startX, currY - startY);
    } else if (currentTool === "arrow") {
      drawArrow(ctx, startX, startY, currX, currY, currentColor, lineWidth);
    } else if (currentTool === "highlight") {
      ctx.fillStyle = highlightOpacity === "solid" ? currentColor : (currentColor + "55");
      ctx.fillRect(startX, startY, currX - startX, currY - startY);
    }

    ctx.restore();
    saveState();
  });

  function drawArrow(ctx, fromX, fromY, toX, toY, color, lineWidth) {
    const headlen = 16;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function applyPixelBlur(ctx, imgElement, x, y, width, height) {
    if (width < 2 || height < 2) return;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    // Draw base screenshot and current canvas annotations so blur covers whatever is underneath
    tCtx.drawImage(imgElement, 0, 0);
    tCtx.drawImage(canvas, 0, 0);

    const imgData = tCtx.getImageData(x, y, width, height);
    const data = imgData.data;

    // Distinct, heavy mosaic block size for privacy censorship (18px - 36px)
    const blockSize = Math.max(18, Math.min(36, Math.round(Math.min(width, height) / 5)));

    for (let py = 0; py < height; py += blockSize) {
      for (let px = 0; px < width; px += blockSize) {
        let r = 0, g = 0, b = 0, count = 0;
        const curBlockW = Math.min(blockSize, width - px);
        const curBlockH = Math.min(blockSize, height - py);

        for (let dy = 0; dy < curBlockH; dy++) {
          for (let dx = 0; dx < curBlockW; dx++) {
            const idx = ((py + dy) * width + (px + dx)) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }
        if (count > 0) {
          r = Math.floor(r / count);
          g = Math.floor(g / count);
          b = Math.floor(b / count);
          for (let dy = 0; dy < curBlockH; dy++) {
            for (let dx = 0; dx < curBlockW; dx++) {
              const idx = ((py + dy) * width + (px + dx)) * 4;
              // Add slight pixel grid border contrast so the mosaic blocks stand out clearly
              const isGridEdge = (dx === 0 || dy === 0) && curBlockW > 6 && curBlockH > 6;
              data[idx] = isGridEdge ? Math.max(0, r - 25) : r;
              data[idx + 1] = isGridEdge ? Math.max(0, g - 25) : g;
              data[idx + 2] = isGridEdge ? Math.max(0, b - 25) : b;
              data[idx + 3] = 255;
            }
          }
        }
      }
    }
    ctx.putImageData(imgData, x, y);
  }

  // Flatten Base Image + Drawn Overlay
  function getFlattenedDataUrl() {
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = canvas.width;
    finalCanvas.height = canvas.height;
    const fCtx = finalCanvas.getContext("2d");
    fCtx.drawImage(previewImg, 0, 0);
    fCtx.drawImage(canvas, 0, 0);
    return finalCanvas.toDataURL("image/png");
  }

  // Copy Action
  btnCopy.addEventListener("click", async () => {
    if (!currentImageData) return;
    const finalDataUrl = getFlattenedDataUrl();
    try {
      const res = await fetch(finalDataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || "image/png"]: blob })
      ]);
      showToast("คัดลอกภาพลงคลิปบอร์ดแล้ว!");
    } catch (err) {
      const a = document.createElement("a");
      a.href = finalDataUrl;
      a.download = `guideflow_capture_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("บันทึกไฟล์ภาพให้แทนเนื่องจากสิทธิ์คลิปบอร์ด");
    }
  });

  // Download Action
  btnDownload.addEventListener("click", () => {
    if (!currentImageData) return;
    const finalDataUrl = getFlattenedDataUrl();
    const a = document.createElement("a");
    a.href = finalDataUrl;
    const safeTitle = currentImageTitle.replace(/[/\\?%*:|"<>]/g, "-");
    a.download = `guideflow_${safeTitle}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("ดาวน์โหลดภาพเรียบร้อยแล้ว!");
  });

  // Append Action
  btnAppend.addEventListener("click", () => {
    if (!currentImageData) return;
    const finalDataUrl = getFlattenedDataUrl();
    chrome.storage.local.get(["currentSession", "sessionMeta"], (res) => {
      const currentSession = res.currentSession || [];
      const sessionMeta = res.sessionMeta || {
        title: "คู่มือการใช้งานระบบ",
        startTime: Date.now()
      };
      const now = Date.now();
      const step = {
        id: "step_" + now + "_" + currentSession.length,
        timestamp: now,
        action: "แคปหน้าจอ",
        elementTag: "screen",
        elementText: "Manual Screen Capture",
        description: `แคปหน้าจอ ${currentImageTitle}`,
        coords: null,
        viewport: null,
        screenshot: finalDataUrl,
        screenshots: [finalDataUrl],
        captureMode: "manual"
      };
      currentSession.push(step);
      chrome.storage.local.set({ currentSession, sessionMeta }, () => {
        showToast(`เพิ่มเป็นขั้นตอนที่ ${currentSession.length} ในคู่มือแล้ว!`);
      });
    });
  });

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      btnCopy.click();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      btnDownload.click();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      restoreLastState();
    }
  });
});
