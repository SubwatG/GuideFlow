document.addEventListener("DOMContentLoaded", () => {
  const guideTitleInput = document.getElementById("guideTitle");
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

      if (status === "recording") {
        statusDot.className = "dot recording";
        statusText.textContent = "กำลังบันทึกหน้าจอ...";
        titleGroup.style.display = "none";
        btnStart.style.display = "none";
        btnAppend.style.display = "none";
        recordingActions.style.display = "flex";
        pausedActions.style.display = "none";
        btnOpenViewer.style.display = "none";
      } else if (status === "paused") {
        statusDot.className = "dot paused";
        statusText.textContent = "พักการบันทึกชั่วคราว";
        titleGroup.style.display = "none";
        btnStart.style.display = "none";
        btnAppend.style.display = "none";
        recordingActions.style.display = "none";
        pausedActions.style.display = "flex";
        btnOpenViewer.style.display = "none";
      } else {
        statusDot.className = "dot";
        statusText.textContent = count > 0 ? "บันทึกเสร็จสิ้น" : "พร้อมเริ่มบันทึก";
        titleGroup.style.display = "block";
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
    chrome.runtime.sendMessage({ type: "START_RECORDING", title, append: false }, () => {
      updateUI();
      window.close();
    });
  });

  btnAppend.addEventListener("click", () => {
    const title = guideTitleInput.value.trim() || "คู่มือการใช้งานระบบ";
    chrome.runtime.sendMessage({ type: "START_RECORDING", title, append: true }, () => {
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

  updateUI();
});
