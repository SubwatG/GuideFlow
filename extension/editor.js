document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("paintCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const toastMsg = document.getElementById("toastMsg");

  let baseImage = new Image();
  let baseTitle = "Capture";
  let currentColor = "#EF4444";
  let currentTool = "rect"; // rect, arrow, highlight, blur, text
  let undoStack = [];

  // Load Pending Image with polling / message fallback
  function applyImageData(dataUrl, title) {
    if (!dataUrl) return;
    baseTitle = title || "Capture";
    baseImage.onload = () => {
      canvas.width = baseImage.naturalWidth || baseImage.width;
      canvas.height = baseImage.naturalHeight || baseImage.height;
      ctx.drawImage(baseImage, 0, 0);
      saveState();
    };
    baseImage.src = dataUrl;
  }

  function tryLoadImage() {
    chrome.runtime.sendMessage({ type: "GET_PENDING_EDIT_IMAGE" }, (res) => {
      if (res && res.dataUrl) {
        applyImageData(res.dataUrl, res.title);
      } else {
        chrome.storage.local.get(["pendingEditImage"], (storageRes) => {
          if (storageRes.pendingEditImage && storageRes.pendingEditImage.dataUrl) {
            applyImageData(storageRes.pendingEditImage.dataUrl, storageRes.pendingEditImage.title);
          } else {
            // Periodic retry for slow storage writes
            let retries = 0;
            const timer = setInterval(() => {
              retries++;
              chrome.runtime.sendMessage({ type: "GET_PENDING_EDIT_IMAGE" }, (pollRes) => {
                if (pollRes && pollRes.dataUrl) {
                  clearInterval(timer);
                  applyImageData(pollRes.dataUrl, pollRes.title);
                } else if (retries > 10) {
                  clearInterval(timer);
                }
              });
            }, 250);
          }
        });
      }
    });
  }

  // Also listen to storage changes in case editor opens before write finishes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.pendingEditImage && changes.pendingEditImage.newValue) {
      const editData = changes.pendingEditImage.newValue;
      if (editData.dataUrl) {
        applyImageData(editData.dataUrl, editData.title);
      }
    }
  });

  tryLoadImage();

  function showToast(text) {
    toastMsg.textContent = text;
    toastMsg.style.display = "block";
    setTimeout(() => {
      toastMsg.style.display = "none";
    }, 2800);
  }

  function saveState() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > 25) undoStack.shift();
  }

  function restoreLastState() {
    if (undoStack.length > 1) {
      undoStack.pop(); // Pop current
      const last = undoStack[undoStack.length - 1];
      ctx.putImageData(last, 0, 0);
    }
  }

  // Tool Switching
  const tools = {
    rect: document.getElementById("toolRect"),
    arrow: document.getElementById("toolArrow"),
    highlight: document.getElementById("toolHighlight"),
    text: document.getElementById("toolText")
  };

  Object.entries(tools).forEach(([name, btn]) => {
    btn.addEventListener("click", () => {
      Object.values(tools).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTool = name;
    });
  });

  // Color dots
  const colorDots = document.querySelectorAll(".color-dot");
  colorDots.forEach((dot) => {
    dot.addEventListener("click", () => {
      colorDots.forEach((d) => d.classList.remove("active"));
      dot.classList.add("active");
      currentColor = dot.getAttribute("data-color");
    });
  });

  document.getElementById("btnUndo").addEventListener("click", restoreLastState);
  document.getElementById("btnClear").addEventListener("click", () => {
    ctx.drawImage(baseImage, 0, 0);
    saveState();
  });

  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      restoreLastState();
    }
  });

  // Canvas Drawing
  let isDrawing = false;
  let startX = 0, startY = 0;
  let snapshot = null;

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
    if (e.button !== 0) return;
    const coords = getCanvasCoords(e);
    startX = coords.x;
    startY = coords.y;

    if (currentTool === "text") {
      const text = prompt("กรอกข้อความที่ต้องการวางลงบนภาพ:");
      if (text) {
        ctx.save();
        ctx.font = "bold 24px 'Noto Sans Thai Looped', sans-serif";
        ctx.fillStyle = currentColor;
        ctx.shadowColor = "rgba(0,0,0,0.7)";
        ctx.shadowBlur = 4;
        ctx.fillText(text, startX, startY);
        ctx.restore();
        saveState();
      }
      return;
    }

    isDrawing = true;
    snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);
    const currX = coords.x;
    const currY = coords.y;

    // Restore snapshot before previewing shape
    ctx.putImageData(snapshot, 0, 0);
    ctx.save();

    if (currentTool === "rect") {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = Math.max(3, Math.round(canvas.width / 400));
      ctx.strokeRect(startX, startY, currX - startX, currY - startY);
    } else if (currentTool === "arrow") {
      drawArrow(ctx, startX, startY, currX, currY, currentColor);
    } else if (currentTool === "highlight") {
      ctx.fillStyle = currentColor + "44"; // Translucent
      ctx.fillRect(startX, startY, currX - startX, currY - startY);
    }

    ctx.restore();
  });

  canvas.addEventListener("mouseup", (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const coords = getCanvasCoords(e);
    const currX = coords.x;
    const currY = coords.y;

    ctx.putImageData(snapshot, 0, 0);
    ctx.save();

    if (currentTool === "rect") {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = Math.max(3, Math.round(canvas.width / 400));
      ctx.strokeRect(startX, startY, currX - startX, currY - startY);
    } else if (currentTool === "arrow") {
      drawArrow(ctx, startX, startY, currX, currY, currentColor);
    } else if (currentTool === "highlight") {
      ctx.fillStyle = currentColor + "44";
      ctx.fillRect(startX, startY, currX - startX, currY - startY);
    }

    ctx.restore();
    saveState();
  });

  function drawArrow(ctx, fromX, fromY, toX, toY, color) {
    const headlen = 16;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(3, Math.round(canvas.width / 400));
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function applyPixelBlur(ctx, x, y, width, height) {
    if (width < 2 || height < 2) return;
    const imgData = ctx.getImageData(x, y, width, height);
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

  // Action Buttons
  document.getElementById("btnCopyResult").addEventListener("click", () => {
    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob })
        ]);
        showToast("คัดลอกภาพลงคลิปบอร์ดเรียบร้อยแล้ว!");
      } catch (err) {
        showToast("เบราว์เซอร์ไม่อนุญาตให้เขียน Clipboard อัตโนมัติ");
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

  document.getElementById("btnAppendResult").addEventListener("click", () => {
    const dataUrl = canvas.toDataURL("image/png");
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
      currentSession.push(step);
      chrome.storage.local.set({ currentSession, sessionMeta }, () => {
        showToast(`เพิ่มเป็นขั้นตอนที่ ${currentSession.length} ในคู่มือแล้ว!`);
      });
    });
  });
});
