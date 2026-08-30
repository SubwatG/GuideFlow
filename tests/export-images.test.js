const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "extension", "viewer.html"), "utf8");
const js = fs.readFileSync(path.join(root, "extension", "viewer.js"), "utf8");

// Check Export Images button & modal exist
assert(html.includes('id="btnExportImages"'), "Viewer HTML must have btnExportImages");
assert(html.includes('id="exportImagesModal"'), "Viewer HTML must have exportImagesModal");
assert(html.includes('id="chkIncludeHighlight"'), "Modal must have checkbox for highlight");
assert(html.includes('id="chkIncludeReadme"'), "Modal must have checkbox for README");

// Check JS logic
assert(js.includes('btnExportImages.addEventListener("click"'), "JS must bind click to export images button");
assert(js.includes("window.showDirectoryPicker"), "JS must use showDirectoryPicker API");
assert(js.includes("renderHighlightedImage"), "JS must have canvas rendering for highlight bake-in");
assert(js.includes("exportImagesToDirectory"), "JS must implement saving files into local directory");
assert(js.includes("README.md"), "JS must support exporting README.md summary");

console.log("PASS export images to directory with highlight toggle verified");
