const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const viewerHtml = fs.readFileSync(path.join(root, "extension", "viewer.html"), "utf8");
const viewerJs = fs.readFileSync(path.join(root, "extension", "viewer.js"), "utf8");
const editorHtml = fs.readFileSync(path.join(root, "extension", "editor.html"), "utf8");
const capturePreviewHtml = fs.readFileSync(path.join(root, "extension", "capture-preview.html"), "utf8");

// 1. Verify 4K & Resolution selector exists in Export Modal
assert(viewerHtml.includes('id="selExportResolution"'), "viewer.html must have resolution selector");
assert(viewerHtml.includes('value="4k"'), "viewer.html must offer 4K option");
assert(viewerJs.includes('resolution === "4k"'), "viewer.js must handle 4K upscale");
assert(viewerJs.includes('scale = 3840 / targetWidth'), "viewer.js must scale to 3840 for 4K");

// 2. Verify Blur tool is cleanly removed from UI
assert(!editorHtml.includes('id="toolBlur"'), "editor.html must not have blur tool button");
assert(!capturePreviewHtml.includes('id="toolBlur"'), "capture-preview.html must not have blur tool button");

console.log("PASS 4k resolution verified and blur tool cleanly removed");
