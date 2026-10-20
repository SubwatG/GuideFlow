let currentSession = [];
let sessionMeta = { title: "คู่มือการใช้งานระบบ" };
let currentStepIndex = 0;

// Mode detection: Viewer (Read-only for end users) vs Editor (Extension / Studio)
let isEditMode = false;

// Pan & Zoom State
let zoomScale = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let isZenMode = false;
let isAutoFocusActive = false;
let isSpotlightVisible = true;

// Data remains separate from executable viewer code; replacement callbacks preserve $ tokens.
function createStandaloneExport(htmlTemplate, runtimeJs, bundle) {
  const safeData = GuideFlowData.serializeForHtml(GuideFlowData.validateBundle(bundle));
  const dataTag = '<script id="guideflow-data" type="application/json">' + safeData + '<' + '/script>';
  const safeCode = runtimeJs.replace(/<\/script/gi, "<\\/script");
  const runtimeTag = '<script id="guideflow-runtime">' + safeCode + '<' + '/script>';
  const dataPattern = /<script\b[^>]*id=["']guideflow-data["'][^>]*>[\s\S]*?<\/script\s*>/i;
  const runtimePattern = /<script\b[^>]*id=["']guideflow-runtime["'][^>]*>[\s\S]*?<\/script\s*>/i;
  let html = htmlTemplate.replace(/<script\b[^>]*src=["']guide-data\.js["'][^>]*>\s*<\/script\s*>/i, "");
  html = html.replace(/<script\b[^>]*id=["']guideflow-demo-data["'][^>]*>[\s\S]*?<\/script\s*>/i, "");
  html = html.replace(dataPattern, "");
  if (runtimePattern.test(html)) return html.replace(runtimePattern, () => dataTag + runtimeTag);
  return html.replace(/<script\b[^>]*src=["']viewer\.js["'][^>]*>\s*<\/script\s*>/i, () => dataTag + runtimeTag);
}

async function hydrateDemoAssets(input) {
  const bundle = JSON.parse(JSON.stringify(input));
  const cache = new Map();
  async function image(value) {
    if (typeof value !== "string" || !value.startsWith("assets/")) return GuideFlowData.safeImageUrl(value);
    const match = /^assets\/demo-([a-f0-9]{64})\.(png|jpeg|webp|gif)$/.exec(value);
    if (!match) throw new Error("Invalid demo image asset");
    if (!cache.has(value)) cache.set(value, (async () => {
      const response = await fetch(value);
      if (!response.ok) throw new Error("Demo image asset could not be loaded");
      const buffer = await response.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)), byte => byte.toString(16).padStart(2, "0")).join("");
      if (hash !== match[1]) throw new Error("Demo image integrity check failed");
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      return GuideFlowData.safeImageUrl(`data:image/${match[2]};base64,` + btoa(binary));
    })());
    return cache.get(value);
  }
  for (const step of bundle.session) {
    step.screenshot = await image(step.screenshot);
    if (step.screenshots) step.screenshots = await Promise.all(step.screenshots.map(image));
  }
  return GuideFlowData.validateBundle(bundle);
}

function startApp() {
  let guideRevision = 0, guideRecordingId = null, pendingSaves = 0;
  let saveQueue = Promise.resolve();
  const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id && !!chrome.storage?.local;
  function guideMessage(message) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, response => {
      const error = chrome.runtime.lastError;
      if (error || !response?.ok) reject(new Error(error?.message || response?.error || "GuideFlow did not respond"));
      else resolve(response);
    }));
  }
  async function reloadGuide() {
    const response = await guideMessage({ type: "GET_GUIDE" });
    const bundle = GuideFlowData.validateBundle(response.bundle);
    guideRevision = response.revision; guideRecordingId = response.recordingId;
    currentSession = bundle.session; sessionMeta = bundle.meta; isEditMode = true;
    applyModeUI();
    if (currentSession.length) initViewer(); else showEmpty();
    setupEditListeners();
  }
  // Elements
  const displayTitle = document.getElementById("displayTitle");
  const mainHeader = document.getElementById("mainHeader");
  const zenToggleFloat = document.getElementById("zenToggleFloat");
  const btnZenMode = document.getElementById("btnZenMode");
  const btnPrint = document.getElementById("btnPrint");

  const btnViewSlides = document.getElementById("btnViewSlides");
  const btnViewDoc = document.getElementById("btnViewDoc");
  const slidesContainer = document.getElementById("slidesContainer");
  const docContainer = document.getElementById("docContainer");
  
  const slideStepBadge = document.getElementById("slideStepBadge");
  const slideStepTitle = document.getElementById("slideStepTitle");
  const slideImg = document.getElementById("slideImg");
  const stageWrapper = document.getElementById("stageWrapper");
  const panZoomContent = document.getElementById("panZoomContent");
  const spotlightRing = document.getElementById("spotlightRing");
  const targetBox = document.getElementById("targetBox");

  const timelineBar = document.getElementById("timelineBar");

  const btnZoomIn = document.getElementById("btnZoomIn");
  const btnZoomOut = document.getElementById("btnZoomOut");
  const btnZoomReset = document.getElementById("btnZoomReset");
  const btnFocusSpotlight = document.getElementById("btnFocusSpotlight");
  const btnToggleSpotlight = document.getElementById("btnToggleSpotlight");
  const toggleSpotlightIcon = document.getElementById("toggleSpotlightIcon");
  const toggleSpotlightLabel = document.getElementById("toggleSpotlightLabel");
  const btnFocusColor = document.getElementById("btnFocusColor");
  const focusColorPalette = document.getElementById("focusColorPalette");
  const btnAutoFocus = document.getElementById("btnAutoFocus");
  const autoFocusLabel = document.getElementById("autoFocusLabel");
  const zoomLevelText = document.getElementById("zoomLevelText");

  const slideNoteBox = document.getElementById("slideNoteBox");
  const slideNoteText = document.getElementById("slideNoteText");
  const btnToggleTip = document.getElementById("btnToggleTip");
  const btnDeleteStep = document.getElementById("btnDeleteStep");
  const headerStepTools = document.querySelector(".header-step-tools");

  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const btnExportHtml = document.getElementById("btnExportHtml");
  const btnExportJson = document.getElementById("btnExportJson");
  const btnExportImages = document.getElementById("btnExportImages");
  const btnThemeToggle = document.getElementById("btnThemeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const btnImport = document.getElementById("btnImport");
  const fileInput = document.getElementById("fileInput");

  // Export Images modal
  const exportImagesModal = document.getElementById("exportImagesModal");
  const selExportResolution = document.getElementById("selExportResolution");
  const chkIncludeHighlight = document.getElementById("chkIncludeHighlight");
  const chkIncludeReadme = document.getElementById("chkIncludeReadme");
  const btnCancelExportImages = document.getElementById("btnCancelExportImages");
  const btnConfirmExportImages = document.getElementById("btnConfirmExportImages");

  // Title modal
  const titleModal = document.getElementById("titleModal");
  const inputEditTitle = document.getElementById("inputEditTitle");
  const btnCancelEditTitle = document.getElementById("btnCancelEditTitle");
  const btnSaveEditTitle = document.getElementById("btnSaveEditTitle");

  let editListenersInitialized = false;

  const btnCopySingle = document.getElementById("btnCopySingle");
  const btnDownloadSingle = document.getElementById("btnDownloadSingle");
  const toastMessage = document.getElementById("toastMessage");

  function showToast(text) {
    if (!toastMessage) return;
    toastMessage.textContent = text;
    toastMessage.style.display = "block";
    toastMessage.style.opacity = "1";
    setTimeout(() => {
      toastMessage.style.opacity = "0";
      setTimeout(() => {
        toastMessage.style.display = "none";
      }, 200);
    }, 2500);
  }

  if (btnCopySingle) {
    btnCopySingle.addEventListener("click", async () => {
      const step = currentSession[currentStepIndex];
      const imgSrc = step ? step.screenshot : slideImg.src;
      if (!imgSrc) return;
      try {
        const res = await fetch(imgSrc);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type || "image/png"]: blob })
        ]);
        showToast("คัดลอกรูปภาพลงคลิปบอร์ดแล้ว!");
      } catch (err) {
        // fallback download if clipboard API restricted
        const a = document.createElement("a");
        a.href = imgSrc;
        a.download = `guideflow_capture_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast("บันทึกไฟล์ภาพให้แทนเนื่องจากสิทธิ์คลิปบอร์ด");
      }
    });
  }

  if (btnDownloadSingle) {
    btnDownloadSingle.addEventListener("click", async () => {
      const step = currentSession[currentStepIndex];
      const imgSrc = step ? step.screenshot : slideImg.src;
      if (!imgSrc) return;
      const safeTitle = (sessionMeta.title || "screenshot").replace(/[/\\?%*:|"<>]/g, "-");
      const blob = await dataUrlToBlob(imgSrc, "4k");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guideflow_${safeTitle}_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("ดาวน์โหลดภาพ (4K) เรียบร้อยแล้ว!");
    });
  }

  // Check URL query parameters (e.g. viewer.html?mode=capture)
  const urlParams = new URLSearchParams(window.location.search);
  const isSingleCaptureMode = urlParams.get("mode") === "capture";

  if (isExtension && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.guideRevision && !pendingSaves) reloadGuide().catch(error => showToast(error.message));
    });
  }
  const embedded = document.getElementById("guideflow-data");
  if (embedded || window.__SCRIBE_DATA__) {
    try {
      const bundle = GuideFlowData.validateBundle(embedded ? JSON.parse(embedded.textContent) : window.__SCRIBE_DATA__);
      currentSession = bundle.session; sessionMeta = bundle.meta; isEditMode = true;
      applyModeUI();
      if (currentSession.length) initViewer(); else showEmpty();
      setupEditListeners();
    } catch (error) { showEmpty(); showToast(error.message); }
  } else if (isExtension) {
    reloadGuide().catch(error => { showEmpty(); showToast(error.message); });
  } else { showEmpty(); isEditMode = true; applyModeUI(); setupEditListeners(); }

  function applyModeUI() {
    if (!isEditMode) {
      // In Read-Only Mode: Lock text and hide authoring tools
      slideStepTitle.removeAttribute("contenteditable");
      slideStepTitle.style.cursor = "default";
      slideStepTitle.removeAttribute("title");

      slideNoteText.removeAttribute("contenteditable");
      slideNoteText.style.cursor = "default";

      displayTitle.style.cursor = "default";
      displayTitle.removeAttribute("title");

      if (headerStepTools) headerStepTools.style.display = "none";
      if (btnImport) btnImport.style.display = "none";
      if (btnExportJson) btnExportJson.style.display = "none";
      if (btnExportHtml) btnExportHtml.style.display = "none";
      if (btnExportImages) btnExportImages.style.display = "none";
    } else {
      // In Studio Mode: Enable editing tools
      slideStepTitle.setAttribute("contenteditable", "true");
      slideStepTitle.title = "คลิกเพื่อแก้ไขคำอธิบายขั้นตอน";

      slideNoteText.setAttribute("contenteditable", "true");
      displayTitle.title = "คลิกเพื่อแก้ไขชื่อคู่มือ";

      if (headerStepTools) headerStepTools.style.display = "flex";
      if (btnImport) btnImport.style.display = "inline-flex";
      if (btnExportJson) btnExportJson.style.display = "inline-flex";
      if (btnExportHtml) btnExportHtml.style.display = "inline-flex";
      if (btnExportImages) btnExportImages.style.display = "inline-flex";
    }
  }

  function showEmpty() {
    displayTitle.textContent = "ยังไม่มีข้อมูลคู่มือ";
    timelineBar.textContent = "";
    slideImg.removeAttribute("src"); slideImg.style.display = "none";
    slideStepTitle.textContent = "เริ่มบันทึกหรือนำเข้า JSON เพื่อเปิดคู่มือ";
    spotlightRing.style.display = "none"; targetBox.style.display = "none";
    docContainer.textContent = "ยังไม่มีขั้นตอนที่ถูกบันทึก";
  }

  function initViewer() {
    slideImg.style.display = "";
    displayTitle.textContent = sessionMeta.title || "คู่มือการใช้งานระบบ";
    document.title = `${sessionMeta.title || "คู่มือการใช้งานระบบ"} — GuideFlow`;
    currentStepIndex = 0;
    resetZoomAndPan(false);
    renderSlidesTimeline();
    renderSlide(0);
    renderDocView();
  }

  function renderSlidesTimeline() {
    timelineBar.replaceChildren();
    currentSession.forEach((_, idx) => {
      const dot = document.createElement("div");
      dot.className = `timeline-dot ${idx === currentStepIndex ? "active" : ""}`;
      dot.setAttribute("title", `ขั้นตอนที่ ${idx + 1}`);
      dot.addEventListener("click", () => {
        currentStepIndex = idx;
        renderSlide(idx);
      });
      timelineBar.appendChild(dot);
    });
  }

  function renderSlide(index) {
    if (!currentSession || currentSession.length === 0) return;
    const step = currentSession[index];
    if (!step) return;

    if (isSingleCaptureMode) {
      slideStepBadge.textContent = "ภาพแคปหน้าจอ (Screenshot)";
      if (headerStepTools) headerStepTools.style.display = "none";
    } else {
      slideStepBadge.textContent = `Step ${index + 1} of ${currentSession.length}`;
    }
    slideStepTitle.textContent = step.description || `ขั้นตอนที่ ${index + 1}`;
    slideImg.src = step.screenshot;

    // Spotlight coordinate
    if (isSpotlightVisible && step.coords && step.coords.xPercent !== undefined) {
      spotlightRing.style.display = "block";
      spotlightRing.style.left = `${step.coords.xPercent}%`;
      spotlightRing.style.top = `${step.coords.yPercent}%`;
    } else {
      spotlightRing.style.display = "none";
    }

    // Auto Focus logic if enabled
    if (isAutoFocusActive && step.coords && step.coords.xPercent !== undefined) {
      requestAnimationFrame(() => {
        focusOnSpotlight(false);
      });
    } else {
      // Reset zoom when switching step in normal mode
      resetZoomAndPan(false);
    }

    // Target box
    if (isSpotlightVisible && step.coords && step.coords.box && step.coords.box.width > 0) {
      targetBox.style.display = "block";
      targetBox.style.left = `${step.coords.box.left}%`;
      targetBox.style.top = `${step.coords.box.top}%`;
      targetBox.style.width = `${step.coords.box.width}%`;
      targetBox.style.height = `${step.coords.box.height}%`;
    } else {
      targetBox.style.display = "none";
    }

    // Note / Tip box
    if (step.tipText) {
      slideNoteBox.classList.remove("hidden");
      slideNoteText.textContent = step.tipText;
    } else {
      slideNoteBox.classList.add("hidden");
      slideNoteText.textContent = "";
    }

    // Update timeline
    const dots = timelineBar.querySelectorAll(".timeline-dot");
    dots.forEach((d, i) => d.classList.toggle("active", i === index));

    // Nav button state
    btnPrev.disabled = index === 0;
    btnNext.querySelector(".btn-nav-label").textContent = index === currentSession.length - 1 ? "สิ้นสุด (Finished)" : "ถัดไป (Next)";
  }

  function renderDocView() {
    docContainer.replaceChildren();
    currentSession.forEach((step, idx) => {
      const card = document.createElement("div"); card.className = "doc-step-card";
      const header = document.createElement("div"); header.className = "doc-step-header";
      const badge = document.createElement("span"); badge.className = "step-badge"; badge.textContent = `Step ${idx + 1}`;
      const title = document.createElement("span"); title.className = "doc-step-title"; title.textContent = step.description || `ขั้นตอนที่ ${idx + 1}`;
      header.append(badge, title);
      const wrap = document.createElement("div"); wrap.className = "doc-step-image-wrap";
      const screenshots = step.screenshots?.length ? step.screenshots : [step.screenshot];
      screenshots.forEach((url, imageIndex) => {
        const img = document.createElement("img"); img.src = GuideFlowData.safeImageUrl(url); img.alt = `Step ${idx + 1} ส่วนที่ ${imageIndex + 1}`; img.loading = "lazy";
        wrap.appendChild(img);
      });
      if (isSpotlightVisible && step.coords && step.coords.xPercent !== undefined) {
        const ring = document.createElement("div"); ring.className = "spotlight-ring";
        ring.style.left = `${step.coords.xPercent}%`; ring.style.top = `${step.coords.yPercent}%`;
        for (const name of ["ring-pulse", "ring-center-dot"]) { const dot = document.createElement("div"); dot.className = name; ring.appendChild(dot); }
        wrap.appendChild(ring);
      }
      card.append(header, wrap);
      if (step.tipText) { const tip = document.createElement("div"); tip.className = "doc-step-tip"; tip.textContent = "💡 ข้อแนะนำ: " + step.tipText; card.appendChild(tip); }
      docContainer.appendChild(card);
    });
  }

  function applyTransform(smooth = false) {
    if (smooth) {
      panZoomContent.classList.add("smooth-focus");
      setTimeout(() => panZoomContent.classList.remove("smooth-focus"), 400);
    }
    panZoomContent.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
    zoomLevelText.textContent = `${Math.round(zoomScale * 100)}%`;
  }

  function resetZoomAndPan(smooth = true) {
    zoomScale = 1.0;
    panX = 0;
    panY = 0;
    applyTransform(smooth);
  }

  function zoomAtCenter(delta) {
    const newScale = Math.min(Math.max(0.5, zoomScale + delta), 3.5);
    if (newScale === zoomScale) return;
    
    // Zoom relative to stage center
    const rect = stageWrapper.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    
    panX = cx - (cx - panX) * (newScale / zoomScale);
    panY = cy - (cy - panY) * (newScale / zoomScale);
    zoomScale = newScale;
    
    if (zoomScale === 1.0) {
      panX = 0;
      panY = 0;
    }
    applyTransform(false);
  }

  function focusOnSpotlight(smooth = true) {
    const step = currentSession[currentStepIndex];
    if (!step || !step.coords || step.coords.xPercent === undefined) {
      resetZoomAndPan(smooth);
      return;
    }

    const imgWidth = panZoomContent.offsetWidth || stageWrapper.offsetWidth;
    const imgHeight = panZoomContent.offsetHeight || stageWrapper.offsetHeight;
    const targetX = (step.coords.xPercent / 100) * imgWidth;
    const targetY = (step.coords.yPercent / 100) * imgHeight;

    zoomScale = 1.85; // Focused zoom ratio
    const stageW = stageWrapper.offsetWidth;
    const stageH = stageWrapper.offsetHeight;

    panX = (stageW / 2) - (targetX * zoomScale);
    panY = (stageH / 2) - (targetY * zoomScale);

    applyTransform(smooth);
  }

  function toggleAutoFocus() {
    isAutoFocusActive = !isAutoFocusActive;
    if (isAutoFocusActive) {
      btnAutoFocus.classList.add("active");
      autoFocusLabel.textContent = "Auto Focus (ON)";
      focusOnSpotlight(true);
    } else {
      btnAutoFocus.classList.remove("active");
      autoFocusLabel.textContent = "Auto Focus";
    }
  }

  function toggleSpotlightVisibility() {
    isSpotlightVisible = !isSpotlightVisible;
    if (isSpotlightVisible) {
      if (btnToggleSpotlight) {
        btnToggleSpotlight.classList.remove("off");
        if (toggleSpotlightIcon) toggleSpotlightIcon.textContent = "👁️";
        if (toggleSpotlightLabel) toggleSpotlightLabel.textContent = "Show Focus";
      }
    } else {
      if (btnToggleSpotlight) {
        btnToggleSpotlight.classList.add("off");
        if (toggleSpotlightIcon) toggleSpotlightIcon.textContent = "👁️‍🗨️";
        if (toggleSpotlightLabel) toggleSpotlightLabel.textContent = "Hide Focus";
      }
    }
    renderSlide(currentStepIndex);
    if (docContainer && docContainer.style.display !== "none") {
      renderDocView();
    }
  }

  // Zoom Button Events
  btnZoomIn.addEventListener("click", () => zoomAtCenter(0.25));
  btnZoomOut.addEventListener("click", () => zoomAtCenter(-0.25));
  btnZoomReset.addEventListener("click", () => {
    if (isAutoFocusActive) {
      isAutoFocusActive = false;
      btnAutoFocus.classList.remove("active");
      autoFocusLabel.textContent = "Auto Focus";
    }
    resetZoomAndPan(true);
  });
  btnFocusSpotlight.addEventListener("click", () => focusOnSpotlight(true));
  if (btnToggleSpotlight) {
    btnToggleSpotlight.addEventListener("click", toggleSpotlightVisibility);
  }

  // Focus Spotlight Color Ring Picker
  function positionSwatchesInRing() {
    const swatches = focusColorPalette.querySelectorAll(".color-swatch");
    const radius = 50; // pixels from center (ring radius)
    const center = 70; // 140px width / 2
    swatches.forEach(swatch => {
      const angleDeg = parseFloat(swatch.dataset.angle) || 0;
      const angleRad = (angleDeg - 90) * (Math.PI / 180);
      const x = center + radius * Math.cos(angleRad);
      const y = center + radius * Math.sin(angleRad);
      swatch.style.left = `${x}px`;
      swatch.style.top = `${y}px`;
      swatch.style.transform = "translate(-50%, -50%)";
    });
  }

  function setSpotlightColor(hexColor) {
    document.documentElement.style.setProperty("--spotlight-color", hexColor);
    
    // Parse hex to rgba
    let c = hexColor.replace("#", "");
    if (c.length === 3) c = c.split("").map(x => x + x).join("");
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    
    document.documentElement.style.setProperty("--spotlight-soft", `rgba(${r}, ${g}, ${b}, 0.24)`);
    document.documentElement.style.setProperty("--spotlight-glow", `rgba(${r}, ${g}, ${b}, 0.72)`);
    
    const colorSwatchCenter = document.getElementById("colorSwatchCenter");
    if (colorSwatchCenter) {
      colorSwatchCenter.style.background = hexColor;
    }
    
    localStorage.setItem("guideflow_spotlight_color", hexColor);

    if (focusColorPalette) {
      focusColorPalette.querySelectorAll(".color-swatch").forEach(swatch => {
        swatch.classList.toggle("active", swatch.dataset.color.toLowerCase() === hexColor.toLowerCase());
      });
    }
  }

  if (focusColorPalette) {
    positionSwatchesInRing();
  }

  const savedSpotlightColor = localStorage.getItem("guideflow_spotlight_color") || "#39FF14";
  setSpotlightColor(savedSpotlightColor);

  if (btnFocusColor && focusColorPalette) {
    btnFocusColor.addEventListener("click", (e) => {
      e.stopPropagation();
      focusColorPalette.classList.toggle("open");
    });

    focusColorPalette.querySelectorAll(".color-swatch").forEach(swatch => {
      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        setSpotlightColor(swatch.dataset.color);
        focusColorPalette.classList.remove("open");
      });
    });

    window.addEventListener("click", (e) => {
      if (!focusColorPalette.contains(e.target) && e.target !== btnFocusColor) {
        focusColorPalette.classList.remove("open");
      }
    });
  }

  btnAutoFocus.addEventListener("click", toggleAutoFocus);

  // Mouse Wheel Zoom
  stageWrapper.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    
    const rect = stageWrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newScale = Math.min(Math.max(0.5, zoomScale + delta), 3.5);
    if (newScale !== zoomScale) {
      panX = mouseX - (mouseX - panX) * (newScale / zoomScale);
      panY = mouseY - (mouseY - panY) * (newScale / zoomScale);
      zoomScale = newScale;
      if (zoomScale <= 1.0) {
        panX = 0;
        panY = 0;
      }
      applyTransform(false);
    }
  }, { passive: false });

  // Mouse Drag / Pan
  stageWrapper.addEventListener("mousedown", (e) => {
    if (e.target.closest(".floating-zoom-bar")) return;
    isPanning = true;
    startPanX = e.clientX - panX;
    startPanY = e.clientY - panY;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    panX = e.clientX - startPanX;
    panY = e.clientY - startPanY;
    applyTransform(false);
  });

  window.addEventListener("mouseup", () => {
    isPanning = false;
  });

  // Touch Support (Pinch-to-zoom & Swipe gesture for mobile/tablet)
  let initialPinchDistance = 0;
  let initialScale = 1.0;
  let touchStartX = 0;
  let touchStartY = 0;

  stageWrapper.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      isPanning = true;
      touchStartX = e.touches[0].clientX - panX;
      touchStartY = e.touches[0].clientY - panY;
    } else if (e.touches.length === 2) {
      isPanning = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistance = Math.hypot(dx, dy);
      initialScale = zoomScale;
    }
  }, { passive: true });

  stageWrapper.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1 && isPanning) {
      panX = e.touches[0].clientX - touchStartX;
      panY = e.touches[0].clientY - touchStartY;
      applyTransform(false);
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (initialPinchDistance > 0) {
        const factor = dist / initialPinchDistance;
        zoomScale = Math.min(Math.max(0.5, initialScale * factor), 3.5);
        applyTransform(false);
      }
    }
  }, { passive: true });

  stageWrapper.addEventListener("touchend", () => {
    isPanning = false;
    initialPinchDistance = 0;
  });

  /* --- ZEN / PRESENTATION MODE --- */
  function toggleZenMode() {
    isZenMode = !isZenMode;
    if (isZenMode) {
      document.body.classList.add("zen-active");
      mainHeader.classList.add("zen-hidden");
      zenToggleFloat.style.display = "inline-flex";
    } else {
      document.body.classList.remove("zen-active");
      mainHeader.classList.remove("zen-hidden");
      zenToggleFloat.style.display = "none";
    }
  }

  btnZenMode.addEventListener("click", toggleZenMode);
  zenToggleFloat.addEventListener("click", toggleZenMode);

  /* --- EDIT STEP TITLE & TIP (Only in Edit Mode) --- */
  function setupEditListeners() {
    if (editListenersInitialized) return;
    editListenersInitialized = true;

    slideStepTitle.addEventListener("blur", () => {
      if (currentSession[currentStepIndex]) {
        currentSession[currentStepIndex].description = slideStepTitle.textContent.trim();
        renderDocView();
        saveToStorage().catch(() => {});
      }
    });

    btnToggleTip.addEventListener("click", () => {
      const isHidden = slideNoteBox.classList.contains("hidden");
      if (isHidden) {
        slideNoteBox.classList.remove("hidden");
        slideNoteText.focus();
      } else {
        slideNoteBox.classList.add("hidden");
        if (currentSession[currentStepIndex]) {
          delete currentSession[currentStepIndex].tipText;
          renderDocView();
          saveToStorage().catch(() => {});
        }
      }
    });

    slideNoteText.addEventListener("blur", () => {
      if (currentSession[currentStepIndex]) {
        currentSession[currentStepIndex].tipText = slideNoteText.textContent.trim();
        renderDocView();
        saveToStorage().catch(() => {});
      }
    });

    btnDeleteStep.addEventListener("click", () => {
      if (currentSession.length <= 1) {
        alert("ไม่สามารถลบขั้นตอนสุดท้ายได้");
        return;
      }
      if (confirm(`คุณต้องการลบขั้นตอนที่ ${currentStepIndex + 1} หรือไม่?`)) {
        currentSession.splice(currentStepIndex, 1);
        if (currentStepIndex >= currentSession.length) {
          currentStepIndex = currentSession.length - 1;
        }
        renderSlidesTimeline();
        renderSlide(currentStepIndex);
        renderDocView();
        saveToStorage().catch(() => {});
      }
    });

    /* --- EDIT GUIDE TITLE MODAL --- */
    displayTitle.addEventListener("click", () => {
      inputEditTitle.value = sessionMeta.title || "คู่มือการใช้งานระบบ";
      titleModal.classList.add("open");
      inputEditTitle.focus();
    });

    btnCancelEditTitle.addEventListener("click", () => {
      titleModal.classList.remove("open");
    });

    btnSaveEditTitle.addEventListener("click", () => {
      const newTitle = inputEditTitle.value.trim() || "คู่มือการใช้งานระบบ";
      sessionMeta.title = newTitle;
      displayTitle.textContent = newTitle;
      document.title = `${newTitle} — GuideFlow`;
      titleModal.classList.remove("open");
      saveToStorage().catch(() => {});
    });
  }

  function saveToStorage(override, importing = false) {
    let bundle;
    try { bundle = GuideFlowData.validateBundle(override || { meta: sessionMeta, session: currentSession }); }
    catch (error) { showToast(error.message); return Promise.reject(error); }
    if (!isExtension) { window.__SCRIBE_DATA__ = bundle; return Promise.resolve(bundle); }
    const recordingId = guideRecordingId;
    pendingSaves++;
    const save = saveQueue.then(async () => {
      const result = await guideMessage({ type: "SAVE_GUIDE", bundle, expectedRevision: guideRevision, recordingId, importing });
      guideRevision = result.revision; guideRecordingId = result.recordingId;
      return bundle;
    });
    saveQueue = save.catch(async error => {
      showToast(error.message);
      await reloadGuide().catch(() => {});
    }).finally(() => { pendingSaves--; });
    return save;
  }

  // Print button
  btnPrint.addEventListener("click", () => {
    window.print();
  });

  // Navigation
  btnPrev.addEventListener("click", () => {
    if (currentStepIndex > 0) {
      currentStepIndex--;
      renderSlide(currentStepIndex);
    }
  });

  btnNext.addEventListener("click", () => {
    if (currentStepIndex < currentSession.length - 1) {
      currentStepIndex++;
      renderSlide(currentStepIndex);
    }
  });

  // Keyboard navigation
  window.addEventListener("keydown", (e) => {
    // Don't trigger shortcuts if editing text
    if (e.target.isContentEditable || e.target.tagName === "INPUT") return;

    if (e.key === "t" || e.key === "T") {
      toggleTheme();
    } else if (e.key === "z" || e.key === "Z") {
      toggleZenMode();
    } else if (e.key === "h" || e.key === "H") {
      toggleSpotlightVisibility();
    } else if (e.key === "a" || e.key === "A") {
      toggleAutoFocus();
    } else if (e.key === "f" || e.key === "F") {
      focusOnSpotlight(true);
    } else if (e.key === "r" || e.key === "R" || e.key === "0") {
      if (isAutoFocusActive) {
        isAutoFocusActive = false;
        btnAutoFocus.classList.remove("active");
        autoFocusLabel.textContent = "Auto Focus";
      }
      resetZoomAndPan(true);
    } else if (e.key === "+" || e.key === "=") {
      zoomAtCenter(0.25);
    } else if (e.key === "-" || e.key === "_") {
      zoomAtCenter(-0.25);
    } else if (slidesContainer.style.display !== "none") {
      if (e.key === "ArrowRight" || e.key === " ") {
        if (currentStepIndex < currentSession.length - 1) {
          currentStepIndex++;
          renderSlide(currentStepIndex);
        }
      } else if (e.key === "ArrowLeft") {
        if (currentStepIndex > 0) {
          currentStepIndex--;
          renderSlide(currentStepIndex);
        }
      }
    }
  });

  // Dark / Light Theme Toggle
  const savedTheme = localStorage.getItem("guideflow_theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-theme");
    if (themeIcon) themeIcon.textContent = "☀️";
  }

  function toggleTheme() {
    const isDark = document.body.classList.toggle("dark-theme");
    localStorage.setItem("guideflow_theme", isDark ? "dark" : "light");
    if (themeIcon) themeIcon.textContent = isDark ? "☀️" : "🌙";
  }

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener("click", toggleTheme);
  }

  // Toggle View modes
  btnViewSlides.addEventListener("click", () => {
    btnViewSlides.classList.add("active");
    btnViewDoc.classList.remove("active");
    slidesContainer.style.display = "flex";
    docContainer.style.display = "none";
  });

  btnViewDoc.addEventListener("click", () => {
    btnViewDoc.classList.add("active");
    btnViewSlides.classList.remove("active");
    slidesContainer.style.display = "none";
    docContainer.style.display = "block";
  });

  // Export Images to Local Folder
  btnExportImages.addEventListener("click", () => {
    if (!currentSession || currentSession.length === 0) {
      alert("ไม่มีข้อมูลขั้นตอนที่จะส่งออกรูปภาพ");
      return;
    }
    exportImagesModal.classList.add("open");
  });

  btnCancelExportImages.addEventListener("click", () => {
    exportImagesModal.classList.remove("open");
  });

  exportImagesModal.addEventListener("click", (e) => {
    if (e.target === exportImagesModal) {
      exportImagesModal.classList.remove("open");
    }
  });

  btnConfirmExportImages.addEventListener("click", async () => {
    exportImagesModal.classList.remove("open");
    const resolution = selExportResolution ? selExportResolution.value : "original";
    const includeHighlight = chkIncludeHighlight.checked;
    const includeReadme = chkIncludeReadme.checked;

    try {
      if (!window.showDirectoryPicker) {
        // Fallback for browsers without File System Access API
        await exportImagesFallback(includeHighlight, includeReadme, resolution);
        return;
      }

      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      await exportImagesToDirectory(dirHandle, includeHighlight, includeReadme, resolution);
      alert("ส่งออกรูปภาพลงโฟลเดอร์เรียบร้อยแล้ว!");
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Export images failed:", err);
        alert(`เกิดข้อผิดพลาดในการส่งออก: ${err.message || err}`);
      }
    }
  });

  async function renderHighlightedImage(dataUrl, step, resolution = "original") {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let targetWidth = img.naturalWidth || img.width;
        let targetHeight = img.naturalHeight || img.height;

        if (resolution === "4k") {
          const scale = 3840 / targetWidth;
          if (scale > 1) {
            targetWidth = 3840;
            targetHeight = Math.round(targetHeight * scale);
          }
        } else if (resolution === "2k") {
          const scale = 2560 / targetWidth;
          if (scale > 1) {
            targetWidth = 2560;
            targetHeight = Math.round(targetHeight * scale);
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Draw original screenshot scaled
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        if (step.coords && step.coords.xPercent !== undefined) {
          const x = (step.coords.xPercent / 100) * canvas.width;
          const y = (step.coords.yPercent / 100) * canvas.height;

          // Draw target box if present
          if (step.coords.box && step.coords.box.width > 0) {
            const bx = (step.coords.box.left / 100) * canvas.width;
            const by = (step.coords.box.top / 100) * canvas.height;
            const bw = (step.coords.box.width / 100) * canvas.width;
            const bh = (step.coords.box.height / 100) * canvas.height;

            ctx.save();
            ctx.strokeStyle = "#39FF14";
            ctx.lineWidth = Math.max(3, canvas.width * 0.0025);
            ctx.setLineDash([8, 6]);
            ctx.fillStyle = "rgba(57, 255, 20, 0.12)";
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeRect(bx, by, bw, bh);
            ctx.restore();
          }

          // Draw Hacker Green pulse ring
          ctx.save();
          const ringRadius = Math.max(22, canvas.width * 0.022);
          ctx.beginPath();
          ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(57, 255, 20, 0.25)";
          ctx.fill();
          ctx.strokeStyle = "#39FF14";
          ctx.lineWidth = Math.max(3.5, canvas.width * 0.0035);
          ctx.shadowColor = "rgba(57, 255, 20, 0.8)";
          ctx.shadowBlur = 15;
          ctx.stroke();

          // Center dot
          ctx.beginPath();
          ctx.arc(x, y, Math.max(6, ringRadius * 0.26), 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();
          ctx.strokeStyle = "#39FF14";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        }

        canvas.toBlob((blob) => resolve(blob), "image/png");
      };
      img.onerror = () => {
        // Fallback to dataURL blob if image load fails
        fetch(dataUrl).then(res => res.blob()).then(resolve);
      };
      img.src = dataUrl;
    });
  }

  async function dataUrlToBlob(dataUrl, resolution = "original") {
    if (resolution === "original") {
      const res = await fetch(dataUrl);
      return await res.blob();
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let targetWidth = img.naturalWidth || img.width;
        let targetHeight = img.naturalHeight || img.height;

        if (resolution === "4k") {
          const scale = 3840 / targetWidth;
          if (scale > 1) {
            targetWidth = 3840;
            targetHeight = Math.round(targetHeight * scale);
          }
        } else if (resolution === "2k") {
          const scale = 2560 / targetWidth;
          if (scale > 1) {
            targetWidth = 2560;
            targetHeight = Math.round(targetHeight * scale);
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        canvas.toBlob((blob) => resolve(blob), "image/png");
      };
      img.onerror = () => {
        fetch(dataUrl).then(res => res.blob()).then(resolve);
      };
      img.src = dataUrl;
    });
  }

  async function exportImagesToDirectory(dirHandle, includeHighlight, includeReadme, resolution = "original") {
    for (let i = 0; i < currentSession.length; i++) {
      const step = currentSession[i];
      const stepNum = String(i + 1).padStart(2, "0");
      const safeDesc = (step.description || "action")
        .replace(/[/\\?%*:|"<>]/g, "-")
        .replace(/\s+/g, "_")
        .substring(0, 30);

      const screenshots = Array.isArray(step.screenshots) && step.screenshots.length
        ? step.screenshots
        : [step.screenshot];

      for (let sIdx = 0; sIdx < screenshots.length; sIdx++) {
        const shotUrl = screenshots[sIdx];
        const partSuffix = screenshots.length > 1 ? `_part${sIdx + 1}` : "";
        const fileName = `step-${stepNum}_${safeDesc}${partSuffix}.png`;

        let blob;
        if (includeHighlight && sIdx === 0) {
          blob = await renderHighlightedImage(shotUrl, step, resolution);
        } else {
          blob = await dataUrlToBlob(shotUrl, resolution);
        }

        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      }
    }

    if (includeReadme) {
      let mdContent = `# ${sessionMeta.title || "คู่มือการใช้งานระบบ"}\n\n`;
      mdContent += `สร้างเมื่อ: ${new Date(sessionMeta.startTime || Date.now()).toLocaleString("th-TH")}\n\n`;
      mdContent += `## ขั้นตอนการดำเนินงาน\n\n`;

      currentSession.forEach((step, idx) => {
        const stepNum = String(idx + 1).padStart(2, "0");
        mdContent += `### ขั้นตอนที่ ${idx + 1}: ${step.description || "คลิกบนหน้าจอ"}\n`;
        if (step.url) mdContent += `- **URL:** ${step.url}\n`;
        if (step.tipText) mdContent += `- **ข้อแนะนำ:** 💡 ${step.tipText}\n`;
        mdContent += `\n`;
      });

      const readmeHandle = await dirHandle.getFileHandle("README.md", { create: true });
      const writable = await readmeHandle.createWritable();
      await writable.write(new Blob([mdContent], { type: "text/markdown;charset=utf-8" }));
      await writable.close();
    }
  }

  async function exportImagesFallback(includeHighlight, includeReadme, resolution = "original") {
    for (let i = 0; i < currentSession.length; i++) {
      const step = currentSession[i];
      const stepNum = String(i + 1).padStart(2, "0");
      const safeDesc = (step.description || "action")
        .replace(/[/\\?%*:|"<>]/g, "-")
        .replace(/\s+/g, "_")
        .substring(0, 30);

      const screenshots = Array.isArray(step.screenshots) && step.screenshots.length
        ? step.screenshots
        : [step.screenshot];

      for (let sIdx = 0; sIdx < screenshots.length; sIdx++) {
        const partSuffix = screenshots.length > 1 ? `_part${sIdx + 1}` : "";
        const fileName = `step-${stepNum}_${safeDesc}${partSuffix}.png`;
        let blob = includeHighlight && sIdx === 0
          ? await renderHighlightedImage(screenshots[sIdx], step, resolution)
          : await dataUrlToBlob(screenshots[sIdx], resolution);

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  // Export standalone HTML
  btnExportHtml.addEventListener("click", () => {
    const bundleData = {
      meta: sessionMeta,
      session: currentSession
    };

    const generateExport = (htmlTemplate, jsCode) => {
      const standalone = createStandaloneExport(htmlTemplate, jsCode, bundleData);
      const blob = new Blob([standalone], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = (sessionMeta.title || "guide").replace(/[/\\?%*:|"<>]/g, "-") + ".html";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    };

    if (isExtension) {
      Promise.all(["viewer.html", "guide-data.js", "viewer.js"].map(file => fetch(chrome.runtime.getURL(file)).then(response => { if (!response.ok) throw new Error("Unable to load export template"); return response.text(); })))
        .then(([html, dataJs, viewerJs]) => generateExport(html, dataJs + "\n" + viewerJs))
        .catch(error => showToast(error.message));
    } else {
      const runtime = document.getElementById("guideflow-runtime");
      if (!runtime) { showToast("เปิดคู่มือนี้ใน GuideFlow แล้วส่งออกใหม่เพื่ออัปเดตรูปแบบไฟล์"); return; }
      generateExport(document.documentElement.outerHTML, runtime.textContent);
    }
  });


  // Export JSON Backup
  btnExportJson.addEventListener("click", () => {
    if (!currentSession || currentSession.length === 0) {
      alert("ไม่มีข้อมูลขั้นตอนที่จะส่งออก");
      return;
    }
    const bundleData = {
      meta: sessionMeta,
      session: currentSession
    };
    const jsonStr = JSON.stringify(bundleData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const filename = (sessionMeta.title || "guide-backup").replace(/[/\\?%*:|"<>]/g, "-") + ".json";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Import JSON
  btnImport.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    const originalRevision = guideRevision, originalRecordingId = guideRecordingId;
    try {
      if (file.size > 48 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 48 MB");
      const bundle = GuideFlowData.validateBundle(JSON.parse(await file.text()));
      const imageUrls = new Set(bundle.session.flatMap(step => [step.screenshot, ...(step.screenshots || [])]));
      if (imageUrls.size > 2000) throw new Error("จำนวนภาพมากเกินไป");
      for (const url of imageUrls) {
        const bitmap = await createImageBitmap(await (await fetch(url)).blob());
        try {
          if (bitmap.width > 32767 || bitmap.height > 32767 || bitmap.width * bitmap.height > 64000000) throw new Error("ภาพมีขนาดใหญ่เกินไป");
        } finally { bitmap.close(); }
      }
      if (isExtension && (guideRevision !== originalRevision || guideRecordingId !== originalRecordingId)) throw new Error("คู่มือเปลี่ยนระหว่างนำเข้า กรุณาลองใหม่");
      await saveToStorage(bundle, true);
      currentSession = bundle.session; sessionMeta = bundle.meta; isEditMode = true;
      applyModeUI();
      if (currentSession.length) initViewer(); else showEmpty();
      setupEditListeners(); showToast("นำเข้าและบันทึกคู่มือแล้ว");
    } catch (error) { showToast("นำเข้าไม่สำเร็จ: " + error.message); }
    finally { fileInput.value = ""; }
  });

}

function bootGuideFlow() {
  const packaged = document.getElementById("guideflow-demo-data");
  if (!packaged) { startApp(); return; }
  hydrateDemoAssets(JSON.parse(packaged.textContent)).then(bundle => { window.__SCRIBE_DATA__ = bundle; startApp(); })
    .catch(error => { document.body.textContent = "ไม่สามารถเปิดคู่มือตัวอย่าง: " + error.message; });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootGuideFlow);
else bootGuideFlow();
