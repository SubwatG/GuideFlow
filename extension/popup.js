document.addEventListener("DOMContentLoaded", () => {
  const guideTitleInput = document.getElementById("guideTitle");
  const captureModeSelect = document.getElementById("captureMode");
  const captureModeGroup = document.getElementById("captureModeGroup");
  const titleGroup = document.getElementById("titleGroup");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const stepsCount = document.getElementById("stepsCount");

  const btnStart = document.getElementById("btnStart");
  const btnAppend = document.getElementById("btnAppend");
  const recordingActions = document.getElementById("recordingActions");
  const btnPause = document.getElementById("btnPause");
  const btnStopRec = document.getElementById("btnStopRec");
  const pausedActions = document.getElementById("pausedActions");
  const btnResume = document.getElementById("btnResume");
  const btnStopPaused = document.getElementById("btnStopPaused");
  const btnOpenViewer = document.getElementById("btnOpenViewer");

  function updateUI() {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
      if (!res) return;

      const status = res.status || "idle";
      const count = res.stepsCount || 0;
      stepsCount.textContent = count;

      if (res.meta && res.meta.title && !guideTitleInput.value) {
        guideTitleInput.value = res.meta.title;
      }
      if (res.meta && res.meta.captureMode) {
        captureModeSelect.value = res.meta.captureMode;
      }

      if (status === "recording") {
        statusDot.className = "dot recording";
        statusText.textContent = "กำลังบันทึกหน้าจอ...";
        titleGroup.style.display = "none";
        captureModeGroup.style.display = "none";
        btnStart.style.display = "none";
        btnAppend.style.display = "none";
        recordingActions.style.display = "flex";
        pausedActions.style.display = "none";
        btnOpenViewer.style.display = "none";
      } else if (status === "paused") {
        statusDot.className = "dot paused";
        statusText.textContent = "พักการบันทึกชั่วคราว";
        titleGroup.style.display = "none";
        captureModeGroup.style.display = "none";
        btnStart.style.display = "none";
        btnAppend.style.display = "none";
        recordingActions.style.display = "none";
        pausedActions.style.display = "flex";
        btnOpenViewer.style.display = "none";
      } else {
        statusDot.className = "dot";
        statusText.textContent = count > 0 ? "บันทึกเสร็จสิ้น" : "พร้อมเริ่มบันทึก";
        titleGroup.style.display = "block";
        captureModeGroup.style.display = "block";
        btnStart.style.display = "flex";
        btnAppend.style.display = count > 0 ? "flex" : "none";
        recordingActions.style.display = "none";
        pausedActions.style.display = "none";
        btnOpenViewer.style.display = count > 0 ? "flex" : "none";
      }
    });
  }

  btnStart.addEventListener("click", () => {
    const title = guideTitleInput.value.trim() || "คู่มือการใช้งานระบบ";
    chrome.runtime.sendMessage({ type: "START_RECORDING", title, captureMode: captureModeSelect.value, append: false }, () => {
      updateUI();
      window.close();
    });
  });

  btnAppend.addEventListener("click", () => {
    const title = guideTitleInput.value.trim() || "คู่มือการใช้งานระบบ";
    chrome.runtime.sendMessage({ type: "START_RECORDING", title, captureMode: captureModeSelect.value, append: true }, () => {
      updateUI();
      window.close();
    });
  });

  btnPause.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "PAUSE_RECORDING" }, () => updateUI());
  });

  btnResume.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "RESUME_RECORDING" }, () => {
      updateUI();
      window.close();
    });
  });

  function stopAndOpenViewer() {
    chrome.runtime.sendMessage({ type: "STOP_RECORDING" }, () => {
      updateUI();
      chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
    });
  }

  btnStopRec.addEventListener("click", stopAndOpenViewer);
  btnStopPaused.addEventListener("click", stopAndOpenViewer);

  btnOpenViewer.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
  });

  // Tab Switching
  const tabWorkflowBtn = document.getElementById("tabWorkflowBtn");
  const tabCaptureBtn = document.getElementById("tabCaptureBtn");
  const tabWorkflowPanel = document.getElementById("tabWorkflowPanel");
  const tabCapturePanel = document.getElementById("tabCapturePanel");

  tabWorkflowBtn.addEventListener("click", () => {
    tabWorkflowBtn.classList.add("active");
    tabCaptureBtn.classList.remove("active");
    tabWorkflowPanel.classList.add("active");
    tabCapturePanel.classList.remove("active");
  });

  tabCaptureBtn.addEventListener("click", () => {
    tabCaptureBtn.classList.add("active");
    tabWorkflowBtn.classList.remove("active");
    tabCapturePanel.classList.add("active");
    tabWorkflowPanel.classList.remove("active");
  });

  // Mode Selection Grid (Visible Part, Full Page, Selected Area)
  let selectedCaptureMode = "viewport";
  const modeCards = document.querySelectorAll("#snapshotModeGrid .mode-card");
  modeCards.forEach((card) => {
    card.addEventListener("click", () => {
      modeCards.forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      selectedCaptureMode = card.getAttribute("data-mode");
    });
  });

  const btnTakeSnapshot = document.getElementById("btnTakeSnapshot");
  const snapshotFeedback = document.getElementById("snapshotFeedback");

  function showFeedback(text, isError = false) {
    snapshotFeedback.style.display = "block";
    snapshotFeedback.textContent = text;
    snapshotFeedback.style.backgroundColor = isError ? "#FEE2E2" : "#E6F4EA";
    snapshotFeedback.style.color = isError ? "#991B1B" : "#137333";
    setTimeout(() => {
      snapshotFeedback.style.display = "none";
    }, 3500);
  }

  async function copyImageToClipboard(dataUrl) {
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      return true;
    } catch (err) {
      console.warn("Failed clipboard write:", err);
      return false;
    }
  }

  function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  btnTakeSnapshot.addEventListener("click", () => {
    const captureMode = selectedCaptureMode;
    const actionType = "preview";

    if (captureMode === "selected") {
      // Area selection mode requires user to draw box on active tab
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab || !tab.id) {
          showFeedback("ไม่พบแท็บที่เปิดอยู่", true);
          return;
        }
        chrome.tabs.sendMessage(tab.id, { type: "START_AREA_SELECTION", actionType }, (response) => {
          if (chrome.runtime.lastError) {
            showFeedback("กรุณารีเฟรชหน้าเว็บก่อนใช้งาน Selected Area", true);
            return;
          }
          window.close();
        });
      });
      return;
    }

    btnTakeSnapshot.disabled = true;
    btnTakeSnapshot.style.opacity = "0.7";
    const originalText = btnTakeSnapshot.innerHTML;
    btnTakeSnapshot.innerHTML = "กำลังแคปภาพ...";

    chrome.runtime.sendMessage({
      type: "MANUAL_SCREEN_CAPTURE",
      captureMode,
      actionType
    }, async (res) => {
      btnTakeSnapshot.disabled = false;
      btnTakeSnapshot.style.opacity = "1";
      btnTakeSnapshot.innerHTML = originalText;

      if (!res || !res.ok) {
        showFeedback(res?.error || "เกิดข้อผิดพลาดในการแคปภาพ", true);
        return;
      }

      if (actionType === "download") {
        const safeTitle = (res.title || "screenshot").replace(/[^a-zA-Z0-9ก-๙_-]/g, "_").slice(0, 30);
        const filename = `guideflow_${safeTitle}_${Date.now()}.png`;
        downloadDataUrl(res.screenshot, filename);
        showFeedback("ดาวน์โหลดภาพ และเปิดหน้าตัวอย่างให้เรียบร้อยแล้ว!");
      } else if (actionType === "copy") {
        const copied = await copyImageToClipboard(res.screenshot);
        if (copied) {
          showFeedback("คัดลอกภาพ และเปิดหน้าตัวอย่างให้เรียบร้อยแล้ว!");
        } else {
          // Fallback if browser security blocks navigator.clipboard in popup
          downloadDataUrl(res.screenshot, `guideflow_${Date.now()}.png`);
          showFeedback("เปิดหน้าตัวอย่าง และบันทึกไฟล์ภาพให้แทน");
        }
      } else if (actionType === "append") {
        showFeedback(`เพิ่มเป็นขั้นตอนที่ ${res.stepCount} ในคู่มือ และเปิดหน้าตัวอย่างแล้ว!`);
        updateUI();
      }

      // Close popup after brief moment so preview tab opens seamlessly
      setTimeout(() => {
        window.close();
      }, 350);
    });
  });

  updateUI();
});
