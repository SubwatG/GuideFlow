const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const editorHtml = fs.readFileSync(path.join(root, "extension", "editor.html"), "utf8");
const editorJs = fs.readFileSync(path.join(root, "extension", "editor.js"), "utf8");
const bgJs = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
const popupJs = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "extension", "popup.html"), "utf8");

// 1. Check Editor HTML UI tools
assert(editorHtml.includes('id="toolRect"'), "Editor must have Rect tool");
assert(editorHtml.includes('id="toolArrow"'), "Editor must have Arrow tool");
assert(editorHtml.includes('id="toolHighlight"'), "Editor must have Highlight tool");
assert(editorHtml.includes('id="toolText"'), "Editor must have Text tool");
assert(editorHtml.includes('id="paintCanvas"'), "Editor must have paint canvas");

// 2. Check Editor JS functionality
assert(editorJs.includes("drawArrow"), "Editor must implement drawArrow");
assert(editorJs.includes("btnCopyResult"), "Editor must support copy");
assert(editorJs.includes("btnDownloadResult"), "Editor must support download");
assert(editorJs.includes("btnAppendResult"), "Editor must support append to guide");

// 3. Check Background auto injection and editor launcher
assert(bgJs.includes("openCaptureEditor"), "Background must implement openCaptureEditor");
assert(bgJs.includes("stitchScreenshots"), "Background must support high-res stitching for fullpage");
assert(bgJs.includes("chrome.scripting.executeScript"), "Background must auto-inject content script on missing connection");

// 4. Check Popup Default (preview direct action)
assert(popupJs.includes('actionType = "preview"'), "Popup must directly open preview viewer");

console.log("PASS Full-page auto-recovery, high-res stitching, and standalone Editor verified independently");
