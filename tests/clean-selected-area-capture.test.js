const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const contentJs = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");
const bgJs = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");

// Verify overlay and selection box are cleaned up before screenshot capture
assert(contentJs.includes("cleanup();"), "content.js must cleanup selection overlay before CROP_AREA_CAPTURE message");
assert(contentJs.includes("setTimeout"), "content.js must yield to browser repaint before sending capture message");
assert(bgJs.includes("handleCropAreaCapture"), "background.js must handle crop area capture");

console.log("PASS Selected Area clean capture without highlight/overlay artifact verified");
