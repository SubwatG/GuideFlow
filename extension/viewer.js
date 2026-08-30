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

function startApp() {
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

  // Mode Decision:
  // If it has chrome.runtime and chrome.storage -> In Extension Studio (Allow Editing)
  // If window.__SCRIBE_DATA__ exists -> In Standalone Exported Mode (Allow Editing and Exporting)
  if (window.__SCRIBE_DATA__ && window.__SCRIBE_DATA__.session && window.__SCRIBE_DATA__.session.length > 0) {
    currentSession = window.__SCRIBE_DATA__.session;
    sessionMeta = window.__SCRIBE_DATA__.meta || sessionMeta;
    isEditMode = true; // EDIT / STUDIO MODE
    applyModeUI();
    initViewer();
    setupEditListeners();
  } else if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    // Inside Extension Studio: Allow Editing
    chrome.storage.local.get(["currentSession", "sessionMeta"], (res) => {
      if (res.currentSession && res.currentSession.length > 0) {
        currentSession = res.currentSession;
        sessionMeta = res.sessionMeta || sessionMeta;
        isEditMode = true; // EDIT / STUDIO MODE
        applyModeUI();
        initViewer();
        setupEditListeners();
      } else {
        showEmpty();
      }
    });
  } else {
    showEmpty();
  }

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
    slidesContainer.innerHTML = `
      <div class="empty-state">
        <h2>ยังไม่มีขั้นตอนที่ถูกบันทึก</h2>
        <p style="margin-top: 10px; line-height: 1.6;">เปิดหน้าเว็บที่ต้องการ แล้วกดไอคอน Extension เพื่อเริ่มบันทึก (Start Capture)<br>หรือกดปุ่ม <b>"นำเข้า"</b> ด้านบนเพื่อเปิดดูคู่มือที่มีอยู่</p>
      </div>
    `;
  }

  function initViewer() {
    displayTitle.textContent = sessionMeta.title || "คู่มือการใช้งานระบบ";
    document.title = `${sessionMeta.title || "คู่มือการใช้งานระบบ"} — GuideFlow`;
    currentStepIndex = 0;
    resetZoomAndPan(false);
    renderSlidesTimeline();
    renderSlide(0);
    renderDocView();
  }

  function renderSlidesTimeline() {
    timelineBar.innerHTML = "";
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

    slideStepBadge.textContent = `Step ${index + 1} of ${currentSession.length}`;
    slideStepTitle.textContent = step.description || `ขั้นตอนที่ ${index + 1}`;
    slideImg.src = step.screenshot;

    // Spotlight coordinate
    if (step.coords && step.coords.xPercent !== undefined) {
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
    if (step.coords && step.coords.box && step.coords.box.width > 0) {
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
    docContainer.innerHTML = "";
    currentSession.forEach((step, idx) => {
      const card = document.createElement("div");
      card.className = "doc-step-card";

      let ringHtml = "";
      if (step.coords && step.coords.xPercent !== undefined) {
        ringHtml = `
          <div class="spotlight-ring" style="left: ${step.coords.xPercent}%; top: ${step.coords.yPercent}%;">
            <div class="ring-pulse"></div>
            <div class="ring-center-dot"></div>
          </div>

        `;
      }

      let tipHtml = "";
      if (step.tipText) {
        tipHtml = `
          <div style="padding: 10px 20px; background: rgba(210,165,75,0.1); border-top: 1px solid rgba(210,165,75,0.2); font-size: 13px;">
            <b style="color: #946914;">💡 ข้อแนะนำ:</b> ${step.tipText}
          </div>
        `;
      }

      const screenshots = Array.isArray(step.screenshots) && step.screenshots.length
        ? step.screenshots
        : [step.screenshot];
      const imagesHtml = screenshots.map((screenshot, imageIndex) => `
        <img src="${screenshot}" alt="Step ${idx + 1} ส่วนที่ ${imageIndex + 1}" />
      `).join("");

      card.innerHTML = `
        <div class="doc-step-header">
          <span class="step-badge">Step ${idx + 1}</span>
          <span class="doc-step-title">${step.description || `ขั้นตอนที่ ${idx + 1}`}</span>
        </div>
        <div class="doc-step-image-wrap">
          ${imagesHtml}
          ${ringHtml}
        </div>
        ${tipHtml}
      `;
      docContainer.appendChild(card);
    });
  }

  /* --- ZOOM & PAN ENGINE --- */
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
        saveToStorage();
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
          saveToStorage();
        }
      }
    });

    slideNoteText.addEventListener("blur", () => {
      if (currentSession[currentStepIndex]) {
        currentSession[currentStepIndex].tipText = slideNoteText.textContent.trim();
        renderDocView();
        saveToStorage();
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
        saveToStorage();
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
      saveToStorage();
    });
  }

  function saveToStorage() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ currentSession, sessionMeta });
    }
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
    const includeHighlight = chkIncludeHighlight.checked;
    const includeReadme = chkIncludeReadme.checked;

    try {
      if (!window.showDirectoryPicker) {
        // Fallback for browsers without File System Access API
        await exportImagesFallback(includeHighlight, includeReadme);
        return;
      }

      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      await exportImagesToDirectory(dirHandle, includeHighlight, includeReadme);
      alert("ส่งออกรูปภาพลงโฟลเดอร์เรียบร้อยแล้ว!");
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Export images failed:", err);
        alert(`เกิดข้อผิดพลาดในการส่งออก: ${err.message || err}`);
      }
    }
  });

  async function renderHighlightedImage(dataUrl, step) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");

        // Draw original screenshot
        ctx.drawImage(img, 0, 0);

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

  async function dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return await res.blob();
  }

  async function exportImagesToDirectory(dirHandle, includeHighlight, includeReadme) {
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
          blob = await renderHighlightedImage(shotUrl, step);
        } else {
          blob = await dataUrlToBlob(shotUrl);
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

  async function exportImagesFallback(includeHighlight, includeReadme) {
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
          ? await renderHighlightedImage(screenshots[sIdx], step)
          : await dataUrlToBlob(screenshots[sIdx]);

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
      // Escape script tags inside embedded string/json literals so HTML parser won't terminate script early
      const safeDataJson = JSON.stringify(bundleData).split("<" + "/script>").join("<\\/script>");
      const safeJsCode = jsCode.split("<" + "/script>").join("<\\/script>");
      
      const tagScriptOpen = "<" + "script" + ">";
      const tagScriptClose = "<" + "/script" + ">";
      const searchTarget = '<' + 'script src="viewer.js">' + '<' + '/script>';

      const standalone = htmlTemplate.replace(
        searchTarget,
        `${tagScriptOpen}\nwindow.__SCRIBE_DATA__ = ${safeDataJson};\n${safeJsCode}\n${tagScriptClose}`
      );

      const blob = new Blob([standalone], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = (sessionMeta.title || "guide").replace(/[/\\?%*:|"<>]/g, "-") + ".html";
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
      fetch(chrome.runtime.getURL("viewer.html"))
        .then(res => res.text())
        .then(html => {
          fetch(chrome.runtime.getURL("viewer.js"))
            .then(jsRes => jsRes.text())
            .then(jsContent => {
              generateExport(html, jsContent);
            });
        });
    } else {
      // In standalone mode, generate full updated standalone HTML
      // In standalone mode, inline script contains viewer logic, so we extract JS or re-fetch template
      fetch(window.location.href)
        .then(res => res.text())
        .then(currentHtml => {
          const safeDataJson = JSON.stringify(bundleData).split("<" + "/script>").join("<\\/script>");
          const tagScriptOpen = "<" + "script" + ">";
          const tagScriptClose = "<" + "/script" + ">";
          
          let standalone = "";
          const scriptRegex = new RegExp("<" + "script" + ">([\\s\\S]*?)<" + "/script" + ">", "i");
          const match = currentHtml.match(scriptRegex);
          if (match) {
            // Extract the JS code part (everything after window.__SCRIBE_DATA__ = ...;)
            let existingJs = match[1];
            const scribeDataRegex = /window\.__SCRIBE_DATA__\s*=\s*[\s\S]*?;\s*/;
            existingJs = existingJs.replace(scribeDataRegex, "");
            
            standalone = currentHtml.replace(
              scriptRegex,
              `${tagScriptOpen}\nwindow.__SCRIBE_DATA__ = ${safeDataJson};\n${existingJs}\n${tagScriptClose}`
            );
          } else {
            standalone = currentHtml;
          }

          const blob = new Blob([standalone], { type: "text/html;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const filename = (sessionMeta.title || "guide").replace(/[/\\?%*:|"<>]/g, "-") + ".html";
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
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
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.session) {
          currentSession = data.session;
          sessionMeta = data.meta || sessionMeta;
        } else if (Array.isArray(data)) {
          currentSession = data;
        }
        initViewer();
        setupEditListeners();
      } catch (err) {
        alert("ไฟล์ JSON ไม่ถูกต้อง");
      }
    };
    reader.readAsText(file);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}
