const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "extension", "viewer.html"), "utf8");
const js = fs.readFileSync(path.join(root, "extension", "viewer.js"), "utf8");

// 1. Check UI elements for Focus Color Picker
assert(html.includes('id="btnFocusColor"'), "Must have btnFocusColor button in viewer.html");
assert(html.includes('id="focusColorPalette"'), "Must have focusColorPalette in viewer.html");
assert(html.includes('class="color-swatch"'), "Must have color-swatch elements");
assert(html.includes('--spotlight-color'), "Must declare --spotlight-color CSS variable");

// 2. Check JS implementation for dynamic spotlight color
assert(js.includes("function setSpotlightColor(hexColor)"), "Must implement setSpotlightColor function");
assert(js.includes("guideflow_spotlight_color"), "Must persist spotlight color preference in localStorage");
assert(js.includes("setProperty(\"--spotlight-color\", hexColor)"), "Must update CSS variable --spotlight-color dynamically");

console.log("PASS Focus Spotlight Color Picker feature verified independently");
