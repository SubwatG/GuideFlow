const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
const content = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));

assert.match(background, /ensureActiveTabContentScript\(\(\) =>/);
assert.match(background, /chrome\.scripting\.executeScript/);
assert.match(content, /GUIDEFLOW_PING/);
assert(manifest.permissions.includes("scripting"));
console.log("PASS recording bootstrap injects content script when needed");
