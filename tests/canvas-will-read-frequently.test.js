const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const editorJs = fs.readFileSync(path.join(root, "extension", "editor.js"), "utf8");
const capturePreviewJs = fs.readFileSync(path.join(root, "extension", "capture-preview.js"), "utf8");

// Verify willReadFrequently is configured to eliminate readback performance warning
assert(editorJs.includes('getContext("2d", { willReadFrequently: true })'), "editor.js must set willReadFrequently: true");
assert(capturePreviewJs.includes('getContext("2d", { willReadFrequently: true })'), "capture-preview.js must set willReadFrequently: true");

console.log("PASS willReadFrequently performance optimization verified");
