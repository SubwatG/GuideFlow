const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const previewHtml = fs.readFileSync(path.join(root, "extension", "capture-preview.html"), "utf8");
const previewJs = fs.readFileSync(path.join(root, "extension", "capture-preview.js"), "utf8");
const editorHtml = fs.readFileSync(path.join(root, "extension", "editor.html"), "utf8");
const editorJs = fs.readFileSync(path.join(root, "extension", "editor.js"), "utf8");

// 1. Verify Capture Preview Highlight Opacity Options (Translucent / Solid)
assert(previewHtml.includes('id="highlightStyleGroup"'), "capture-preview.html must include highlightStyleGroup");
assert(previewHtml.includes('id="hlTranslucent"'), "capture-preview.html must include hlTranslucent option");
assert(previewHtml.includes('id="hlSolid"'), "capture-preview.html must include hlSolid option");

assert(previewJs.includes('hlTranslucent'), "capture-preview.js must reference hlTranslucent");
assert(previewJs.includes('hlSolid'), "capture-preview.js must reference hlSolid");
assert(previewJs.includes('highlightOpacity === "solid" ? currentColor :'), "capture-preview.js must support solid vs translucent fillStyle");

// 2. Verify Editor Highlight Opacity Options (Translucent / Solid)
assert(editorHtml.includes('id="highlightStyleGroup"'), "editor.html must include highlightStyleGroup");
assert(editorHtml.includes('id="hlTranslucent"'), "editor.html must include hlTranslucent option");
assert(editorHtml.includes('id="hlSolid"'), "editor.html must include hlSolid option");

assert(editorJs.includes('hlTranslucent'), "editor.js must reference hlTranslucent");
assert(editorJs.includes('hlSolid'), "editor.js must reference hlSolid");
assert(editorJs.includes('highlightOpacity === "solid" ? currentColor :'), "editor.js must support solid vs translucent fillStyle");

console.log("PASS highlight style options (translucent vs solid) verified for capture-preview and editor");
