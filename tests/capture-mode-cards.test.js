const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const popupHtml = fs.readFileSync(path.join(root, "extension", "popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
const contentJs = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");
const bgJs = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));

// 1. Check Mode Grid Cards (Visible Part, Full Page, Selected Area)
assert(popupHtml.includes('id="cardModeViewport"'), "Must have card for Visible Part");
assert(popupHtml.includes('id="cardModeFullpage"'), "Must have card for Full Page");
assert(popupHtml.includes('id="cardModeSelected"'), "Must have card for Selected Area");
assert(popupHtml.includes('Visible Part'), "Label Visible Part must exist");
assert(popupHtml.includes('Full Page'), "Label Full Page must exist");
assert(popupHtml.includes('Selected Area'), "Label Selected Area must exist");

// 2. Check Selection interaction logic
assert(popupJs.includes('selectedCaptureMode = card.getAttribute("data-mode")'), "Must track selected mode");
assert(popupJs.includes('START_AREA_SELECTION'), "Must trigger area selection when selected mode is chosen");

// 3. Check Content Script Overlay and selection drawing
assert(contentJs.includes('initAreaSelectionOverlay'), "Content script must implement area selection overlay");
assert(contentJs.includes('gf-selection-overlay'), "Overlay must be created in DOM");
assert(contentJs.includes('CROP_AREA_CAPTURE'), "Selected coordinates must be dispatched via CROP_AREA_CAPTURE");

// 4. Check Background Handler and crop capability
assert(bgJs.includes('handleCropAreaCapture'), "Background must handle crop area");
assert(bgJs.includes('cropImageBitmap'), "Background must support bitmap cropping");
assert(manifest.permissions.includes('downloads'), "Manifest must declare downloads permission");

console.log("PASS Mode cards (Visible Part, Full Page, Selected Area) verified independently");
