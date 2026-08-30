const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "extension", "viewer.html"), "utf8");
const js = fs.readFileSync(path.join(root, "extension", "viewer.js"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

// 1. Buttons exist with explicit labels and tooltips
assert(html.includes('id="btnImport"'), "Import button must exist");
assert(html.includes("นำเข้า JSON"), "Import button text must be 'นำเข้า JSON'");
assert(html.includes('id="btnExportJson"'), "Export JSON button must exist");
assert(html.includes("Export JSON"), "Export JSON button text must exist");

// 2. JS Handlers
assert(js.includes('btnExportJson.addEventListener("click"'), "JS must handle Export JSON click");
assert(js.includes('btnImport.addEventListener("click"'), "JS must handle Import JSON click");
assert(js.includes("application/json;charset=utf-8"), "Export JSON must produce valid JSON blob");

// 3. Documentation updated in README.md (EN & TH)
assert(readme.includes("Export / Import JSON:"), "English README must document JSON import/export");
assert(readme.includes("สำรองและนำเข้าข้อมูล (Export / Import JSON):"), "Thai README must document JSON import/export");

console.log("PASS JSON Import/Export feature and documentation verified successfully");
