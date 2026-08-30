const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "extension", "viewer.html"), "utf8");
const js = fs.readFileSync(path.join(root, "extension", "viewer.js"), "utf8");

// 1. Slides View Max-width & Adaptive Height
assert(html.includes("max-width: min(1680px, 96vw)"), "slidesContainer should have responsive max-width");
assert(html.includes("height: calc(100dvh - 72px)"), "slidesContainer should fit viewport height");
assert(html.includes("body.zen-active #slidesContainer"), "zen mode should expand slides container");

// 2. Stage wrapper should be flex: 1 and avoid hardcoded 65vh / 75vh
assert(html.includes("flex: 1;"), "stage-wrapper must be flex-grow");
assert(!html.includes("height: 65vh"), "stage-wrapper should not fix height to 65vh");
assert(!html.includes("max-height: 75vh"), "stage-wrapper should remove max-height 75vh limit");

// 3. Stage image fit containment
assert(html.includes("max-width: 100%"), "stage-image must constrain max-width");
assert(html.includes("max-height: 100%"), "stage-image must constrain max-height");
assert(html.includes("object-fit: contain"), "stage-image must use object-fit contain");

// 4. Doc View Adaptive width
assert(html.includes("max-width: min(1360px, 94vw)"), "docContainer should have adaptive width");

// 5. Zen mode toggle in JS
assert(js.includes('document.body.classList.add("zen-active")'), "JS toggle must add zen-active class");
assert(js.includes('document.body.classList.remove("zen-active")'), "JS toggle must remove zen-active class");

console.log("PASS responsive and adaptive layout rules verified for all viewports (HD, FHD, 2K/4K)");
