const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "extension", "viewer.html"), "utf8");
const js = fs.readFileSync(path.join(root, "extension", "viewer.js"), "utf8");

// 1. Check UI element for Toggle Focus Spotlight Visibility
assert(html.includes('id="btnToggleSpotlight"'), "Must have btnToggleSpotlight button");
assert(html.includes('id="toggleSpotlightIcon"'), "Must have toggleSpotlightIcon span");
assert(html.includes('id="toggleSpotlightLabel"'), "Must have toggleSpotlightLabel span");
assert(html.includes('class="btn-toggle-spotlight"'), "Must have btn-toggle-spotlight CSS class");

// 2. Check JS implementation
assert(js.includes("let isSpotlightVisible = true;"), "Must declare isSpotlightVisible flag");
assert(js.includes("function toggleSpotlightVisibility()"), "Must have toggleSpotlightVisibility function");
assert(js.includes('btnToggleSpotlight.addEventListener("click", toggleSpotlightVisibility)'), "Must bind click to toggleSpotlightVisibility");
assert(js.includes('e.key === "h" || e.key === "H"'), "Must support keyboard shortcut 'H' for toggle spotlight visibility");
assert(js.includes("if (isSpotlightVisible && step.coords"), "renderSlide must check isSpotlightVisible");
assert(js.includes("if (isSpotlightVisible && step.coords && step.coords.box"), "renderSlide must check isSpotlightVisible for targetBox");
assert(js.includes("if (isSpotlightVisible && step.coords && step.coords.xPercent !== undefined)"), "renderDocView must check isSpotlightVisible");

console.log("PASS Toggle Focus Spotlight Visibility and keyboard shortcut 'H' verified independently");
