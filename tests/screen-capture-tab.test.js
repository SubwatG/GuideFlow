const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const popupHtml = fs.readFileSync(path.join(root, "extension", "popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
const bgJs = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");

// 1. Check Popup HTML UI Elements
assert(popupHtml.includes('id="tabWorkflowBtn"'), "Popup HTML must contain tabWorkflowBtn");
assert(popupHtml.includes('id="tabCaptureBtn"'), "Popup HTML must contain tabCaptureBtn");
assert(popupHtml.includes('id="tabWorkflowPanel"'), "Popup HTML must contain tabWorkflowPanel");
assert(popupHtml.includes('id="tabCapturePanel"'), "Popup HTML must contain tabCapturePanel");
assert(popupHtml.includes('id="btnTakeSnapshot"'), "Popup HTML must contain btnTakeSnapshot button");
assert(popupHtml.includes('id="snapshotModeGrid"'), "Popup HTML must contain snapshotModeGrid");
assert(!popupHtml.includes('id="snapshotAction"'), "Popup HTML must not contain snapshotAction dropdown");

// 2. Check Popup JS event handling & Tab logic
assert(popupJs.includes('tabWorkflowBtn.addEventListener("click"'), "popup.js must handle workflow tab click");
assert(popupJs.includes('tabCaptureBtn.addEventListener("click"'), "popup.js must handle capture tab click");
assert(popupJs.includes('type: "MANUAL_SCREEN_CAPTURE"'), "popup.js must send MANUAL_SCREEN_CAPTURE message");

// 3. Check Background JS message listener & handler
assert(bgJs.includes('message.type === "MANUAL_SCREEN_CAPTURE"'), "background.js must listen for MANUAL_SCREEN_CAPTURE");
assert(bgJs.includes("handleManualScreenCapture"), "background.js must implement handleManualScreenCapture function");

// 4. Check Capture Preview UI with Copy & Download
const previewHtml = fs.readFileSync(path.join(root, "extension", "capture-preview.html"), "utf8");
const previewJs = fs.readFileSync(path.join(root, "extension", "capture-preview.js"), "utf8");
assert(previewHtml.includes('id="btnCopy"'), "capture-preview.html must include btnCopy button");
assert(previewHtml.includes('id="btnDownload"'), "capture-preview.html must include btnDownload button");
assert(previewHtml.includes('id="btnAppend"'), "capture-preview.html must include btnAppend button");
assert(previewJs.includes("singleCapturePreview"), "capture-preview.js must read singleCapturePreview");
assert(previewJs.includes("navigator.clipboard.write"), "capture-preview.js must implement copy to clipboard");
assert(bgJs.includes("capture-preview.html"), "background.js must open capture-preview.html");

console.log("PASS Screen Capture Tab, preview viewer with copy and download verified independently");
