const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "extension", "viewer.html"), "utf8");
const js = fs.readFileSync(path.join(root, "extension", "viewer.js"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

// 1. Check UI element for Auto Focus
assert(html.includes('id="btnAutoFocus"'), "Must have btnAutoFocus button");
assert(html.includes('id="autoFocusLabel"'), "Must have autoFocusLabel span");
assert(html.includes('id="btnFocusSpotlight"'), "Original Focus button must remain intact");

// 2. Check JS implementation
assert(js.includes("let isAutoFocusActive = false;"), "Must declare isAutoFocusActive flag");
assert(js.includes("function toggleAutoFocus()"), "Must have toggleAutoFocus function");
assert(js.includes('btnAutoFocus.addEventListener("click", toggleAutoFocus)'), "Must bind click to toggleAutoFocus");
assert(js.includes('e.key === "a" || e.key === "A"'), "Must support keyboard shortcut 'A' for Auto Focus");
assert(js.includes('e.key === "f" || e.key === "F"'), "Original 'F' shortcut must still work");
assert(js.includes("if (isAutoFocusActive && step.coords"), "renderSlide must check isAutoFocusActive");

// 3. Check README
assert(readme.includes("Auto Focus (🎯)"), "English README must mention Auto Focus");
assert(readme.includes("Auto Focus 🎯"), "Thai README must mention Auto Focus");

console.log("PASS Auto Focus feature and keyboard shortcut 'A' verified independently");
