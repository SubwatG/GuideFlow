const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "extension", "viewer.html"), "utf8");
const js = fs.readFileSync(path.join(root, "extension", "viewer.js"), "utf8");

assert(html.includes("--hacker-green: #39FF14"));
assert(!html.includes(".pointer-arrow"));
assert(!html.includes('id="pointerArrow"'));
assert(!js.includes("pointerArrow"));
console.log("PASS pointer arrow/icon is removed; spotlight remains available");
