const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "extension", "viewer.html"), "utf8");
const js = fs.readFileSync(path.join(root, "extension", "viewer.js"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

// 1. Check Dark mode CSS variables and classes
assert(html.includes("body.dark-theme"), "HTML must have body.dark-theme style rules");
assert(html.includes("--bg: #0F172A;"), "Dark theme must declare dark background");
assert(html.includes('id="btnThemeToggle"'), "HTML must have theme toggle button");
assert(html.includes('id="themeIcon"'), "HTML must have themeIcon span");

// 2. Check JS Logic and Persistence
assert(js.includes("guideflow_theme"), "JS must store theme preference in localStorage");
assert(js.includes("toggleTheme"), "JS must define toggleTheme function");
assert(js.includes('btnThemeToggle.addEventListener("click", toggleTheme)'), "JS must bind click to toggleTheme");
assert(js.includes('e.key === "t" || e.key === "T"'), "JS must support 'T' keyboard shortcut for Dark mode");

// 3. Check README
assert(readme.includes("Dark Mode (T)"), "English README must document Dark Mode");
assert(readme.includes("โหมดมืด (Dark Mode):"), "Thai README must document Dark Mode");

console.log("PASS Dark Mode feature, toggle button, keyboard shortcut, and persistence verified successfully");
